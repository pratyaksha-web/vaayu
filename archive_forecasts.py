"""Forecast and Observation Archiver for VAAYU.

Fetches current numerical weather and air quality forecast runs from Open-Meteo
(CAMS air quality and NWP meteorology) for all stations configured in data/stations.csv.
Saves raw forecast cycles with issue timestamps to:
  data/archive/forecasts/YYYY-MM-DD_HH.parquet (or .csv)

Also fetches latest available ground observations and archives them to:
  data/archive/obs/observations_archive.parquet (or .csv)

This script is designed to run every 6 hours via GitHub Actions on the `data-archive` branch,
building a true operational forecast archive so that future evaluations can verify
degradation over lead time rather than relying on reanalysis hindcasts.
"""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import time
from typing import Any, Callable, Dict, List, Optional, Union
import urllib.parse
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except Exception:
        pass

from dotenv import load_dotenv
import numpy as np
import pandas as pd
import requests

from fetch_drivers import (
    AQ_VARIABLES,
    DEFAULT_STATIONS_CSV,
    URL_AQ_FORECAST,
    URL_WX_FORECAST,
    WX_VARIABLES,
    load_stations,
    parse_response_to_dataframe,
    request_with_retry,
)

ARCHIVE_BASE_DIR = Path("data/archive")
FORECASTS_ARCHIVE_DIR = ARCHIVE_BASE_DIR / "forecasts"
OBS_ARCHIVE_DIR = ARCHIVE_BASE_DIR / "obs"

# Known OpenAQ location IDs for stations
OPENAQ_LOCATION_MAP = {
    "anand_vihar_new_delhi_dpcc": 235,
    "indirapuram_ghaziabad_uppcb": 6924,
    "sector_11_faridabad_hspcb": 263,
}


def fetch_live_station_forecast(
    station_id: str,
    station_name: str,
    lat: float,
    lon: float,
    issue_time: pd.Timestamp,
    forecast_days: int = 4,
    request_fn: Callable = request_with_retry,
) -> pd.DataFrame:
    """Fetch current 72h+ CAMS air quality and weather forecast from Open-Meteo for one station."""
    # 1. Fetch Air Quality Forecast
    aq_params = {
        "latitude": f"{lat:.6f}",
        "longitude": f"{lon:.6f}",
        "hourly": ",".join(AQ_VARIABLES),
        "forecast_days": forecast_days,
        "timezone": "Asia/Kolkata",
    }
    aq_json = request_fn(URL_AQ_FORECAST, params=aq_params)
    df_aq = parse_response_to_dataframe(aq_json, AQ_VARIABLES, station_id)

    # 2. Fetch Weather Forecast
    wx_params = {
        "latitude": f"{lat:.6f}",
        "longitude": f"{lon:.6f}",
        "hourly": ",".join(WX_VARIABLES),
        "forecast_days": forecast_days,
        "timezone": "Asia/Kolkata",
    }
    wx_json = request_fn(URL_WX_FORECAST, params=wx_params)
    df_wx = parse_response_to_dataframe(wx_json, WX_VARIABLES, station_id)

    if df_aq.empty or df_wx.empty:
        raise ValueError(f"Empty forecast response received for station {station_id}")

    # Merge on timestamp and station_id
    merged = pd.merge(df_aq, df_wx, on=["timestamp", "station_id"], how="inner")
    merged = merged.rename(columns={"timestamp": "valid_time"})
    merged["station_name"] = station_name
    merged["lat"] = lat
    merged["lon"] = lon
    merged["issue_time"] = issue_time

    # Calculate lead hours
    merged["lead_h"] = (
        (merged["valid_time"] - issue_time).dt.total_seconds() / 3600.0
    ).round().astype(int)

    # Filter to future forecast hours (lead_h >= 1)
    merged = merged[merged["lead_h"] >= 1].sort_values("lead_h").reset_index(drop=True)
    return merged


