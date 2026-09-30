"""Fetch meteorological and atmospheric composition driver data from Open-Meteo for VAAYU.

Endpoints used:
1. Air Quality Forecast:
   - URL: https://air-quality-api.open-meteo.com/v1/air-quality
   - Variables: pm2_5, pm10, ozone, nitrogen_dioxide (CAMS European / Global models)
2. Weather Forecast:
   - URL: https://api.open-meteo.com/v1/forecast
   - Variables: temperature_2m, relative_humidity_2m, wind_speed_10m, wind_direction_10m,
                boundary_layer_height, surface_pressure
3. Historical Air Quality:
   - URL: https://air-quality-api.open-meteo.com/v1/air-quality (with start_date, end_date)
4. Historical Weather / Forecast:
   - URL: https://historical-forecast-api.open-meteo.com/v1/forecast (with start_date, end_date)
   - Fallback: https://archive-api.open-meteo.com/v1/archive (ERA5 reanalysis)

All requests request timezone=Asia/Kolkata so timestamps match Indian Standard Time (IST).
Raw responses are cached under data/raw/openmeteo/ (gitignored).
"""

from datetime import date, datetime, timedelta
import json
from pathlib import Path
import re
import sys
import time
from typing import Any, Callable, Dict, List, Optional, Tuple, Union
import urllib.error
import urllib.parse
import urllib.request

import pandas as pd

# Default paths and URLs
DEFAULT_STATIONS_CSV = Path("data/stations.csv")
CACHE_DIR = Path("data/raw/openmeteo")

URL_AQ_FORECAST = "https://air-quality-api.open-meteo.com/v1/air-quality"
URL_WX_FORECAST = "https://api.open-meteo.com/v1/forecast"
URL_AQ_HISTORICAL = "https://air-quality-api.open-meteo.com/v1/air-quality"
URL_WX_HISTORICAL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
URL_WX_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

AQ_VARIABLES = ["pm2_5", "pm10", "ozone", "nitrogen_dioxide"]
WX_VARIABLES = [
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "boundary_layer_height",
    "surface_pressure",
]

FEATURE_SOURCES = {
    "pm2_5": {
        "api": "Open-Meteo Air Quality (CAMS)",
        "forecast_endpoint": URL_AQ_FORECAST,
        "historical_endpoint": URL_AQ_HISTORICAL,
        "unit": "ug/m3",
    },
    "pm10": {
        "api": "Open-Meteo Air Quality (CAMS)",
        "forecast_endpoint": URL_AQ_FORECAST,
        "historical_endpoint": URL_AQ_HISTORICAL,
        "unit": "ug/m3",
    },
    "ozone": {
        "api": "Open-Meteo Air Quality (CAMS)",
        "forecast_endpoint": URL_AQ_FORECAST,
        "historical_endpoint": URL_AQ_HISTORICAL,
        "unit": "ug/m3",
    },
    "nitrogen_dioxide": {
        "api": "Open-Meteo Air Quality (CAMS)",
        "forecast_endpoint": URL_AQ_FORECAST,
        "historical_endpoint": URL_AQ_HISTORICAL,
        "unit": "ug/m3",
    },
    "temperature_2m": {
        "api": "Open-Meteo Weather Forecast / Historical Forecast",
        "forecast_endpoint": URL_WX_FORECAST,
        "historical_endpoint": URL_WX_HISTORICAL,
        "unit": "degC",
    },
    "relative_humidity_2m": {
        "api": "Open-Meteo Weather Forecast / Historical Forecast",
        "forecast_endpoint": URL_WX_FORECAST,
        "historical_endpoint": URL_WX_HISTORICAL,
        "unit": "%",
    },
    "wind_speed_10m": {
        "api": "Open-Meteo Weather Forecast / Historical Forecast",
        "forecast_endpoint": URL_WX_FORECAST,
        "historical_endpoint": URL_WX_HISTORICAL,
        "unit": "km/h",
    },
    "wind_direction_10m": {
        "api": "Open-Meteo Weather Forecast / Historical Forecast",
        "forecast_endpoint": URL_WX_FORECAST,
        "historical_endpoint": URL_WX_HISTORICAL,
        "unit": "degrees",
    },
    "boundary_layer_height": {
        "api": "Open-Meteo Weather Forecast / Historical Forecast",
        "forecast_endpoint": URL_WX_FORECAST,
        "historical_endpoint": URL_WX_HISTORICAL,
        "unit": "m",
    },
    "surface_pressure": {
        "api": "Open-Meteo Weather Forecast / Historical Forecast",
        "forecast_endpoint": URL_WX_FORECAST,
        "historical_endpoint": URL_WX_HISTORICAL,
        "unit": "hPa",
    },
}


