"""Produce 72-Hour Air Quality and AQI Forecasts for VAAYU.

Generates hourly forecasts for PM2.5, PM10, O3, and NO2 across 72 hours (h=1..72)
for each station with p10, p50, and p90 quantiles. Converts PM forecasts to CPCB AQI
using the official aqi.py engine, and computes P(Severe) probabilities at 24h, 48h, and 72h.

Outputs:
- data/forecast.json adhering strictly to the official schema.
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
    FEATURE_COLUMNS,
    MODELS_DIR,
    POLLUTANTS,
    _to_float,
    build_samples_for_issue_time,
    load_all_observations,
    load_models,
    predict_quantiles,
)

DEFAULT_OUTPUT_JSON = Path("data/forecast.json")
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
    estimated from the 80% interval spread (p90 - p10) / 2.563, bounded below by 0.
    Reuses the official aqi.p_severe() function to compute the fraction of joint samples
    with AQI > 400.
    """
    rng = np.random.RandomState(seed)

    p10_25 = pm25_quantiles.get("p10", 0.0)
    p50_25 = pm25_quantiles.get("p50", 0.0)
    p90_25 = pm25_quantiles.get("p90", 0.0)

    p10_10 = pm10_quantiles.get("p10", 0.0)
    p50_10 = pm10_quantiles.get("p50", 0.0)
    p90_10 = pm10_quantiles.get("p90", 0.0)

    std_25 = max(1.0, (p90_25 - p10_25) / 2.563)
    std_10 = max(1.0, (p90_10 - p10_10) / 2.563)

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


def generate_forecast_for_station(
    station_id: str,
    station_name: str,
    lat: float,
    lon: float,
    issue_time: pd.Timestamp,
    models: Dict[str, Dict[float, Any]],
    obs_df: pd.DataFrame,
    driver_df: Optional[pd.DataFrame] = None,
    breakpoints_df: Optional[pd.DataFrame] = None,
    max_lead_h: int = 72,
) -> Dict[str, Any]:
    """Generate 72-hour forecast dictionary for a single station."""
    if issue_time.tz is None:
        issue_time = issue_time.tz_localize("Asia/Kolkata")
    else:
        issue_time = issue_time.tz_convert("Asia/Kolkata")

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

    if len(samples) < max_lead_h:
        # If live driver starts slightly ahead, pad or adjust issue_time
        pass

    df_samples = pd.DataFrame(samples)
    if len(df_samples) == 0:
        raise ValueError(f"No driver forecast samples available for station {station_id} at issue time {issue_time}")

    # Ensure exact 1..max_lead_h rows
    df_samples = df_samples.sort_values("lead_h").head(max_lead_h)

    # 4. Predict quantiles for all pollutants
    preds = predict_quantiles(models, df_samples[FEATURE_COLUMNS], enforce_monotonic=True)

    hourly_records = []
    p25_lead_map = {}
    p10_lead_map = {}

    for idx, row in df_samples.iterrows():
        lead_h = int(row["lead_h"])
        v_time = row["valid_time"].isoformat()

        # Pollutant quantiles
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

        # TODO: Hook for O3 and NO2 AQI sub-indices when rolling 8-hr (O3) and 1-hr/24-hr CPCB rules are added.
        # For now, O3 and NO2 are output as physical concentrations (ug/m3) as specified.

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
    issue_time: Optional[Union[str, pd.Timestamp]] = None,
    driver_dfs: Optional[Dict[str, pd.DataFrame]] = None,
) -> Dict[str, Any]:
    """Execute complete 72-hour forecast pipeline for all stations and save data/forecast.json."""
    stations_df = load_stations(stations_csv)
    models, metadata = load_models(models_dir)
    obs_df = load_all_observations()
    breakpoints_df = aqi.load_breakpoints()

    # Determine latest issue time
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
    print(f"  • Issue Time (IST): {iss_ts.isoformat()}")
    print(f"  • Model Version:    {metadata.get('model_version', '1.0.0')}")
    print(f"  • Stations:         {len(stations_df)}")
    print(f"  • Target Horizons:  h=1..72 hours")
    print("=" * 76)

    station_outputs = []
    for _, row in stations_df.iterrows():
        st_id = str(row["id"])
        st_name = str(row["name"])
        lat = float(row["lat"])
        lon = float(row["lon"])

        st_driver_df = driver_dfs.get(st_id) if driver_dfs else None

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
            breakpoints_df=breakpoints_df,
            max_lead_h=72,
        )
        station_outputs.append(st_fc)
        print(f"  -> Generated {len(st_fc['hourly'])} hourly forecasts.")
        print(f"  -> P(Severe): 24h={st_fc['p_severe']['24h']:.2f}, 48h={st_fc['p_severe']['48h']:.2f}, 72h={st_fc['p_severe']['72h']:.2f}")

    forecast_json_obj = {
        "issued_at": iss_ts.isoformat(),
        "model_version": metadata.get("model_version", "1.0.0"),
        "stations": station_outputs,
    }

    # Sanitize and write data/forecast.json
    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as fp:
        json.dump(sanitize_for_json(forecast_json_obj), fp, indent=2)

    print(f"\nSuccessfully wrote forecast to {out_file} ({out_file.stat().st_size / 1024:.1f} KB)")

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
    parser.add_argument("--issue-time", default=None, help="Optional issue time (ISO8601 string)")
    args = parser.parse_args()

    run_72h_forecast(
        stations_csv=args.stations,
        output_path=args.output,
        issue_time=args.issue_time,
    )


if __name__ == "__main__":
    main()
