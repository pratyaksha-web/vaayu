"""Statistical Corrector and Feature Engineering for 72-hour Air Quality Forecasts in VAAYU.

Implements:
1. Target extraction: observed hourly PM2.5, PM10, O3, NO2 from CPCB/OpenAQ loaders.
2. Leakage-free feature matrix generation:
   - For issue time T_issue and lead time h in 1..72:
     * Driver forecast at valid time (T_valid = T_issue + h): pm2_5, pm10, ozone, nitrogen_dioxide
     * Meteorological drivers at valid time: temperature_2m, relative_humidity_2m, wind_speed_10m,
       wind_direction_10m, boundary_layer_height, surface_pressure
     * Ventilation index at valid time: BLH * wind_speed_10m (in m * m/s)
     * Astronomical/temporal features: hour of day, hour_sin/cos, day of year, doy_sin/cos
     * Lead time h in 1..72
     * Last observed values at issue time T_issue (persistence features: last_obs_pm25, etc.)
       Strictly using only observations available at or before T_issue.
3. Model: LightGBM quantile regression at 10%, 50%, 90% (p10, p50, p90) for each pollutant.
   Enforces monotonic quantile constraints: p10 <= p50 <= p90 and non-negative concentrations.
4. Time-based split by winter:
   - Training winters: earlier seasons (2020-2021, 2021-2022, 2023-2024)
   - Held-out test winter: most recent season (2025-2026: Oct 1, 2025 - Feb 28, 2026)
   - Zero leakage: no test winter rows in training.
5. Saves trained models and metadata.json to models/ (gitignored).
"""

from datetime import date, datetime, timedelta, timezone
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

from fetch_drivers import (
    DEFAULT_STATIONS_CSV,
    FEATURE_SOURCES,
    fetch_historical_drivers,
    load_stations,
)
from load_cpcb import load_single_csv

MODELS_DIR = Path("models")
PROCESSED_OPENAQ_CSV = Path("data/processed/openaq_hourly.csv")
RAW_CPCB_DIR = Path("data/raw/cpcb_unverified")

POLLUTANTS = ["pm25", "pm10", "o3", "no2"]
QUANTILES = [0.10, 0.50, 0.90]

TRAIN_WINTERS = [
    ("2020-10-01", "2021-02-28"),
    ("2021-10-01", "2022-02-28"),
    ("2023-10-01", "2024-02-29"),
]
TEST_WINTER = ("2025-10-01", "2026-02-28")

FEATURE_COLUMNS = [
    "lead_h",
    "driver_pm25",
    "driver_pm10",
    "driver_o3",
    "driver_no2",
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "boundary_layer_height",
    "surface_pressure",
    "ventilation_index",
    "hour",
    "hour_sin",
    "hour_cos",
    "day_of_year",
    "doy_sin",
    "doy_cos",
    "last_obs_pm25",
    "last_obs_pm10",
    "last_obs_o3",
    "last_obs_no2",
]