def get_feature_sources() -> Dict[str, Dict[str, str]]:
    """Return dictionary of feature names and their originating Open-Meteo API endpoints."""
    return FEATURE_SOURCES


def load_stations(csv_path: Union[str, Path] = DEFAULT_STATIONS_CSV) -> pd.DataFrame:
    """Load monitoring stations configuration from CSV file."""
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"Stations configuration file not found: {path.resolve()}")
    df = pd.read_csv(path)
    required = {"id", "name", "lat", "lon"}
    if not required.issubset(df.columns):
        raise ValueError(f"Stations CSV must contain columns {required}, found {list(df.columns)}")
    return df


def make_http_request(
    url: str,
    params: Optional[Dict[str, Any]] = None,
    timeout: float = 30.0,
) -> Dict[str, Any]:
    """Execute HTTP GET request using urllib and parse JSON response."""
    if params:
        query_string = urllib.parse.urlencode(params)
        full_url = f"{url}?{query_string}" if "?" not in url else f"{url}&{query_string}"
    else:
        full_url = url

    headers = {
        "Accept": "application/json",
        "User-Agent": "VAAYU-72hForecast/1.0",
    }
    req = urllib.request.Request(full_url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body)


def request_with_retry(
    url: str,
    params: Optional[Dict[str, Any]] = None,
    max_retries: int = 5,
    initial_backoff: float = 1.5,
    request_fn: Callable = make_http_request,
) -> Dict[str, Any]:
    """Execute HTTP request with retry logic and exponential backoff for rate limits and 5xx errors."""
    backoff = initial_backoff
    last_error = None

    for attempt in range(max_retries):
        try:
            return request_fn(url, params=params)
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code == 429 or 500 <= exc.code < 600:
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                sleep_sec = float(retry_after) if retry_after and retry_after.isdigit() else backoff
                print(
                    f"Warning: HTTP {exc.code} for {url}. Retrying in {sleep_sec:.1f}s "
                    f"(attempt {attempt + 1}/{max_retries})...",
                    file=sys.stderr,
                )
                time.sleep(sleep_sec)
                backoff *= 2.0
            else:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last_error = exc
            print(
                f"Warning: Network connection error ({exc}). Retrying in {backoff:.1f}s "
                f"(attempt {attempt + 1}/{max_retries})...",
                file=sys.stderr,
            )
            time.sleep(backoff)
            backoff *= 2.0

    raise RuntimeError(f"Failed to fetch {url} after {max_retries} attempts. Last error: {last_error}")


def _cached_fetch(
    cache_path: Path,
    url: str,
    params: Dict[str, Any],
    request_fn: Callable = request_with_retry,
) -> Dict[str, Any]:
    """Retrieve response from cache if available, otherwise fetch from network and cache."""
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    if cache_path.exists():
        try:
            with open(cache_path, "r", encoding="utf-8") as fp:
                return json.load(fp)
        except Exception:
            pass

    data = request_fn(url, params=params)
    with open(cache_path, "w", encoding="utf-8") as fp:
        json.dump(data, fp, indent=2)
    # Polite rate limit padding
    time.sleep(0.1)
    return data


