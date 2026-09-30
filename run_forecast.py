"""Produce 72-Hour Air Quality and AQI Forecasts for VAAYU.

Generates hourly forecasts for PM2.5, PM10, O3, and NO2 across 72 hours (h=1..72)
for each station with p10, p50, and p90 quantiles.

Default Model: Rolling 7-day bias-corrected CAMS for PM2.5 and PM10 (p50), with
p10/p90 derived from empirical quantiles of trailing 7-day residuals (obs - CAMS)
using strictly data available at or before issue time. O3 and NO2 are produced via
lead-aware blending of persistence and bias-corrected CAMS (experimental, single-station).
LightGBM quantile models remain available behind the `--model lgbm` flag.

Staleness Guard:
Bias correction is applied ONLY if at least 6 valid observation hours exist within
the 7 days immediately preceding issue_time. If fewer than 6 valid hours exist,
the guard marks "bias_correction": "unavailable_no_recent_obs", falls back to raw CAMS
(p50 = CAMS), applies a wide lead-dependent default band, and logs the age of the newest
available observation.

Replay Mode:
When an issue time with available forward observations is evaluated (or via `--replay`),
actual observed values for the matching valid times are written to data/forecast_replay.json.

Uncertainty Heuristic:
The p10/p90 prediction interval widens with lead horizon via the scaling factor
(1.0 + 0.004 * lead_h), reflecting increasing atmospheric divergence over time.

Outputs:
- data/forecast.json (operational forecast)
- data/forecast_replay.json (when replaying historical issue times with observed ground truth)
"""

import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except Exception:
        pass

import numpy as np
import pandas as pd

import aqi
from fetch_drivers import (
    DEFAULT_STATIONS_CSV,
    fetch_forecast_drivers,
    load_stations,
)
from forecast_model import (
    DEFAULT_BLEND_WEIGHTS,
    DRIVER_POLLUTANT_MAP,
    FEATURE_COLUMNS,
    MODELS_DIR,
    POLLUTANTS,
    TEST_WINTER,
    _to_float,
    build_samples_for_issue_time,
    compute_cams_bc,
    compute_lead_blend,
    load_all_observations,
    load_drivers_for_seasons,
    load_models,
    predict_quantiles,
)

DEFAULT_OUTPUT_JSON = Path("data/forecast.json")
DEFAULT_REPLAY_JSON = Path("data/forecast_replay.json")
SITE_DATA_JSON = Path("site/data.json")


