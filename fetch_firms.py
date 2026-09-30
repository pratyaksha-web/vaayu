"""NASA FIRMS VIIRS Active Fire Fetcher and Analysis for VAAYU.

Fetches active fire detections for the Punjab-region box (Oct-Nov 2019-2025)
from NASA's Fire Information for Resource Management System (FIRMS) Area API.
Adheres strictly to official API specifications:
- Endpoint: /api/area/csv/[MAP_KEY]/[SOURCE]/[AREA_COORDINATES]/[DAY_RANGE]/[DATE]
- Primary VIIRS source: VIIRS_SNPP_SP (Standard Processing science quality archive)
- Per-request day limit: 5 days

Security:
- Never prints, logs, or persists FIRMS_MAP_KEY (even in URLs printed to console).
"""

from datetime import date, datetime, timedelta
import os
from pathlib import Path
import re
import sys
import time
from typing import Dict, List, Optional, Sequence, Tuple, Union
import urllib.error
import urllib.request

from dotenv import load_dotenv
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

# Load environment variables from .env
load_dotenv()

# --- Official FIRMS API Parameters ---
FIRMS_API_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
DEFAULT_SOURCE = "VIIRS_SNPP_SP"  # VIIRS Suomi-NPP Standard Processing
FIRMS_DAY_LIMIT = 5  # Official maximum day range per request

# Approximate bounding box for the Punjab region: (min_lon, min_lat, max_lon, max_lat)
# NOTE: This bounding box is approximate and includes parts of neighbouring regions
# (Haryana, Rajasthan, and adjacent border areas). All captions and labels must
# explicitly state "Punjab-region box".
PUNJAB_REGION_BOX: Tuple[float, float, float, float] = (73.8, 29.5, 77.0, 32.6)


def get_firms_key() -> str:
    """Retrieve FIRMS MAP_KEY from environment variables."""
    key = os.getenv("FIRMS_MAP_KEY")
    if not key:
        raise ValueError(
            "FIRMS_MAP_KEY environment variable is not set. "
            "Please add it to your local .env file."
        )
    return key.strip()


def sanitize_url(url: str, secret_key: Optional[str] = None) -> str:
    """Mask the secret FIRMS MAP_KEY in any URL for safe printing/logging."""
    if secret_key:
        return url.replace(secret_key, "[REDACTED]")
    key = os.getenv("FIRMS_MAP_KEY")
    if key and key in url:
        return url.replace(key, "[REDACTED]")
    return re.sub(r"/csv/[a-zA-Z0-9_-]+/", "/csv/[REDACTED]/", url)


def generate_oct_nov_windows(year: int, day_limit: int = FIRMS_DAY_LIMIT) -> List[Tuple[str, int]]:
    """Generate date windows for 1 Oct to 30 Nov of a given year respecting the day limit.

    Returns a list of (start_date_str, day_range) tuples where day_range <= day_limit.
    """
    start_date = date(year, 10, 1)
    end_date = date(year, 11, 30)

    windows = []
    curr = start_date
    while curr <= end_date:
        days_remaining = (end_date - curr).days + 1
        day_range = min(day_limit, days_remaining)
        windows.append((curr.strftime("%Y-%m-%d"), day_range))
        curr += timedelta(days=day_range)

    return windows


def fetch_firms_window(
    map_key: str,
    source: str,
    bbox: Tuple[float, float, float, float],
    start_date: str,
    day_range: int,
    max_retries: int = 3,
    backoff_factor: float = 1.5,
) -> str:
    """Fetch active fire detections for a single window from the FIRMS Area API with exponential backoff."""
    min_lon, min_lat, max_lon, max_lat = bbox
    area_coords = f"{min_lon},{min_lat},{max_lon},{max_lat}"

    url = f"{FIRMS_API_BASE}/{map_key}/{source}/{area_coords}/{day_range}/{start_date}"
    safe_url = sanitize_url(url, secret_key=map_key)

    attempt = 0
    delay = 1.0
    while attempt < max_retries:
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "VAAYU-Research-Client/1.0"},
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                content = response.read().decode("utf-8")
                return content
        except (urllib.error.URLError, TimeoutError) as exc:
            attempt += 1
            if attempt >= max_retries:
                raise RuntimeError(
                    f"Failed to fetch {safe_url} after {max_retries} attempts: {exc}"
                ) from exc
            time.sleep(delay)
            delay *= backoff_factor

    raise RuntimeError(f"Unexpected termination fetching {safe_url}")


def fetch_and_cache_firms(
    years: Sequence[int] = range(2019, 2026),
    source: str = DEFAULT_SOURCE,
    bbox: Tuple[float, float, float, float] = PUNJAB_REGION_BOX,
    cache_dir: Path = Path("data/raw/firms"),
) -> Tuple[List[Path], List[str]]:
    """Fetch active fire detections for Oct-Nov across years, caching raw CSVs to disk."""
    map_key = get_firms_key()
    cache_dir.mkdir(parents=True, exist_ok=True)

    downloaded_files: List[Path] = []
    failed_windows: List[str] = []

    for year in years:
        windows = generate_oct_nov_windows(year)
        for start_date, day_range in windows:
            cache_file = cache_dir / f"{source}_{year}_{start_date}_{day_range}.csv"

            if cache_file.exists():
                downloaded_files.append(cache_file)
                continue

            try:
                csv_data = fetch_firms_window(
                    map_key=map_key,
                    source=source,
                    bbox=bbox,
                    start_date=start_date,
                    day_range=day_range,
                )
                cache_file.write_text(csv_data, encoding="utf-8")
                downloaded_files.append(cache_file)
            except Exception as err:
                failed_desc = f"{source} {start_date} ({day_range}d): {err}"
                failed_windows.append(failed_desc)

    return downloaded_files, failed_windows