def parse_response_to_dataframe(
    resp: Dict[str, Any],
    variables: List[str],
    station_id: str,
) -> pd.DataFrame:
    """Extract hourly series from an Open-Meteo response into a structured DataFrame with IST index."""
    hourly = resp.get("hourly", {})
    times = hourly.get("time", [])
    if not times:
        return pd.DataFrame()

    data = {
        "timestamp": pd.to_datetime(times).tz_localize(
            "Asia/Kolkata" if pd.to_datetime(times).tz is None else None
        ).tz_convert("Asia/Kolkata"),
        "station_id": station_id,
    }
    for var in variables:
        data[var] = hourly.get(var, [None] * len(times))

    df = pd.DataFrame(data)
    return df


def fetch_forecast_drivers(
    station_id: str,
    lat: float,
    lon: float,
    forecast_days: int = 4,
    cache_dir: Path = CACHE_DIR,
    request_fn: Callable = request_with_retry,
) -> pd.DataFrame:
    """Fetch live 72+ hour forecast drivers (AQ and Weather) for a station.

    Returns merged DataFrame with columns:
    ['timestamp', 'station_id', 'pm2_5', 'pm10', 'ozone', 'nitrogen_dioxide',
     'temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'wind_direction_10m',
     'boundary_layer_height', 'surface_pressure']
    """
    today_str = date.today().isoformat()
    aq_cache = cache_dir / f"forecast_aq_{station_id}_{today_str}.json"
    wx_cache = cache_dir / f"forecast_wx_{station_id}_{today_str}.json"

    # 1. Fetch Air Quality Forecast
    aq_params = {
        "latitude": f"{lat:.6f}",
        "longitude": f"{lon:.6f}",
        "hourly": ",".join(AQ_VARIABLES),
        "forecast_days": forecast_days,
        "timezone": "Asia/Kolkata",
    }
    aq_json = _cached_fetch(aq_cache, URL_AQ_FORECAST, aq_params, request_fn=request_fn)
    df_aq = parse_response_to_dataframe(aq_json, AQ_VARIABLES, station_id)

    # 2. Fetch Weather Forecast
    wx_params = {
        "latitude": f"{lat:.6f}",
        "longitude": f"{lon:.6f}",
        "hourly": ",".join(WX_VARIABLES),
        "forecast_days": forecast_days,
        "timezone": "Asia/Kolkata",
    }
    wx_json = _cached_fetch(wx_cache, URL_WX_FORECAST, wx_params, request_fn=request_fn)
    df_wx = parse_response_to_dataframe(wx_json, WX_VARIABLES, station_id)

    if df_aq.empty or df_wx.empty:
        raise ValueError(f"Empty forecast response received for station {station_id}")

    # Merge on timestamp and station_id
    merged = pd.merge(df_aq, df_wx, on=["timestamp", "station_id"], how="inner")
    return merged.sort_values("timestamp").reset_index(drop=True)


def fetch_historical_drivers(
    station_id: str,
    lat: float,
    lon: float,
    start_date: Union[str, date],
    end_date: Union[str, date],
    cache_dir: Path = CACHE_DIR,
    request_fn: Callable = request_with_retry,
) -> pd.DataFrame:
    """Fetch historical driver data (both Air Quality and Weather) for a station and date range.

    Returns merged DataFrame with columns:
    ['timestamp', 'station_id', 'pm2_5', 'pm10', 'ozone', 'nitrogen_dioxide',
     'temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'wind_direction_10m',
     'boundary_layer_height', 'surface_pressure']
    """
    s_date = str(start_date)
    e_date = str(end_date)
    aq_cache = cache_dir / f"hist_aq_{station_id}_{s_date}_{e_date}.json"
    wx_cache = cache_dir / f"hist_wx_{station_id}_{s_date}_{e_date}.json"

    # 1. Historical Air Quality
    aq_params = {
        "latitude": f"{lat:.6f}",
        "longitude": f"{lon:.6f}",
        "hourly": ",".join(AQ_VARIABLES),
        "start_date": s_date,
        "end_date": e_date,
        "timezone": "Asia/Kolkata",
    }
    aq_json = _cached_fetch(aq_cache, URL_AQ_HISTORICAL, aq_params, request_fn=request_fn)
    df_aq = parse_response_to_dataframe(aq_json, AQ_VARIABLES, station_id)

    # 2. Historical Weather Forecast
    wx_params = {
        "latitude": f"{lat:.6f}",
        "longitude": f"{lon:.6f}",
        "hourly": ",".join(WX_VARIABLES),
        "start_date": s_date,
        "end_date": e_date,
        "timezone": "Asia/Kolkata",
    }
    try:
        wx_json = _cached_fetch(wx_cache, URL_WX_HISTORICAL, wx_params, request_fn=request_fn)
        df_wx = parse_response_to_dataframe(wx_json, WX_VARIABLES, station_id)
    except Exception as exc:
        print(f"Notice: historical-forecast failed ({exc}), falling back to archive-api...", file=sys.stderr)
        wx_json = _cached_fetch(wx_cache, URL_WX_ARCHIVE, wx_params, request_fn=request_fn)
        df_wx = parse_response_to_dataframe(wx_json, WX_VARIABLES, station_id)

    if df_aq.empty or df_wx.empty:
        raise ValueError(f"Empty historical response received for station {station_id} between {s_date} and {e_date}")

    merged = pd.merge(df_aq, df_wx, on=["timestamp", "station_id"], how="inner")
    return merged.sort_values("timestamp").reset_index(drop=True)