def sanitize_for_json(obj: Any) -> Any:
    """Recursively convert float NaNs, infinities, and numpy scalars to JSON-safe types."""
    if isinstance(obj, dict):
        return {str(k): sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    elif isinstance(obj, (float, np.floating)):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return round(float(obj), 2)
    elif isinstance(obj, (int, np.integer)):
        return int(obj)
    elif isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    elif pd.isna(obj):
        return None
    return obj


def compute_p_severe_for_lead(
    pm25_quantiles: Dict[str, float],
    pm10_quantiles: Dict[str, float],
    n_samples: int = 100,
    seed: int = 42,
    breakpoints_df: Optional[pd.DataFrame] = None,
) -> float:
    """Compute P(Severe AQI) at a specific lead horizon using quantile spread and aqi.p_severe.

    Methodology:
    Draws joint samples from an empirical Gaussian centered at p50 with standard deviation
    estimated from the 80% interval spread (p90 - p10) / 2.563, bounded below by 5.0.
    Reuses the official aqi.p_severe() function to compute the fraction of joint samples
    with AQI > 400 without an isotonic calibration step (uncalibrated risk indicator).
    """
    rng = np.random.RandomState(seed)

    p10_25 = pm25_quantiles.get("p10", 0.0)
    p50_25 = pm25_quantiles.get("p50", 0.0)
    p90_25 = pm25_quantiles.get("p90", 0.0)

    p10_10 = pm10_quantiles.get("p10", 0.0)
    p50_10 = pm10_quantiles.get("p50", 0.0)
    p90_10 = pm10_quantiles.get("p90", 0.0)

    std_25 = max(5.0, (p90_25 - p10_25) / 2.563)
    std_10 = max(5.0, (p90_10 - p10_10) / 2.563)

    s25 = np.maximum(0.0, rng.normal(p50_25, std_25, n_samples))
    s10 = np.maximum(0.0, rng.normal(p50_10, std_10, n_samples))

    return round(float(aqi.p_severe(s25, s10, breakpoints_df=breakpoints_df)), 4)


def convert_pm_to_aqi(
    pm25_val: float,
    pm10_val: float,
    breakpoints_df: Optional[pd.DataFrame] = None,
) -> Tuple[Optional[float], str]:
    """Convert joint PM2.5 and PM10 concentrations to official CPCB AQI and category."""
    readings = {}
    if pm25_val is not None and not pd.isna(pm25_val):
        readings["PM2.5"] = float(pm25_val)
    if pm10_val is not None and not pd.isna(pm10_val):
        readings["PM10"] = float(pm10_val)

    if not readings:
        return None, "Unknown"

    aqi_val = aqi.aqi(readings, breakpoints_df=breakpoints_df)
    cat = aqi.category(aqi_val, breakpoints_df=breakpoints_df)
    return aqi_val, cat


def inspect_station_staleness_and_residuals(
    station_id: str,
    issue_time: pd.Timestamp,
    obs_df: pd.DataFrame,
    hist_drivers_df: Optional[pd.DataFrame] = None,
    min_periods: int = 6,
) -> Tuple[str, Optional[float], int, Dict[str, Dict[str, float]]]:
    """Inspect trailing observation staleness and compute 7-day residual quantiles.

    Rules:
    - Strictly inspects observations available at or before issue_time.
    - Requires at least min_periods (6) valid hours in [issue_time - 7 days, issue_time].
    - NEVER falls back to an older observation window.
    - If valid hours < min_periods, status is 'unavailable_no_recent_obs'.
    - Also calculates the age of the newest observation available at or before issue_time.

    Returns:
    - status: 'applied' or 'unavailable_no_recent_obs'
    - newest_obs_age_hours: age in hours from issue_time to newest observation (or None)
    - valid_obs_count_7d: number of valid PM2.5 hours in the 7-day window
    - residual_stats: dict of {pollutant: {'mean', 'p10', 'p50', 'p90'}}
    """
    st_obs = obs_df[(obs_df["station_id"] == station_id) & (obs_df["timestamp"] <= issue_time)]
    newest_obs_time = st_obs.dropna(subset=["pm25"])["timestamp"].max() if len(st_obs) > 0 else None
    if pd.isna(newest_obs_time):
        newest_obs_time = st_obs["timestamp"].max() if len(st_obs) > 0 else None

    age_hours = (
        round((issue_time - newest_obs_time).total_seconds() / 3600.0, 1)
        if pd.notna(newest_obs_time) else None
    )

    # Strictly 7-day trailing window before issue_time
    w_start = issue_time - pd.Timedelta(days=7)
    recent_obs = st_obs[st_obs["timestamp"] >= w_start]
    valid_count_pm25 = int(recent_obs["pm25"].notna().sum()) if len(recent_obs) > 0 else 0

    if valid_count_pm25 < min_periods:
        # Guard fails: zero fallback to older windows
        status = "unavailable_no_recent_obs"
        empty_stats = {p: {"mean": 0.0, "p10": 0.0, "p50": 0.0, "p90": 0.0} for p in POLLUTANTS}
        return status, age_hours, valid_count_pm25, empty_stats

    # Guard passed: compute trailing 7-day residuals
    status = "applied"
    recent_obs_idx = recent_obs.set_index("timestamp").sort_index()

    if hist_drivers_df is not None and len(hist_drivers_df) > 0:
        st_drv = hist_drivers_df[
            (hist_drivers_df["station_id"] == station_id)
            & (hist_drivers_df["timestamp"] >= w_start)
            & (hist_drivers_df["timestamp"] <= issue_time)
        ].set_index("timestamp").sort_index()
    else:
        st_drv = pd.DataFrame()

    stats = {}
    for p in POLLUTANTS:
        drv_col = DRIVER_POLLUTANT_MAP.get(p, p)
        if drv_col in st_drv.columns and p in recent_obs_idx.columns:
            aligned = pd.DataFrame({"obs": recent_obs_idx[p], "cams": st_drv[drv_col]}).dropna()
            if len(aligned) >= min_periods:
                res = aligned["obs"] - aligned["cams"]
                stats[p] = {
                    "mean": float(np.mean(res)),
                    "p10": float(np.percentile(res, 10)),
                    "p50": float(np.median(res)),
                    "p90": float(np.percentile(res, 90)),
                }
            else:
                stats[p] = {"mean": 0.0, "p10": -15.0, "p50": 0.0, "p90": 15.0}
        else:
            stats[p] = {"mean": 0.0, "p10": -15.0, "p50": 0.0, "p90": 15.0}

    return status, age_hours, valid_count_pm25, stats


def generate_forecast_for_station(
    station_id: str,
    station_name: str,
    lat: float,
    lon: float,
    issue_time: pd.Timestamp,
    models: Optional[Dict[str, Dict[float, Any]]] = None,
    obs_df: Optional[pd.DataFrame] = None,
    driver_df: Optional[pd.DataFrame] = None,
    hist_drivers_df: Optional[pd.DataFrame] = None,
    breakpoints_df: Optional[pd.DataFrame] = None,
    max_lead_h: int = 72,
    model_type: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate 72-hour forecast dictionary for a single station."""
    if issue_time.tz is None:
        issue_time = issue_time.tz_localize("Asia/Kolkata")
    else:
        issue_time = issue_time.tz_convert("Asia/Kolkata")

    # Determine model type
    if model_type is None:
        model_type = "lgbm" if (models is not None and len(models) > 0) else "blend"

    if obs_df is None:
        obs_df = load_all_observations()

    # 1. Fetch live driver forecast if not supplied
    if driver_df is None:
        driver_df = fetch_forecast_drivers(
            station_id=station_id,
            lat=lat,
            lon=lon,
            forecast_days=4,
        )

    # 2. Build quick lookup maps
    obs_recs = obs_df[obs_df["station_id"] == station_id].to_dict("records")
    obs_map = {(station_id, r["timestamp"]): {p: r[p] for p in POLLUTANTS} for r in obs_recs}

    driver_recs = driver_df.to_dict("records")
    driver_map = {(station_id, r["timestamp"]): r for r in driver_recs}

    # 3. Build 72-hour feature rows
    samples = build_samples_for_issue_time(
        issue_time=issue_time,
        station_id=station_id,
        obs_map=obs_map,
        driver_map=driver_map,
        max_lead_h=max_lead_h,
    )

    df_samples = pd.DataFrame(samples)
    if len(df_samples) == 0:
        raise ValueError(f"No driver forecast samples available for station {station_id} at issue time {issue_time}")

    df_samples = df_samples.sort_values("lead_h").head(max_lead_h)

    # 4. Predict quantiles according to chosen model and staleness guard
    if model_type == "lgbm":
        if models is None:
            models, _ = load_models(MODELS_DIR)
        preds = predict_quantiles(models, df_samples[FEATURE_COLUMNS], enforce_monotonic=True)
        bias_status = "not_applicable_lgbm"
        obs_age_h = None
        obs_count_7d = 0
    else:
        # Default: Rolling 7-day bias-corrected CAMS with Staleness Guard
        bias_status, obs_age_h, obs_count_7d, residual_stats = inspect_station_staleness_and_residuals(
            station_id=station_id,
            issue_time=issue_time,
            obs_df=obs_df,
            hist_drivers_df=hist_drivers_df,
        )

    hourly_records = []
    p25_lead_map = {}
    p10_lead_map = {}

    for idx, row in df_samples.iterrows():
        lead_h = int(row["lead_h"])
        v_time = row["valid_time"].isoformat()
        # Heuristic uncertainty expansion with lead horizon: 1.0 + 0.004 * lead_h
        lead_factor = 1.0 + 0.004 * lead_h

        if model_type == "lgbm":
            pm25_q = {
                "p10": round(float(preds["pm25"]["p10"][idx]), 1),
                "p50": round(float(preds["pm25"]["p50"][idx]), 1),
                "p90": round(float(preds["pm25"]["p90"][idx]), 1),
            }
            pm10_q = {
                "p10": round(float(preds["pm10"]["p10"][idx]), 1),
                "p50": round(float(preds["pm10"]["p50"][idx]), 1),
                "p90": round(float(preds["pm10"]["p90"][idx]), 1),
            }
            o3_q = {
                "p10": round(float(preds["o3"]["p10"][idx]), 1),
                "p50": round(float(preds["o3"]["p50"][idx]), 1),
                "p90": round(float(preds["o3"]["p90"][idx]), 1),
            }
            no2_q = {
                "p10": round(float(preds["no2"]["p10"][idx]), 1),
                "p50": round(float(preds["no2"]["p50"][idx]), 1),
                "p90": round(float(preds["no2"]["p90"][idx]), 1),
            }
        elif bias_status == "applied":
            # --- GUARD PASSED: 7-day rolling bias-corrected CAMS with lead-widening residual band ---
            cams_25 = float(row["driver_pm25"])
            r25 = residual_stats["pm25"]
            p50_25 = max(0.0, cams_25 + r25["mean"])
            hw_low_25 = max(5.0, r25["mean"] - r25["p10"]) * lead_factor
            hw_high_25 = max(5.0, r25["p90"] - r25["mean"]) * lead_factor
            p10_25 = max(0.0, p50_25 - hw_low_25)
            p90_25 = p50_25 + hw_high_25
            p10_25 = min(p10_25, p50_25)
            pm25_q = {"p10": round(p10_25, 1), "p50": round(p50_25, 1), "p90": round(p90_25, 1)}

            cams_10 = float(row["driver_pm10"])
            r10 = residual_stats["pm10"]
            p50_10 = max(0.0, cams_10 + r10["mean"])
            hw_low_10 = max(10.0, r10["mean"] - r10["p10"]) * lead_factor
            hw_high_10 = max(10.0, r10["p90"] - r10["mean"]) * lead_factor
            p10_10 = max(0.0, p50_10 - hw_low_10)
            p90_10 = p50_10 + hw_high_10
            p10_10 = min(p10_10, p50_10)
            pm10_q = {"p10": round(p10_10, 1), "p50": round(p50_10, 1), "p90": round(p90_10, 1)}

            # O3: Lead-blend with lead-scaled spread
            last_obs_o3 = row["last_obs_o3"]
            cams_o3 = float(row["driver_o3"])
            r_o3 = residual_stats["o3"]
            cams_bc_o3 = max(0.0, cams_o3 + r_o3["mean"])
            w_o3 = DEFAULT_BLEND_WEIGHTS["o3"]["1-24h"] if lead_h <= 24 else (
                DEFAULT_BLEND_WEIGHTS["o3"]["25-48h"] if lead_h <= 48 else DEFAULT_BLEND_WEIGHTS["o3"]["49-72h"]
            )
            p50_o3 = cams_bc_o3 if pd.isna(last_obs_o3) else (w_o3 * float(last_obs_o3) + (1.0 - w_o3) * cams_bc_o3)
            spread_o3 = max(2.0, (r_o3["p90"] - r_o3["p10"]) / 2.0) * lead_factor
            p10_o3 = max(0.0, p50_o3 - spread_o3)
            p90_o3 = p50_o3 + spread_o3
            o3_q = {"p10": round(p10_o3, 1), "p50": round(p50_o3, 1), "p90": round(p90_o3, 1)}

            # NO2: Lead-blend with lead-scaled spread
            last_obs_no2 = row["last_obs_no2"]
            cams_no2 = float(row["driver_no2"])
            r_no2 = residual_stats["no2"]
            cams_bc_no2 = max(0.0, cams_no2 + r_no2["mean"])
            w_no2 = DEFAULT_BLEND_WEIGHTS["no2"]["1-24h"] if lead_h <= 24 else (
                DEFAULT_BLEND_WEIGHTS["no2"]["25-48h"] if lead_h <= 48 else DEFAULT_BLEND_WEIGHTS["no2"]["49-72h"]
            )
            p50_no2 = cams_bc_no2 if pd.isna(last_obs_no2) else (w_no2 * float(last_obs_no2) + (1.0 - w_no2) * cams_bc_no2)
            spread_no2 = max(3.0, (r_no2["p90"] - r_no2["p10"]) / 2.0) * lead_factor
            p10_no2 = max(0.0, p50_no2 - spread_no2)
            p90_no2 = p50_no2 + spread_no2
            no2_q = {"p10": round(p10_no2, 1), "p50": round(p50_no2, 1), "p90": round(p90_no2, 1)}
        else:
            # --- GUARD FAILED: Output raw CAMS with wide lead-dependent default band ---
            cams_25 = float(row["driver_pm25"])
            hw_25 = max(25.0, 0.40 * cams_25) * lead_factor
            pm25_q = {
                "p10": round(max(0.0, cams_25 - hw_25), 1),
                "p50": round(cams_25, 1),
                "p90": round(cams_25 + hw_25, 1),
            }

            cams_10 = float(row["driver_pm10"])
            hw_10 = max(50.0, 0.45 * cams_10) * lead_factor
            pm10_q = {
                "p10": round(max(0.0, cams_10 - hw_10), 1),
                "p50": round(cams_10, 1),
                "p90": round(cams_10 + hw_10, 1),
            }

            cams_o3 = float(row["driver_o3"])
            hw_o3 = max(10.0, 0.35 * cams_o3) * lead_factor
            o3_q = {
                "p10": round(max(0.0, cams_o3 - hw_o3), 1),
                "p50": round(cams_o3, 1),
                "p90": round(cams_o3 + hw_o3, 1),
            }

            cams_no2 = float(row["driver_no2"])
            hw_no2 = max(10.0, 0.35 * cams_no2) * lead_factor
            no2_q = {
                "p10": round(max(0.0, cams_no2 - hw_no2), 1),
                "p50": round(cams_no2, 1),
                "p90": round(cams_no2 + hw_no2, 1),
            }

        # Cache for p_severe calculation
        p25_lead_map[lead_h] = pm25_q
        p10_lead_map[lead_h] = pm10_q

        # Convert PM values to AQI
        aqi_p10, _ = convert_pm_to_aqi(pm25_q["p10"], pm10_q["p10"], breakpoints_df=breakpoints_df)
        aqi_p50, cat_p50 = convert_pm_to_aqi(pm25_q["p50"], pm10_q["p50"], breakpoints_df=breakpoints_df)
        aqi_p90, _ = convert_pm_to_aqi(pm25_q["p90"], pm10_q["p90"], breakpoints_df=breakpoints_df)

        # Enforce AQI monotonicity
        aqi_p10 = max(0.0, aqi_p10 if aqi_p10 is not None else 0.0)
        aqi_p50 = max(aqi_p10, aqi_p50 if aqi_p50 is not None else aqi_p10)
        aqi_p90 = max(aqi_p50, aqi_p90 if aqi_p90 is not None else aqi_p50)

        # Look up matching actual observation if available (for replay mode)
        obs_row = obs_map.get((station_id, row["valid_time"]), {})
        p25_act = obs_row.get("pm25")
        p10_act = obs_row.get("pm10")
        o3_act = obs_row.get("o3")
        no2_act = obs_row.get("no2")
        aqi_act, cat_act = convert_pm_to_aqi(p25_act, p10_act, breakpoints_df=breakpoints_df)

        hourly_records.append({
            "valid_time": v_time,
            "lead_h": lead_h,
            "pm25": pm25_q,
            "pm10": pm10_q,
            "o3": o3_q,
            "no2": no2_q,
            "aqi_pm": {
                "p10": round(float(aqi_p10), 1),
                "p50": round(float(aqi_p50), 1),
                "p90": round(float(aqi_p90), 1),
            },
            "category": cat_p50,
            "observed": {
                "pm25": round(float(p25_act), 1) if pd.notna(p25_act) else None,
                "pm10": round(float(p10_act), 1) if pd.notna(p10_act) else None,
                "o3": round(float(o3_act), 1) if pd.notna(o3_act) else None,
                "no2": round(float(no2_act), 1) if pd.notna(no2_act) else None,
                "aqi": round(float(aqi_act), 1) if pd.notna(aqi_act) else None,
                "category": cat_act,
            },
        })

    # Compute P(Severe) at 24h, 48h, 72h
    p_sev_24 = compute_p_severe_for_lead(
        p25_lead_map.get(24, p25_lead_map.get(max(p25_lead_map.keys()))),
        p10_lead_map.get(24, p10_lead_map.get(max(p10_lead_map.keys()))),
        breakpoints_df=breakpoints_df,
    )
    p_sev_48 = compute_p_severe_for_lead(
        p25_lead_map.get(48, p25_lead_map.get(max(p25_lead_map.keys()))),
        p10_lead_map.get(48, p10_lead_map.get(max(p10_lead_map.keys()))),
        breakpoints_df=breakpoints_df,
    )
    p_sev_72 = compute_p_severe_for_lead(
        p25_lead_map.get(72, p25_lead_map.get(max(p25_lead_map.keys()))),
        p10_lead_map.get(72, p10_lead_map.get(max(p10_lead_map.keys()))),
        breakpoints_df=breakpoints_df,
    )

    return {
        "id": station_id,
        "name": station_name,
        "lat": lat,
        "lon": lon,
        "bias_correction": bias_status,
        "newest_obs_age_hours": obs_age_h,
        "recent_obs_count_7d": obs_count_7d,
        "p_severe_type": "uncalibrated risk indicator",
        "o3_no2_label": "experimental, single-station",
        "hourly": hourly_records,
        "p_severe": {
            "24h": p_sev_24,
            "48h": p_sev_48,
            "72h": p_sev_72,
        },
    }


def run_72h_forecast(
    stations_csv: Union[str, Path] = DEFAULT_STATIONS_CSV,
    models_dir: Union[str, Path] = MODELS_DIR,
    output_path: Union[str, Path] = DEFAULT_OUTPUT_JSON,
    replay_output_path: Union[str, Path] = DEFAULT_REPLAY_JSON,
    issue_time: Optional[Union[str, pd.Timestamp]] = None,
    driver_dfs: Optional[Dict[str, pd.DataFrame]] = None,
    model_type: str = "blend",
) -> Dict[str, Any]:
    """Execute complete 72-hour forecast pipeline for all stations and save data/forecast.json."""
    stations_df = load_stations(stations_csv)
    obs_df = load_all_observations()
    breakpoints_df = aqi.load_breakpoints()

    # Pre-load models if lgbm mode chosen
    if model_type == "lgbm":
        models, metadata = load_models(models_dir)
        version_tag = metadata.get("model_version", "1.0.0") + "-lgbm"
        hist_drivers_df = None
    else:
        models = None
        version_tag = "1.1.0-blend"
        hist_drivers_df = load_drivers_for_seasons(stations_df, [TEST_WINTER])

    # Determine issue time
    if issue_time is not None:
        if isinstance(issue_time, str):
            iss_ts = pd.to_datetime(issue_time)
            if iss_ts.tz is None:
                iss_ts = iss_ts.tz_localize("Asia/Kolkata")
            else:
                iss_ts = iss_ts.tz_convert("Asia/Kolkata")
        else:
            iss_ts = issue_time
    else:
        # Default: current hour in IST
        now_utc = pd.Timestamp.now(tz="UTC")
        iss_ts = now_utc.tz_convert("Asia/Kolkata").floor("h")

    print("=" * 76)
    print("VAAYU 72-Hour Air Quality Forecast Pipeline")
    print("=" * 76)
    print(f"  • Issue Time (IST):    {iss_ts.isoformat()}")
    print(f"  • Model Type:          {model_type} ({'Rolling Bias Blend' if model_type == 'blend' else 'LightGBM'})")
    print(f"  • Model Version:       {version_tag}")
    print(f"  • Risk Indicator:      uncalibrated risk indicator")
    print(f"  • Stations:            {len(stations_df)}")
    print(f"  • Target Horizons:     h=1..72 hours")
    print("=" * 76)

    station_outputs = []
    has_replay_observations = False

    for _, row in stations_df.iterrows():
        st_id = str(row["id"])
        st_name = str(row["name"])
        lat = float(row["lat"])
        lon = float(row["lon"])

        st_driver_df = driver_dfs.get(st_id) if driver_dfs else None
        if st_driver_df is None and hist_drivers_df is not None:
            # Check if hist_drivers_df covers the required forward forecast window
            st_hist = hist_drivers_df[hist_drivers_df["station_id"] == st_id]
            fwd_times = [iss_ts + pd.Timedelta(hours=h) for h in range(1, 73)]
            in_hist = st_hist[st_hist["timestamp"].isin(fwd_times)]
            if len(in_hist) >= 72:
                st_driver_df = in_hist.copy()

        print(f"\nGenerating 72h forecast for station '{st_id}' ({st_name})...")
        st_fc = generate_forecast_for_station(
            station_id=st_id,
            station_name=st_name,
            lat=lat,
            lon=lon,
            issue_time=iss_ts,
            models=models,
            obs_df=obs_df,
            driver_df=st_driver_df,
            hist_drivers_df=hist_drivers_df,
            breakpoints_df=breakpoints_df,
            max_lead_h=72,
            model_type=model_type,
        )
        station_outputs.append(st_fc)

        # Check if actual observations exist for replay mode
        valid_obs_in_window = sum(1 for h in st_fc["hourly"] if h["observed"]["pm25"] is not None)
        if valid_obs_in_window > 0:
            has_replay_observations = True

        bias_flag = st_fc["bias_correction"]
        age_str = f"{st_fc['newest_obs_age_hours']:.1f}h" if st_fc['newest_obs_age_hours'] is not None else "None"
        print(f"  -> Generated {len(st_fc['hourly'])} hourly forecasts.")
        print(f"  -> Bias Correction: {bias_flag} (Recent 7d obs: {st_fc['recent_obs_count_7d']}, Newest obs age: {age_str})")
        print(f"  -> P(Severe) [uncalibrated]: 24h={st_fc['p_severe']['24h']:.2f}, 48h={st_fc['p_severe']['48h']:.2f}, 72h={st_fc['p_severe']['72h']:.2f}")

    forecast_json_obj = {
        "issued_at": iss_ts.isoformat(),
        "model_version": version_tag,
        "forecasting_engine": (
            "rolling 7-day bias-corrected CAMS (PM) & lead blend (O3/NO2)"
            if model_type == "blend" else "LightGBM multi-quantile corrector"
        ),
        "p_severe_type": "uncalibrated risk indicator",
        "p_severe_disclosure": "Uncalibrated risk indicator; zero skill claimed over climatological reference base rate.",
        "uncertainty_heuristic": "Prediction intervals widen with lead horizon via (1.0 + 0.004 * lead_h)",
        "notes": {
            "pm25": "7-day rolling bias-corrected CAMS (p50 with empirical residual quantiles for p10/p90)",
            "pm10": "7-day rolling bias-corrected CAMS (p50 with empirical residual quantiles for p10/p90)",
            "o3": "lead-aware blend (experimental, single-station)",
            "no2": "lead-aware blend (experimental, single-station)",
        },
        "stations": station_outputs,
    }

    # Sanitize and write primary forecast JSON (data/forecast.json)
    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as fp:
        json.dump(sanitize_for_json(forecast_json_obj), fp, indent=2)

    print(f"\nSuccessfully wrote forecast to {out_file} ({out_file.stat().st_size / 1024:.1f} KB)")

    # If replaying a period with actual observations, write data/forecast_replay.json
    if has_replay_observations:
        replay_file = Path(replay_output_path)
        replay_file.parent.mkdir(parents=True, exist_ok=True)
        with open(replay_file, "w", encoding="utf-8") as fp:
            json.dump(sanitize_for_json(forecast_json_obj), fp, indent=2)
        print(f"Successfully wrote replay forecast with matching observations to {replay_file} ({replay_file.stat().st_size / 1024:.1f} KB)")

    # Keep site/data.json updated if present
    if SITE_DATA_JSON.exists():
        try:
            with open(SITE_DATA_JSON, "r", encoding="utf-8") as fp:
                site_data = json.load(fp)
            site_data["forecast_72h"] = forecast_json_obj
            with open(SITE_DATA_JSON, "w", encoding="utf-8") as fp:
                json.dump(site_data, fp, indent=2)
            print(f"Updated {SITE_DATA_JSON} with forecast_72h entry.")
        except Exception as exc:
            print(f"Notice: Could not update site/data.json: {exc}", file=sys.stderr)

    return forecast_json_obj


def main():
    parser = argparse.ArgumentParser(description="Run VAAYU 72-Hour Forecast System")
    parser.add_argument("--stations", default=DEFAULT_STATIONS_CSV, help="Path to stations.csv")
    parser.add_argument("--output", default=DEFAULT_OUTPUT_JSON, help="Path to output forecast.json")
    parser.add_argument("--replay-output", default=DEFAULT_REPLAY_JSON, help="Path to output forecast_replay.json")
    parser.add_argument("--issue-time", default=None, help="Optional issue time (ISO8601 string, e.g. '2025-11-12 20:00')")
    parser.add_argument(
        "--model",
        choices=["blend", "lgbm"],
        default="blend",
        help="Forecasting engine: 'blend' (rolling bias-corrected CAMS & lead blend, default) or 'lgbm' (LightGBM)",
    )
    args = parser.parse_args()

    run_72h_forecast(
        stations_csv=args.stations,
        output_path=args.output,
        replay_output_path=args.replay_output,
        issue_time=args.issue_time,
        model_type=args.model,
    )


if __name__ == "__main__":
    main()