def load_all_observations(
    openaq_csv: Union[str, Path] = PROCESSED_OPENAQ_CSV,
    cpcb_dir: Union[str, Path] = RAW_CPCB_DIR,
) -> pd.DataFrame:
    """Load combined observations from OpenAQ and CPCB sources with standardized IST timestamps.

    Columns returned:
    ['timestamp', 'station_id', 'pm25', 'pm10', 'no2', 'o3']
    """
    openaq_path = Path(openaq_csv)
    if not openaq_path.exists():
        raise FileNotFoundError(f"OpenAQ observations file not found: {openaq_path.resolve()}")

    df_openaq = pd.read_csv(openaq_path)
    df_openaq["timestamp"] = pd.to_datetime(df_openaq["Timestamp"])
    if df_openaq["timestamp"].dt.tz is None:
        df_openaq["timestamp"] = df_openaq["timestamp"].dt.tz_localize("Asia/Kolkata")
    else:
        df_openaq["timestamp"] = df_openaq["timestamp"].dt.tz_convert("Asia/Kolkata")

    df_openaq = df_openaq.rename(columns={"station": "station_id"})
    obs_cols = ["timestamp", "station_id", "pm25", "pm10", "no2", "o3"]
    for c in obs_cols:
        if c not in df_openaq.columns:
            df_openaq[c] = np.nan

    obs_df = df_openaq[obs_cols].copy()

    # If Anand Vihar CPCB records exist, merge NO2 and O3 observations
    cpcb_path = Path(cpcb_dir)
    if cpcb_path.exists():
        av_files = list(cpcb_path.glob("*anand_vihar*.csv"))
        if av_files:
            cpcb_dfs = [load_single_csv(f) for f in av_files]
            df_cpcb = pd.concat(cpcb_dfs, ignore_index=True)
            df_cpcb["station_id"] = "anand_vihar_new_delhi_dpcc"
            df_cpcb["timestamp"] = df_cpcb["Timestamp"]
            if df_cpcb["timestamp"].dt.tz is None:
                df_cpcb["timestamp"] = df_cpcb["timestamp"].dt.tz_localize("Asia/Kolkata")
            else:
                df_cpcb["timestamp"] = df_cpcb["timestamp"].dt.tz_convert("Asia/Kolkata")

            # Merge CPCB NO2 and O3 for Anand Vihar
            merged = pd.merge(
                obs_df,
                df_cpcb[["timestamp", "station_id", "no2", "o3"]],
                on=["timestamp", "station_id"],
                how="outer",
                suffixes=("", "_cpcb"),
            )
            merged["no2"] = merged["no2"].fillna(merged["no2_cpcb"])
            merged["o3"] = merged["o3"].fillna(merged["o3_cpcb"])
            obs_df = merged[obs_cols].copy()

    obs_df = obs_df.drop_duplicates(subset=["timestamp", "station_id"])
    return obs_df.sort_values(["station_id", "timestamp"]).reset_index(drop=True)


def load_drivers_for_seasons(
    stations_df: pd.DataFrame,
    seasons: List[Tuple[str, str]],
) -> pd.DataFrame:
    """Load and concatenate historical Open-Meteo drivers for specified seasons and stations."""
    all_dfs = []
    for s_start, s_end in seasons:
        for _, row in stations_df.iterrows():
            st_id = str(row["id"])
            df_season = fetch_historical_drivers(
                station_id=st_id,
                lat=float(row["lat"]),
                lon=float(row["lon"]),
                start_date=s_start,
                end_date=s_end,
            )
            all_dfs.append(df_season)

    if not all_dfs:
        return pd.DataFrame()

    combined = pd.concat(all_dfs, ignore_index=True)
    combined = combined.drop_duplicates(subset=["timestamp", "station_id"])
    return combined.sort_values(["station_id", "timestamp"]).reset_index(drop=True)


def _to_float(v: Any, default: float = np.nan) -> float:
    """Safely convert value to float or return default."""
    if v is None or pd.isna(v):
        return default
    try:
        return float(v)
    except (ValueError, TypeError):
        return default


