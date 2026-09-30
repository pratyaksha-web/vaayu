"""Unit tests for Forecast and Observation Archiver (offline with mocked HTTP)."""

from datetime import datetime, timezone
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

from archive_forecasts import (
    archive_current_forecasts,
    archive_observations,
    fetch_live_station_forecast,
)


@pytest.fixture
def mock_openmeteo_responses():
    """Synthetic Open-Meteo responses covering 96 hours."""
    times = [
        (datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc) + pd.Timedelta(hours=i)).strftime("%Y-%m-%dT%H:00")
        for i in range(96)
    ]
    aq_resp = {
        "hourly": {
            "time": times,
            "pm2_5": [50.0 + (i % 20) for i in range(96)],
            "pm10": [110.0 + (i % 30) for i in range(96)],
            "ozone": [25.0 + (i % 15) for i in range(96)],
            "nitrogen_dioxide": [35.0 + (i % 10) for i in range(96)],
        }
    }
    wx_resp = {
        "hourly": {
            "time": times,
            "temperature_2m": [22.0 + (i % 5) for i in range(96)],
            "relative_humidity_2m": [60.0 for _ in range(96)],
            "wind_speed_10m": [3.0 for _ in range(96)],
            "wind_direction_10m": [270.0 for _ in range(96)],
            "boundary_layer_height": [500.0 for _ in range(96)],
            "surface_pressure": [1012.0 for _ in range(96)],
        }
    }
    return aq_resp, wx_resp


def test_archive_forecasts_offline(tmp_path, mock_openmeteo_responses):
    """Verify archive_current_forecasts generates valid parquet archive without network calls."""
    aq_resp, wx_resp = mock_openmeteo_responses

    def mock_request(url, params=None):
        if "air-quality" in url:
            return aq_resp
        return wx_resp

    # Create dummy stations CSV
    st_csv = tmp_path / "stations.csv"
    st_csv.write_text(
        "id,name,lat,lon\n"
        "test_station,\"Test Station, Delhi\",28.6,77.2\n",
        encoding="utf-8",
    )

    issue_time = pd.Timestamp("2026-10-01 06:00:00", tz="Asia/Kolkata")
    out_dir = tmp_path / "forecasts"

    saved_path = archive_current_forecasts(
        stations_csv=st_csv,
        archive_dir=out_dir,
        issue_time=issue_time,
        forecast_days=4,
        request_fn=mock_request,
        save_format="parquet",
    )

    assert saved_path.exists()
    assert saved_path.suffix == ".parquet"

    df = pd.read_parquet(saved_path)
    assert len(df) > 0
    assert "station_id" in df.columns
    assert "lead_h" in df.columns
    assert "valid_time" in df.columns
    assert "pm2_5" in df.columns
    assert "temperature_2m" in df.columns

    # Verify lead times are positive integers
    assert (df["lead_h"] >= 1).all()
    assert df["station_id"].iloc[0] == "test_station"


def test_archive_observations_offline(tmp_path):
    """Verify archive_observations parses OpenAQ payload and appends records without network access."""
    mock_openaq_payload = {
        "results": [
            {
                "parameter": {"name": "pm25"},
                "value": 142.5,
                "datetime": {"utc": "2026-10-01T06:00:00Z"},
            },
            {
                "parameter": {"name": "pm10"},
                "value": 265.0,
                "datetime": {"utc": "2026-10-01T06:00:00Z"},
            },
        ]
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_openaq_payload

    obs_dir = tmp_path / "obs"

    with patch("requests.get", return_value=mock_resp):
        out_path = archive_observations(
            obs_dir=obs_dir,
            api_key="mock_secret_key_123",
            save_format="parquet",
        )

    assert out_path is not None
    assert out_path.exists()

    df_obs = pd.read_parquet(out_path)
    assert len(df_obs) > 0
    assert "pm25" in df_obs.columns
    assert "pm10" in df_obs.columns
    assert (df_obs["pm25"] == 142.5).any()
    assert (df_obs["pm10"] == 265.0).any()