def fetch_all_forecast_drivers(
    stations_df: pd.DataFrame,
    forecast_days: int = 4,
    cache_dir: Path = CACHE_DIR,
    request_fn: Callable = request_with_retry,
) -> Dict[str, pd.DataFrame]:
    """Fetch live forecast drivers for all stations in stations_df."""
    results = {}
    for _, row in stations_df.iterrows():
        st_id = str(row["id"])
        lat = float(row["lat"])
        lon = float(row["lon"])
        print(f"Fetching live forecast drivers for station '{st_id}' ({row['name']})...")
        df = fetch_forecast_drivers(
            station_id=st_id,
            lat=lat,
            lon=lon,
            forecast_days=forecast_days,
            cache_dir=cache_dir,
            request_fn=request_fn,
        )
        results[st_id] = df
    return results


def fetch_all_historical_drivers(
    stations_df: pd.DataFrame,
    start_date: Union[str, date],
    end_date: Union[str, date],
    cache_dir: Path = CACHE_DIR,
    chunk_days: int = 30,
    request_fn: Callable = request_with_retry,
) -> Dict[str, pd.DataFrame]:
    """Fetch historical drivers for all stations, splitting large date ranges into chunks for reliability."""
    s_dt = pd.to_datetime(start_date).date()
    e_dt = pd.to_datetime(end_date).date()

    results = {str(row["id"]): [] for _, row in stations_df.iterrows()}

    curr_start = s_dt
    while curr_start <= e_dt:
        curr_end = min(curr_start + timedelta(days=chunk_days - 1), e_dt)
        print(f"Fetching historical drivers window {curr_start} to {curr_end}...")

        for _, row in stations_df.iterrows():
            st_id = str(row["id"])
            lat = float(row["lat"])
            lon = float(row["lon"])
            df_chunk = fetch_historical_drivers(
                station_id=st_id,
                lat=lat,
                lon=lon,
                start_date=curr_start,
                end_date=curr_end,
                cache_dir=cache_dir,
                request_fn=request_fn,
            )
            results[st_id].append(df_chunk)

        curr_start = curr_end + timedelta(days=1)

    combined_results = {}
    for st_id, chunks in results.items():
        if chunks:
            comb = pd.concat(chunks, ignore_index=True)
            comb = comb.drop_duplicates(subset=["timestamp", "station_id"])
            combined_results[st_id] = comb.sort_values("timestamp").reset_index(drop=True)
        else:
            combined_results[st_id] = pd.DataFrame()

    return combined_results


if __name__ == "__main__":
    stations = load_stations()
    print("Loaded stations:")
    print(stations)
    print("\nFetching live 72h+ forecast drivers...")
    fc_map = fetch_all_forecast_drivers(stations, forecast_days=4)
    for st_id, df_fc in fc_map.items():
        print(f"  • {st_id}: {len(df_fc)} hours ({df_fc['timestamp'].min()} to {df_fc['timestamp'].max()})")