def build_samples_for_issue_time(
    issue_time: pd.Timestamp,
    station_id: str,
    obs_map: Dict[Tuple[str, pd.Timestamp], Dict[str, float]],
    driver_map: Dict[Tuple[str, pd.Timestamp], Dict[str, float]],
    max_lead_h: int = 72,
) -> List[Dict[str, Any]]:
    """Assemble forecast feature rows for a single issue time and lead horizons h=1..max_lead_h.

    Zero-leakage guarantee:
    - Persistence features use strictly the latest available observation at or before issue_time.
    - Future observations at (issue_time + h) are never accessed for features.
    """
    # 1. Lookup persistence observations at or before issue_time (within 24h lookback)
    last_obs = {p: np.nan for p in POLLUTANTS}
    for lookback in range(25):
        t_check = issue_time - pd.Timedelta(hours=lookback)
        key = (station_id, t_check)
        if key in obs_map:
            obs_rec = obs_map[key]
            for p in POLLUTANTS:
                if pd.isna(last_obs[p]) and not pd.isna(obs_rec.get(p)):
                    last_obs[p] = float(obs_rec[p])
        if all(not pd.isna(v) for v in last_obs.values()):
            break

    samples = []
    for h in range(1, max_lead_h + 1):
        valid_time = issue_time + pd.Timedelta(hours=h)
        driver_key = (station_id, valid_time)
        if driver_key not in driver_map:
            continue

        d_rec = driver_map[driver_key]

        # Meteorological and driver variables
        ws = _to_float(d_rec.get("wind_speed_10m"), 0.0)
        blh = _to_float(d_rec.get("boundary_layer_height"), 0.0)
        ws_ms = ws / 3.6  # convert km/h to m/s
        ventilation_index = blh * ws_ms

        hr = valid_time.hour
        doy = valid_time.dayofyear
        hr_rad = 2.0 * math.pi * hr / 24.0
        doy_rad = 2.0 * math.pi * doy / 365.25

        row = {
            "issue_time": issue_time,
            "valid_time": valid_time,
            "station_id": station_id,
            "lead_h": h,
            "driver_pm25": _to_float(d_rec.get("pm2_5")),
            "driver_pm10": _to_float(d_rec.get("pm10")),
            "driver_o3": _to_float(d_rec.get("ozone")),
            "driver_no2": _to_float(d_rec.get("nitrogen_dioxide")),
            "temperature_2m": _to_float(d_rec.get("temperature_2m")),
            "relative_humidity_2m": _to_float(d_rec.get("relative_humidity_2m")),
            "wind_speed_10m": ws,
            "wind_direction_10m": _to_float(d_rec.get("wind_direction_10m")),
            "boundary_layer_height": blh,
            "surface_pressure": _to_float(d_rec.get("surface_pressure")),
            "ventilation_index": ventilation_index,
            "hour": hr,
            "hour_sin": math.sin(hr_rad),
            "hour_cos": math.cos(hr_rad),
            "day_of_year": doy,
            "doy_sin": math.sin(doy_rad),
            "doy_cos": math.cos(doy_rad),
            "last_obs_pm25": last_obs["pm25"],
            "last_obs_pm10": last_obs["pm10"],
            "last_obs_o3": last_obs["o3"],
            "last_obs_no2": last_obs["no2"],
        }

        # Observed targets at valid time (only for evaluation/training)
        obs_key = (station_id, valid_time)
        if obs_key in obs_map:
            target_rec = obs_map[obs_key]
            for p in POLLUTANTS:
                row[f"target_{p}"] = float(target_rec[p]) if not pd.isna(target_rec.get(p)) else np.nan
        else:
            for p in POLLUTANTS:
                row[f"target_{p}"] = np.nan

        samples.append(row)

    return samples


def build_dataset_for_seasons(
    stations_df: pd.DataFrame,
    seasons: List[Tuple[str, str]],
    obs_df: pd.DataFrame,
    issue_step_hours: int = 12,
    max_lead_h: int = 72,
) -> pd.DataFrame:
    """Construct full feature and target dataset for a list of seasons."""
    drivers_df = load_drivers_for_seasons(stations_df, seasons)

    # Build quick lookup dictionaries using to_dict('records') for extreme speed
    obs_recs = obs_df.to_dict("records")
    obs_map: Dict[Tuple[str, pd.Timestamp], Dict[str, float]] = {
        (str(r["station_id"]), r["timestamp"]): {p: r[p] for p in POLLUTANTS}
        for r in obs_recs
    }

    driver_recs = drivers_df.to_dict("records")
    driver_map: Dict[Tuple[str, pd.Timestamp], Dict[str, float]] = {
        (str(r["station_id"]), r["timestamp"]): r
        for r in driver_recs
    }

    station_ids = stations_df["id"].astype(str).tolist()
    all_samples: List[Dict[str, Any]] = []

    for s_start, s_end in seasons:
        start_ts = pd.Timestamp(f"{s_start} 00:00:00", tz="Asia/Kolkata")
        end_ts = pd.Timestamp(f"{s_end} 23:00:00", tz="Asia/Kolkata")

        # Step through issue times
        curr_issue = start_ts
        while curr_issue + pd.Timedelta(hours=max_lead_h) <= end_ts:
            for st_id in station_ids:
                samples = build_samples_for_issue_time(
                    issue_time=curr_issue,
                    station_id=st_id,
                    obs_map=obs_map,
                    driver_map=driver_map,
                    max_lead_h=max_lead_h,
                )
                all_samples.extend(samples)
            curr_issue += pd.Timedelta(hours=issue_step_hours)

    if not all_samples:
        return pd.DataFrame()

    return pd.DataFrame(all_samples)