def fetch_latest_openaq_observations(
    api_key: Optional[str] = None,
    timeout_sec: int = 20,
) -> pd.DataFrame:
    """Fetch recent measurements from OpenAQ v3 API for configured stations if key is present."""
    if not api_key:
        load_dotenv()
        api_key = os.getenv("OPENAQ_API_KEY")

    if not api_key or not api_key.strip():
        print("Notice: OPENAQ_API_KEY not configured. Skipping live OpenAQ observation fetch.")
        return pd.DataFrame()

    headers = {
        "X-API-Key": api_key.strip(),
        "User-Agent": "VAAYU-Forecast-Archiver/1.0",
    }

    obs_records = []
    base_url = "https://api.openaq.org/v3/locations"

    for st_id, loc_id in OPENAQ_LOCATION_MAP.items():
        url = f"{base_url}/{loc_id}/latest"
        try:
            resp = requests.get(url, headers=headers, timeout=timeout_sec)
            if resp.status_code != 200:
                print(f"Warning: OpenAQ returned status {resp.status_code} for location {loc_id}")
                continue
            data = resp.json()
            results = data.get("results", [])
            row: Dict[str, Any] = {
                "station_id": st_id,
                "timestamp": None,
                "pm25": np.nan,
                "pm10": np.nan,
                "o3": np.nan,
                "no2": np.nan,
                "source": "openaq_live",
            }
            latest_dt = None
            for item in results:
                param = item.get("parameter", {}).get("name", "").lower()
                val = item.get("value")
                dt_str = item.get("datetime", {}).get("utc")
                if dt_str and (latest_dt is None or dt_str > latest_dt):
                    latest_dt = dt_str

                if param in ["pm25", "pm2.5"]:
                    row["pm25"] = float(val) if val is not None else np.nan
                elif param in ["pm10"]:
                    row["pm10"] = float(val) if val is not None else np.nan
                elif param in ["o3", "ozone"]:
                    row["o3"] = float(val) if val is not None else np.nan
                elif param in ["no2", "nitrogen_dioxide"]:
                    row["no2"] = float(val) if val is not None else np.nan

            if latest_dt:
                row["timestamp"] = pd.to_datetime(latest_dt).tz_convert("Asia/Kolkata")
                obs_records.append(row)
        except Exception as err:
            print(f"Warning: Failed to fetch OpenAQ for {st_id} ({loc_id}): {err}")

    if not obs_records:
        return pd.DataFrame()

    return pd.DataFrame(obs_records)


def archive_current_forecasts(
    stations_csv: Union[str, Path] = DEFAULT_STATIONS_CSV,
    archive_dir: Path = FORECASTS_ARCHIVE_DIR,
    issue_time: Optional[pd.Timestamp] = None,
    forecast_days: int = 4,
    request_fn: Callable = request_with_retry,
    save_format: str = "parquet",
) -> Path:
    """Fetch and archive the current forecast cycle across all configured stations."""
    stations = load_stations(stations_csv)
    archive_dir.mkdir(parents=True, exist_ok=True)

    if issue_time is None:
        now_utc = pd.Timestamp.now(tz="UTC")
        issue_time = now_utc.tz_convert("Asia/Kolkata").floor("h")
    elif issue_time.tz is None:
        issue_time = issue_time.tz_localize("Asia/Kolkata")
    else:
        issue_time = issue_time.tz_convert("Asia/Kolkata")

    file_stem = issue_time.strftime("%Y-%m-%d_%H")
    print(f"Archiving forecast cycle for issue time: {issue_time.isoformat()} ({file_stem})")

    station_dfs = []
    for _, row in stations.iterrows():
        st_id = str(row["id"])
        st_name = str(row["name"])
        lat = float(row["lat"])
        lon = float(row["lon"])

        print(f"  Fetching 72h+ forecast for {st_id} ({st_name})...")
        df_st = fetch_live_station_forecast(
            station_id=st_id,
            station_name=st_name,
            lat=lat,
            lon=lon,
            issue_time=issue_time,
            forecast_days=forecast_days,
            request_fn=request_fn,
        )
        station_dfs.append(df_st)

    all_forecasts = pd.concat(station_dfs, ignore_index=True)

    # Save to archive
    if save_format == "parquet":
        out_path = archive_dir / f"{file_stem}.parquet"
        try:
            all_forecasts.to_parquet(out_path, index=False)
        except Exception:
            # Fallback to CSV if parquet engine unavailable
            out_path = archive_dir / f"{file_stem}.csv"
            all_forecasts.to_csv(out_path, index=False)
    else:
        out_path = archive_dir / f"{file_stem}.csv"
        all_forecasts.to_csv(out_path, index=False)

    print(f"Successfully archived {len(all_forecasts)} forecast rows to {out_path}")
    return out_path