# --- Pure Functions (Zero Network) ---

def load_cached_firms(cache_dir: Path = Path("data/raw/firms")) -> pd.DataFrame:
    """Load and concatenate all cached raw FIRMS CSVs into a single DataFrame."""
    files = sorted(cache_dir.glob("*.csv"))
    if not files:
        return pd.DataFrame()
    dfs = [pd.read_csv(f) for f in files]
    return pd.concat(dfs, ignore_index=True)


def yearly_counts(df: pd.DataFrame) -> pd.Series:
    """Count active fire detections per year for October and November."""
    if df.empty or "acq_date" not in df.columns:
        return pd.Series(dtype=int)

    dates = pd.to_datetime(df["acq_date"], errors="coerce")
    oct_nov_mask = dates.dt.month.isin([10, 11])
    filtered_dates = dates[oct_nov_mask]

    return filtered_dates.dt.year.value_counts().sort_index()


def utc_hhmm_to_ist_hour(acq_time: Union[int, str]) -> int:
    """Convert UTC HHMM time string or integer to Indian Standard Time (IST = UTC+05:30) hour [0..23]."""
    val = int(acq_time)
    utc_hours = val // 100
    utc_minutes = val % 100
    total_minutes = (utc_hours * 60 + utc_minutes + 330) % 1440
    return total_minutes // 60


def overpass_histogram(df: pd.DataFrame) -> pd.Series:
    """Compute fire detection distribution across the 24 hours of the day in IST."""
    if df.empty or "acq_time" not in df.columns:
        return pd.Series(0, index=range(24), dtype=int)

    ist_hours = df["acq_time"].dropna().apply(utc_hhmm_to_ist_hour)
    counts = ist_hours.value_counts()
    # Ensure all 24 hours (0..23) are represented
    return counts.reindex(range(24), fill_value=0).sort_index()


def counts_by_confidence(df: pd.DataFrame) -> pd.Series:
    """Count detections per confidence classification without applying any filtering."""
    if df.empty or "confidence" not in df.columns:
        return pd.Series(dtype=int)
    return df["confidence"].value_counts()


# --- Matplotlib Visualizations ---

def plot_yearly_counts(
    df: pd.DataFrame,
    output_path: Path = Path("figures/fire_counts_by_year.png"),
) -> None:
    """Generate and save bar chart of fire detections by year with required caption."""
    counts = yearly_counts(df)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(8, 5), dpi=150)

    if not counts.empty:
        bars = ax.bar(counts.index, counts.values, color="#d95f02", width=0.6, edgecolor="#333333")
        for bar in bars:
            height = bar.get_height()
            ax.annotate(
                f"{int(height):,}",
                xy=(bar.get_x() + bar.get_width() / 2, height),
                xytext=(0, 3),
                textcoords="offset points",
                ha="center",
                va="bottom",
                fontsize=9,
                fontweight="bold",
            )
        ax.set_xticks(counts.index)
    else:
        ax.text(0.5, 0.5, "No fire detection data available", ha="center", va="center")

    ax.set_title("VIIRS Active Fire Detections (2019–2025)", fontsize=13, fontweight="bold", pad=12)
    ax.set_xlabel("Year", fontsize=11)
    ax.set_ylabel("Total Detections (Oct–Nov)", fontsize=11)
    ax.grid(axis="y", linestyle="--", alpha=0.5)

    # Required caption
    caption = "VIIRS detections, Punjab-region box, Oct-Nov. Consistent with the iFOREST finding [2], not proof of it."
    fig.text(0.5, 0.01, caption, ha="center", fontsize=8.5, style="italic", wrap=True)

    plt.tight_layout(rect=[0, 0.05, 1, 1])
    plt.savefig(output_path, bbox_inches="tight")
    plt.close(fig)


def plot_overpass_hours(
    df: pd.DataFrame,
    output_path: Path = Path("figures/overpass_hours.png"),
) -> None:
    """Generate and save histogram of fire detections by IST hour with required caption."""
    hist = overpass_histogram(df)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(9, 5), dpi=150)

    ax.bar(hist.index, hist.values, color="#7570b3", width=0.8, edgecolor="#333333")
    ax.set_xticks(range(0, 24))
    ax.set_xticklabels([f"{h:02d}" for h in range(24)], fontsize=8)

    ax.set_title("VIIRS Active Fire Detections by Hour of Day (IST)", fontsize=13, fontweight="bold", pad=12)
    ax.set_xlabel("Hour of Day (IST, UTC+05:30)", fontsize=11)
    ax.set_ylabel("Total Detections", fontsize=11)
    ax.grid(axis="y", linestyle="--", alpha=0.5)

    # Required caption
    caption = "What the polar sensor can see: detections cluster at its overpass times. This does not show when farmers burn."
    fig.text(0.5, 0.01, caption, ha="center", fontsize=8.5, style="italic", wrap=True)

    plt.tight_layout(rect=[0, 0.05, 1, 1])
    plt.savefig(output_path, bbox_inches="tight")
    plt.close(fig)


if __name__ == "__main__":
    print("FIRMS Active Fire Module for VAAYU loaded.")
    print("To execute network fetching, call fetch_and_cache_firms() with user confirmation.")