def train_quantile_models(
    train_df: pd.DataFrame,
    pollutants: Sequence[str] = POLLUTANTS,
    quantiles: Sequence[float] = QUANTILES,
    n_estimators: int = 80,
    random_state: int = 42,
) -> Dict[str, Dict[float, lgb.LGBMRegressor]]:
    """Train LightGBM quantile regression models for each pollutant and quantile level.

    Returns dict mapping pollutant -> {quantile: model}.
    """
    models: Dict[str, Dict[float, lgb.LGBMRegressor]] = {}

    for pol in pollutants:
        target_col = f"target_{pol}"
        # Filter to rows with valid target
        valid_rows = train_df.dropna(subset=[target_col])
        if len(valid_rows) < 50:
            print(f"Warning: Pollutant '{pol}' has only {len(valid_rows)} valid training rows. Using available.")

        X = valid_rows[FEATURE_COLUMNS]
        y = valid_rows[target_col]

        models[pol] = {}
        for q in quantiles:
            model = lgb.LGBMRegressor(
                objective="quantile",
                alpha=q,
                n_estimators=n_estimators,
                learning_rate=0.08,
                num_leaves=31,
                min_child_samples=20,
                random_state=random_state,
                verbose=-1,
                n_jobs=-1,
            )
            model.fit(X, y)
            models[pol][q] = model

    return models


def predict_quantiles(
    models: Dict[str, Dict[float, lgb.LGBMRegressor]],
    X: pd.DataFrame,
    enforce_monotonic: bool = True,
) -> Dict[str, Dict[str, np.ndarray]]:
    """Generate p10, p50, p90 predictions for each pollutant with monotonic ordering and non-negativity."""
    results: Dict[str, Dict[str, np.ndarray]] = {}

    for pol, q_models in models.items():
        q10_raw = q_models[0.10].predict(X[FEATURE_COLUMNS])
        q50_raw = q_models[0.50].predict(X[FEATURE_COLUMNS])
        q90_raw = q_models[0.90].predict(X[FEATURE_COLUMNS])

        if enforce_monotonic:
            # Enforce non-negativity and p10 <= p50 <= p90
            p10 = np.maximum(0.0, q10_raw)
            p50 = np.maximum(p10, q50_raw)
            p90 = np.maximum(p50, q90_raw)
        else:
            p10, p50, p90 = q10_raw, q50_raw, q90_raw

        results[pol] = {
            "p10": p10,
            "p50": p50,
            "p90": p90,
        }

    return results