def archive_observations(
    obs_dir: Path = OBS_ARCHIVE_DIR,
    api_key: Optional[str] = None,
    save_format: str = "parquet",
) -> Optional[Path]:
    """Fetch and append latest observations to observation archive."""
    obs_dir.mkdir(parents=True, exist_ok=True)
    df_latest = fetch_latest_openaq_observations(api_key=api_key)

    if df_latest.empty:
        return None

    # Standard archive file
    if save_format == "parquet":
        out_path = obs_dir / "observations_archive.parquet"
        if out_path.exists():
            try:
                df_existing = pd.read_parquet(out_path)
                combined = pd.concat([df_existing, df_latest], ignore_index=True)
                combined = combined.drop_duplicates(subset=["station_id", "timestamp"]).sort_values(
                    ["station_id", "timestamp"]
                )
            except Exception:
                combined = df_latest
        else:
            combined = df_latest
        combined.to_parquet(out_path, index=False)
    else:
        out_path = obs_dir / "observations_archive.csv"
        if out_path.exists():
            try:
                df_existing = pd.read_csv(out_path)
                combined = pd.concat([df_existing, df_latest], ignore_index=True)
                combined = combined.drop_duplicates(subset=["station_id", "timestamp"]).sort_values(
                    ["station_id", "timestamp"]
                )
            except Exception:
                combined = df_latest
        else:
            combined = df_latest
        combined.to_csv(out_path, index=False)

    print(f"Successfully appended {len(df_latest)} new observation records to {out_path}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Archive Open-Meteo forecasts and latest observations.")
    parser.add_argument("--stations-csv", default=str(DEFAULT_STATIONS_CSV), help="Path to stations config CSV")
    parser.add_argument("--issue-time", default=None, help="Issue timestamp in ISO format (e.g. 2026-10-01T12:00:00)")
    parser.add_argument("--archive-dir", default=str(FORECASTS_ARCHIVE_DIR), help="Directory to save forecast archives")
    parser.add_argument("--obs-dir", default=str(OBS_ARCHIVE_DIR), help="Directory to save observation archives")
    parser.add_argument("--forecast-days", type=int, default=4, help="Forecast horizon days (default: 4 = 96h)")
    parser.add_argument("--format", choices=["parquet", "csv"], default="parquet", help="Output format")

    args = parser.parse_args()

    iss_ts = pd.to_datetime(args.issue_time) if args.issue_time else None

    # 1. Archive Forecasts
    fc_path = archive_current_forecasts(
        stations_csv=args.stations_csv,
        archive_dir=Path(args.archive_dir),
        issue_time=iss_ts,
        forecast_days=args.forecast_days,
        save_format=args.format,
    )

    # 2. Archive Observations
    obs_path = archive_observations(
        obs_dir=Path(args.obs_dir),
        save_format=args.format,
    )

    print("\nArchiving completed successfully.")
    print(f"  Forecast archive: {fc_path}")
    if obs_path:
        print(f"  Observation archive: {obs_path}")


if __name__ == "__main__":
    main()