def save_models(
    models: Dict[str, Dict[float, lgb.LGBMRegressor]],
    metadata: Dict[str, Any],
    models_dir: Union[str, Path] = MODELS_DIR,
) -> Path:
    """Save trained LightGBM models and metadata.json to models_dir (gitignored)."""
    out_dir = Path(models_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for pol, q_models in models.items():
        for q, model in q_models.items():
            fname = f"{pol}_q{int(round(q * 100))}.joblib"
            joblib.dump(model, out_dir / fname)

    meta_path = out_dir / "metadata.json"
    with open(meta_path, "w", encoding="utf-8") as fp:
        json.dump(metadata, fp, indent=2)

    return out_dir


def load_models(
    models_dir: Union[str, Path] = MODELS_DIR,
) -> Tuple[Dict[str, Dict[float, lgb.LGBMRegressor]], Dict[str, Any]]:
    """Load saved LightGBM quantile models and metadata from disk."""
    m_dir = Path(models_dir)
    meta_path = m_dir / "metadata.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"Model metadata not found: {meta_path.resolve()}")

    with open(meta_path, "r", encoding="utf-8") as fp:
        metadata = json.load(fp)

    models: Dict[str, Dict[float, lgb.LGBMRegressor]] = {}
    for pol in metadata["pollutants"]:
        models[pol] = {}
        for q in metadata["quantiles"]:
            fname = f"{pol}_q{int(round(q * 100))}.joblib"
            path = m_dir / fname
            if not path.exists():
                raise FileNotFoundError(f"Model file not found: {path.resolve()}")
            models[pol][q] = joblib.load(path)

    return models, metadata


def train_and_evaluate_corrector(
    stations_csv: Union[str, Path] = DEFAULT_STATIONS_CSV,
    models_dir: Union[str, Path] = MODELS_DIR,
    issue_step_hours: int = 24,
) -> Tuple[Dict[str, Dict[float, lgb.LGBMRegressor]], Dict[str, Any], pd.DataFrame]:
    """Execute complete training workflow on earlier winters and return models, metadata, and test_df."""
    stations = load_stations(stations_csv)
    print("Loading all available observations from OpenAQ and CPCB...")
    obs_df = load_all_observations()

    print(f"\nBuilding training dataset across earlier winters: {TRAIN_WINTERS}...")
    train_df = build_dataset_for_seasons(
        stations_df=stations,
        seasons=TRAIN_WINTERS,
        obs_df=obs_df,
        issue_step_hours=issue_step_hours,
        max_lead_h=72,
    )
    print(f"Training dataset assembled: {len(train_df)} rows.")

    # Strict check: Assert NO test winter data leakage
    test_year_start = int(TEST_WINTER[0][:4])
    assert not any(train_df["valid_time"].dt.year == test_year_start), (
        f"Data leakage detected! Training set contains test year {test_year_start}."
    )

    print("\nTraining quantile gradient boosting models (p10, p50, p90) per pollutant...")
    models = train_quantile_models(train_df)

    metadata = {
        "model_version": "1.0.0",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "model_type": "LightGBM Quantile Regressors (p10, p50, p90)",
        "pollutants": POLLUTANTS,
        "quantiles": QUANTILES,
        "feature_columns": FEATURE_COLUMNS,
        "feature_sources": FEATURE_SOURCES,
        "training_winters": [f"{s[0]} to {s[1]}" for s in TRAIN_WINTERS],
        "test_winter": f"{TEST_WINTER[0]} to {TEST_WINTER[1]}",
        "training_rows": len(train_df),
        "stations": stations["id"].tolist(),
    }

    save_models(models, metadata, models_dir=models_dir)
    print(f"Saved trained models and metadata to {models_dir}/")

    print(f"\nBuilding held-out test dataset for winter {TEST_WINTER}...")
    test_df = build_dataset_for_seasons(
        stations_df=stations,
        seasons=[TEST_WINTER],
        obs_df=obs_df,
        issue_step_hours=issue_step_hours,
        max_lead_h=72,
    )
    print(f"Held-out test dataset assembled: {len(test_df)} rows.")

    return models, metadata, test_df



# Driver pollutant column mappings
DRIVER_POLLUTANT_MAP: Dict[str, str] = {
    "pm25": "pm2_5",
    "pm10": "pm10",
    "o3": "ozone",
    "no2": "nitrogen_dioxide",
}

# Empirical blend weights chosen on training data by lead bucket
DEFAULT_BLEND_WEIGHTS: Dict[str, Dict[str, float]] = {
    "pm25": {"1-24h": 0.50, "25-48h": 0.25, "49-72h": 0.10},
    "pm10": {"1-24h": 0.50, "25-48h": 0.25, "49-72h": 0.10},
    "no2": {"1-24h": 0.80, "25-48h": 0.75, "49-72h": 0.70},
    "o3": {"1-24h": 1.00, "25-48h": 1.00, "49-72h": 1.00},
}


def compute_rolling_bias_series(
    obs_df: pd.DataFrame,
    drivers_df: pd.DataFrame,
    stations_df: pd.DataFrame,
    rolling_window: str = "7D",
    min_periods: int = 6,
) -> Dict[str, Dict[str, pd.Series]]:
    """Compute trailing rolling mean of (obs - cams_driver) per station and pollutant.

    Uses pandas rolling with closed='right' to guarantee zero future data leakage.
    At any issue_time T, calling series.asof(T) retrieves the trailing window
    mean of observations strictly available at or before T.
    """
    biases: Dict[str, Dict[str, pd.Series]] = {}
    for st_id in stations_df["id"]:
        st_obs = obs_df[obs_df["station_id"] == st_id].set_index("timestamp").sort_index()
        st_drv = drivers_df[drivers_df["station_id"] == st_id].set_index("timestamp").sort_index()
        biases[st_id] = {}
        for p in POLLUTANTS:
            drv_col = DRIVER_POLLUTANT_MAP.get(p, p)
            if drv_col in st_drv.columns and p in st_obs.columns:
                aligned = pd.DataFrame({"obs": st_obs[p], "cams": st_drv[drv_col]}).dropna()
                if len(aligned) > 0:
                    residual = aligned["obs"] - aligned["cams"]
                    biases[st_id][p] = residual.rolling(rolling_window, min_periods=min_periods).mean()
                else:
                    biases[st_id][p] = pd.Series(dtype=float)
            else:
                biases[st_id][p] = pd.Series(dtype=float)
    return biases


def get_rolling_bias_at_time(
    bias_series: pd.Series,
    issue_time: pd.Timestamp,
) -> float:
    """Safely lookup trailing rolling bias at issue time T, falling back to 0.0 if missing."""
    if bias_series is None or len(bias_series) == 0:
        return 0.0
    val = bias_series.asof(issue_time)
    if pd.isna(val):
        return 0.0
    return float(val)


def compute_cams_bc(
    cams_driver: Union[float, np.ndarray],
    bias_7d: Union[float, np.ndarray],
) -> Union[float, np.ndarray]:
    """Compute non-negative bias-corrected CAMS prediction (CAMS + trailing 7d bias)."""
    return np.maximum(0.0, cams_driver + bias_7d)


def compute_lead_blend(
    persistence_val: Union[float, np.ndarray],
    cams_bc_val: Union[float, np.ndarray],
    pollutant: str,
    lead_h: Union[int, np.ndarray],
    weights_dict: Optional[Dict[str, Dict[str, float]]] = None,
) -> Union[float, np.ndarray]:
    """Compute lead-aware blend of persistence and bias-corrected CAMS."""
    w_map = weights_dict or DEFAULT_BLEND_WEIGHTS
    pol_w = w_map.get(pollutant, {"1-24h": 0.5, "25-48h": 0.25, "49-72h": 0.1})

    if isinstance(lead_h, (int, np.integer)):
        if lead_h <= 24:
            w = pol_w["1-24h"]
        elif lead_h <= 48:
            w = pol_w["25-48h"]
        else:
            w = pol_w["49-72h"]
        if pd.isna(persistence_val):
            return cams_bc_val
        return float(w * persistence_val + (1.0 - w) * cams_bc_val)

    # Vectorized
    lead_arr = np.asarray(lead_h)
    w_arr = np.where(
        lead_arr <= 24,
        pol_w["1-24h"],
        np.where(lead_arr <= 48, pol_w["25-48h"], pol_w["49-72h"]),
    )
    pers_arr = np.asarray(persistence_val)
    cams_arr = np.asarray(cams_bc_val)
    return np.where(np.isnan(pers_arr), cams_arr, w_arr * pers_arr + (1.0 - w_arr) * cams_arr)


if __name__ == "__main__":
    train_and_evaluate_corrector()

