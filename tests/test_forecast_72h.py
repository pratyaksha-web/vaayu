"""Unit tests for the 72-Hour VAAYU forecast system.

Tests:
1. Schema validation of data/forecast.json.
2. Lead times coverage: strictly 1..72 with no gaps.
3. Monotonicity of quantiles (p10 <= p50 <= p90) and non-negativity across all pollutants and AQI.
4. Leakage test: modifying data after issue time does not alter features or predictions.
5. AQI conversion matches aqi.py official CPCB logic for known benchmark values.
6. Offline pipeline execution: end-to-end station forecast generation with mocked HTTP layer.
"""

from datetime import date, datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

import aqi
from fetch_drivers import fetch_forecast_drivers
from forecast_model import (
    FEATURE_COLUMNS,
    POLLUTANTS,
    build_samples_for_issue_time,
    load_models,
    predict_quantiles,
)
from run_forecast import (
    compute_p_severe_for_lead,
    convert_pm_to_aqi,
    generate_forecast_for_station,
)

FORECAST_JSON_PATH = Path("data/forecast.json")


# ==============================================================================
# 1. Schema Validation of forecast.json
# ==============================================================================

def test_forecast_json_schema():
    """Verify that data/forecast.json exists and strictly adheres to the required schema."""
    assert FORECAST_JSON_PATH.exists(), f"File {FORECAST_JSON_PATH} does not exist"

    with open(FORECAST_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Top-level schema
    assert "issued_at" in data, "Missing top-level key: issued_at"
    assert "model_version" in data, "Missing top-level key: model_version"
    assert "stations" in data, "Missing top-level key: stations"
    assert isinstance(data["stations"], list)
    assert len(data["stations"]) > 0, "No stations present in forecast.json"

    # Verify issued_at format
    try:
        datetime.fromisoformat(data["issued_at"])
    except ValueError:
        pytest.fail(f"issued_at '{data['issued_at']}' is not a valid ISO 8601 string")

    # Verify station schemas
    for st in data["stations"]:
        assert "id" in st and isinstance(st["id"], str)
        assert "name" in st and isinstance(st["name"], str)
        assert "lat" in st and isinstance(st["lat"], (int, float))
        assert "lon" in st and isinstance(st["lon"], (int, float))
        assert "hourly" in st and isinstance(st["hourly"], list)
        assert "p_severe" in st and isinstance(st["p_severe"], dict)

        # Check p_severe
        p_sev = st["p_severe"]
        for key in ["24h", "48h", "72h"]:
            assert key in p_sev, f"Missing p_severe key '{key}' for station {st['id']}"
            assert 0.0 <= p_sev[key] <= 1.0, f"p_severe[{key}] out of bounds [0, 1]: {p_sev[key]}"

        # Check hourly records
        for hour in st["hourly"]:
            for key in ["valid_time", "lead_h", "pm25", "pm10", "o3", "no2", "aqi_pm", "category"]:
                assert key in hour, f"Missing hourly key '{key}' in station {st['id']}"

            assert isinstance(hour["lead_h"], int)
            assert isinstance(hour["category"], str) and len(hour["category"]) > 0

            for pol in ["pm25", "pm10", "o3", "no2", "aqi_pm"]:
                q_dict = hour[pol]
                assert "p10" in q_dict and "p50" in q_dict and "p90" in q_dict
                assert isinstance(q_dict["p10"], (int, float))
                assert isinstance(q_dict["p50"], (int, float))
                assert isinstance(q_dict["p90"], (int, float))


# ==============================================================================
# 2. Lead Times Coverage (1..72 without gaps)
# ==============================================================================

def test_lead_times_cover_1_to_72_no_gaps():
    """Verify that hourly forecast lead times strictly cover 1..72 with no missing hours."""
    assert FORECAST_JSON_PATH.exists()

    with open(FORECAST_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    expected_leads = list(range(1, 73))

    for st in data["stations"]:
        lead_times = [h["lead_h"] for h in st["hourly"]]
        assert len(lead_times) == 72, f"Station {st['id']} has {len(lead_times)} leads instead of 72"
        assert lead_times == expected_leads, f"Station {st['id']} lead times do not strictly match 1..72"


# ==============================================================================
# 3. Quantile Monotonicity (p10 <= p50 <= p90)
# ==============================================================================

def test_quantiles_monotonicity_and_bounds():
    """Verify that p10 <= p50 <= p90 and all concentrations/AQI are non-negative."""
    assert FORECAST_JSON_PATH.exists()

    with open(FORECAST_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    for st in data["stations"]:
        for h in st["hourly"]:
            lead = h["lead_h"]
            for pol in ["pm25", "pm10", "o3", "no2", "aqi_pm"]:
                q = h[pol]
                p10, p50, p90 = q["p10"], q["p50"], q["p90"]

                assert p10 >= 0.0, f"Station {st['id']} lead {lead} {pol} p10 < 0: {p10}"
                assert p10 <= p50, f"Station {st['id']} lead {lead} {pol} p10 ({p10}) > p50 ({p50})"
                assert p50 <= p90, f"Station {st['id']} lead {lead} {pol} p50 ({p50}) > p90 ({p90})"


def test_predict_quantiles_enforce_monotonicity():
    """Verify predict_quantiles utility explicitly enforces p10 <= p50 <= p90."""
    # Create mock models where raw p50 is lower than raw p10
    mock_models = {
        "pm25": {
            0.10: MagicMock(predict=lambda X: np.array([120.0])),
            0.50: MagicMock(predict=lambda X: np.array([80.0])),  # Inversion: raw p50 < p10
            0.90: MagicMock(predict=lambda X: np.array([150.0])),
        }
    }
    dummy_X = pd.DataFrame([np.zeros(len(FEATURE_COLUMNS))], columns=FEATURE_COLUMNS)
    preds = predict_quantiles(mock_models, dummy_X, enforce_monotonic=True)

    p10 = preds["pm25"]["p10"][0]
    p50 = preds["pm25"]["p50"][0]
    p90 = preds["pm25"]["p90"][0]

    assert p10 <= p50 <= p90
    assert p10 == 120.0
    assert p50 == 120.0  # Enforced to be >= p10
    assert p90 == 150.0


# ==============================================================================
# 4. Leakage Test: Zero information from T > T_issue
# ==============================================================================

def test_no_feature_leakage_after_issue_time():
    """Mutate every observation after issue_time and verify features are unchanged."""
    issue_time = pd.Timestamp("2025-12-01 12:00:00", tz="Asia/Kolkata")
    station_id = "test_station"

    obs_map_clean = {}
    driver_map_clean = {}

    # Past 48 hours and future 72 hours
    for h in range(-48, 73):
        t = issue_time + pd.Timedelta(hours=h)
        obs_map_clean[(station_id, t)] = {
            "pm25": 100.0 + h,
            "pm10": 200.0 + h,
            "o3": 30.0 + h,
            "no2": 40.0 + h,
        }

        if h > 0:
            driver_map_clean[(station_id, t)] = {
                "timestamp": t,
                "pm2_5": 80.0 + h,
                "pm10": 160.0 + h,
                "ozone": 25.0,
                "nitrogen_dioxide": 35.0,
                "temperature_2m": 18.0,
                "relative_humidity_2m": 60.0,
                "wind_speed_10m": 3.0,
                "wind_direction_10m": 270.0,
                "boundary_layer_height": 500.0,
                "surface_pressure": 1010.0,
            }

    # Generate baseline feature set
    samples_clean = build_samples_for_issue_time(
        issue_time=issue_time,
        station_id=station_id,
        obs_map=obs_map_clean,
        driver_map=driver_map_clean,
        max_lead_h=72,
    )
    df_clean = pd.DataFrame(samples_clean)[FEATURE_COLUMNS]

    # Corrupt future observations: inject extreme spikes for all t > issue_time
    obs_map_corrupted = obs_map_clean.copy()
    for h in range(1, 73):
        future_t = issue_time + pd.Timedelta(hours=h)
        obs_map_corrupted[(station_id, future_t)] = {
            "pm25": 999999.0,
            "pm10": 999999.0,
            "o3": 999999.0,
            "no2": 999999.0,
        }

    samples_corrupted = build_samples_for_issue_time(
        issue_time=issue_time,
        station_id=station_id,
        obs_map=obs_map_corrupted,
        driver_map=driver_map_clean,
        max_lead_h=72,
    )
    df_corrupted = pd.DataFrame(samples_corrupted)[FEATURE_COLUMNS]

    # Verify exact equality: corrupting future observations had ZERO effect on features
    pd.testing.assert_frame_equal(df_clean, df_corrupted)

    # Sanity check: altering observations at or before issue_time MUST alter persistence feature
    obs_map_past_changed = obs_map_clean.copy()
    obs_map_past_changed[(station_id, issue_time)] = {
        "pm25": 999.0,
        "pm10": 999.0,
        "o3": 999.0,
        "no2": 999.0,
    }
    samples_past_changed = build_samples_for_issue_time(
        issue_time=issue_time,
        station_id=station_id,
        obs_map=obs_map_past_changed,
        driver_map=driver_map_clean,
        max_lead_h=72,
    )
    df_past_changed = pd.DataFrame(samples_past_changed)[FEATURE_COLUMNS]

    assert not df_clean["last_obs_pm25"].equals(df_past_changed["last_obs_pm25"]), (
        "Persistence feature last_obs_pm25 should reflect changes to issue-time observations"
    )


# ==============================================================================
# 5. AQI Conversion Matches aqi.py
# ==============================================================================

def test_aqi_conversion_matches_cpcb_engine():
    """Verify convert_pm_to_aqi matches aqi.aqi and aqi.category across standard breakpoints."""
    # Test cases: (pm25, pm10, expected_aqi, expected_cat)
    cases = [
        (30.0, 50.0, 50.0, "Good"),
        (60.0, 100.0, 100.0, "Satisfactory"),
        (90.0, 250.0, 200.0, "Moderate"),
        (120.0, 350.0, 300.0, "Poor"),
        (250.0, 430.0, 400.0, "Very Poor"),
        (380.0, 500.0, 500.0, "Severe"),
        (380.0, 400.0, 452.0, "Severe"),
    ]

    for p25, p10, exp_aqi, exp_cat in cases:
        calc_aqi, calc_cat = convert_pm_to_aqi(p25, p10)
        assert calc_aqi is not None
        assert abs(calc_aqi - exp_aqi) <= 1.0, f"AQI mismatch for ({p25}, {p10}): got {calc_aqi}, exp {exp_aqi}"
        assert calc_cat == exp_cat, f"Category mismatch for ({p25}, {p10}): got {calc_cat}, exp {exp_cat}"

        # Verify exact match with direct aqi.py calls
        ref_aqi = aqi.aqi({"PM2.5": p25, "PM10": p10})
        ref_cat = aqi.category(ref_aqi)
        assert calc_aqi == ref_aqi
        assert calc_cat == ref_cat

    # Dominant pollutant behavior
    # PM2.5 dominates: PM2.5=90 (AQI 200), PM10=50 (AQI 50) -> overall 200
    aqi_val, cat_val = convert_pm_to_aqi(90.0, 50.0)
    assert aqi_val == 200.0
    assert cat_val == "Moderate"

    # Single pollutant available
    aqi_pm25_only, _ = convert_pm_to_aqi(60.0, None)
    assert aqi_pm25_only == 100.0

    aqi_pm10_only, _ = convert_pm_to_aqi(None, 100.0)
    assert aqi_pm10_only == 100.0


# ==============================================================================
# 6. Offline Pipeline Execution (Mocked HTTP Layer)
# ==============================================================================

def test_pipeline_runs_offline_mocked(tmp_path):
    """Verify that the end-to-end station forecast pipeline executes without network access."""
    today = date.today()
    issue_time = pd.Timestamp(f"{today.isoformat()} 06:00:00", tz="Asia/Kolkata")

    # 1. Create synthetic driver responses matching Open-Meteo format for today
    base_t0 = pd.Timestamp(f"{today.isoformat()} 00:00:00")
    times = [(base_t0 + pd.Timedelta(hours=i)).strftime("%Y-%m-%dT%H:00") for i in range(120)]

    mock_aq_response = {
        "hourly": {
            "time": times,
            "pm2_5": [45.0 + (i % 20) for i in range(120)],
            "pm10": [90.0 + (i % 30) for i in range(120)],
            "ozone": [20.0 + (i % 10) for i in range(120)],
            "nitrogen_dioxide": [30.0 + (i % 15) for i in range(120)],
        }
    }
    mock_wx_response = {
        "hourly": {
            "time": times,
            "temperature_2m": [15.0 + (i % 5) for i in range(120)],
            "relative_humidity_2m": [65.0 for _ in range(120)],
            "wind_speed_10m": [2.5 for _ in range(120)],
            "wind_direction_10m": [280.0 for _ in range(120)],
            "boundary_layer_height": [600.0 for _ in range(120)],
            "surface_pressure": [1013.0 for _ in range(120)],
        }
    }

    # Mock response object for requests.get
    def mock_get(url, *args, **kwargs):
        resp = MagicMock()
        resp.status_code = 200
        if "air-quality-api" in url:
            resp.json.return_value = mock_aq_response
        else:
            resp.json.return_value = mock_wx_response
        resp.raise_for_status = MagicMock()
        return resp

    # 2. Synthetic observations
    obs_data = []
    for h in range(-24, 1):
        t = issue_time + pd.Timedelta(hours=h)
        obs_data.append({
            "station_id": "mock_station",
            "timestamp": t,
            "pm25": 110.0,
            "pm10": 210.0,
            "o3": 25.0,
            "no2": 35.0,
        })
    obs_df = pd.DataFrame(obs_data)

    # 3. Create dummy quantile regression models
    dummy_models = {}
    for pol in POLLUTANTS:
        dummy_models[pol] = {
            0.10: MagicMock(predict=lambda X: np.full(len(X), 50.0)),
            0.50: MagicMock(predict=lambda X: np.full(len(X), 100.0)),
            0.90: MagicMock(predict=lambda X: np.full(len(X), 150.0)),
        }

    # 4. Fetch drivers using mocked requests.get into tmp_path cache
    with patch("requests.get", side_effect=mock_get):
        driver_df = fetch_forecast_drivers(
            station_id="mock_station",
            lat=28.6,
            lon=77.2,
            forecast_days=4,
            cache_dir=tmp_path,
        )

        result = generate_forecast_for_station(
            station_id="mock_station",
            station_name="Mock Station",
            lat=28.6,
            lon=77.2,
            issue_time=issue_time,
            models=dummy_models,
            obs_df=obs_df,
            driver_df=driver_df,
            max_lead_h=72,
        )

    # 5. Assert structure and valid outputs
    assert result["id"] == "mock_station"
    assert len(result["hourly"]) == 72
    assert result["hourly"][0]["lead_h"] == 1
    assert result["hourly"][71]["lead_h"] == 72
    assert "24h" in result["p_severe"]
    assert "48h" in result["p_severe"]
    assert "72h" in result["p_severe"]
    assert result["hourly"][0]["pm25"]["p50"] == 100.0
    assert result["hourly"][0]["pm10"]["p50"] == 100.0


# ==============================================================================
# 7. Rolling Bias Correction & Zero-Leakage Test
# ==============================================================================

def test_rolling_bias_series_leak_free():
    """Verify that trailing 7-day rolling bias strictly uses t <= issue_time."""
    from forecast_model import compute_rolling_bias_series, get_rolling_bias_at_time

    # Create synthetic observations and driver series
    times = pd.date_range("2025-11-01", "2025-11-15", freq="1h", tz="Asia/Kolkata")
    st_df = pd.DataFrame([{"id": "st1", "name": "Station 1", "lat": 28.5, "lon": 77.2}])

    # CAMS driver = 100, Obs = 150 (residual = +50)
    obs_rows = [{"timestamp": t, "station_id": "st1", "pm25": 150.0, "pm10": 250.0, "o3": 20.0, "no2": 40.0} for t in times]
    drv_rows = [{"timestamp": t, "station_id": "st1", "pm2_5": 100.0, "pm10": 200.0, "ozone": 50.0, "nitrogen_dioxide": 60.0} for t in times]

    biases = compute_rolling_bias_series(pd.DataFrame(obs_rows), pd.DataFrame(drv_rows), st_df)
    assert "st1" in biases
    assert "pm25" in biases["st1"]

    # Issue time at Nov 10 12:00
    issue_t = pd.Timestamp("2025-11-10 12:00:00", tz="Asia/Kolkata")
    bias_pm25 = get_rolling_bias_at_time(biases["st1"]["pm25"], issue_t)
    assert pytest.approx(bias_pm25, 0.1) == 50.0

    # Modify future observations (Nov 11 onwards) to 1000
    obs_modified = [dict(r) for r in obs_rows]
    for r in obs_modified:
        if r["timestamp"] > issue_t:
            r["pm25"] = 1000.0

    biases_mod = compute_rolling_bias_series(pd.DataFrame(obs_modified), pd.DataFrame(drv_rows), st_df)
    bias_pm25_mod = get_rolling_bias_at_time(biases_mod["st1"]["pm25"], issue_t)

    # Bias at issue_t must remain strictly unchanged
    assert bias_pm25_mod == bias_pm25, "Future observation leakage detected in rolling bias calculation!"


# ==============================================================================
# 8. CAMS Bias Correction & Non-Negativity
# ==============================================================================

def test_compute_cams_bc():
    """Verify CAMS bias correction addition and physical non-negativity constraint."""
    from forecast_model import compute_cams_bc

    # Positive bias
    assert compute_cams_bc(100.0, 25.0) == 125.0

    # Negative bias bounded by 0
    assert compute_cams_bc(20.0, -50.0) == 0.0

    # Vectorized
    cams_arr = np.array([50.0, 10.0, 0.0])
    bias_arr = np.array([10.0, -30.0, 5.0])
    out = compute_cams_bc(cams_arr, bias_arr)
    np.testing.assert_array_equal(out, np.array([60.0, 0.0, 5.0]))


# ==============================================================================
# 9. Lead-Aware Blend & Bucket Weighting
# ==============================================================================

def test_lead_aware_blend():
    """Verify lead-aware blend applies lead-bucket weights and handles missing persistence."""
    from forecast_model import compute_lead_blend

    # PM2.5 weights: 1-24h -> 0.5, 25-48h -> 0.25, 49-72h -> 0.10
    pers = 100.0
    c_bc = 60.0

    # Lead 12h: 0.5 * 100 + 0.5 * 60 = 80
    assert pytest.approx(compute_lead_blend(pers, c_bc, "pm25", 12)) == 80.0

    # Lead 36h: 0.25 * 100 + 0.75 * 60 = 70
    assert pytest.approx(compute_lead_blend(pers, c_bc, "pm25", 36)) == 70.0

    # Lead 60h: 0.10 * 100 + 0.90 * 60 = 64
    assert pytest.approx(compute_lead_blend(pers, c_bc, "pm25", 60)) == 64.0

    # Missing persistence falls back to CAMS BC
    assert pytest.approx(compute_lead_blend(np.nan, c_bc, "pm25", 12)) == 60.0


# ==============================================================================
# 10. Isotonic Calibration Bounds & Monotonicity
# ==============================================================================

def test_isotonic_calibration_bounds():
    """Verify Isotonic Regression yields probabilities strictly in [0, 1] and monotonic."""
    from sklearn.isotonic import IsotonicRegression

    # Synthetic training probabilities and binary outcomes
    p_train = np.array([0.1, 0.2, 0.4, 0.5, 0.7, 0.9])
    y_train = np.array([0, 0, 1, 0, 1, 1])

    iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    iso.fit(p_train, y_train)

    p_test = np.array([-0.5, 0.05, 0.3, 0.6, 0.85, 1.5])
    cal_preds = iso.predict(p_test)

    assert np.all(cal_preds >= 0.0)
    assert np.all(cal_preds <= 1.0)
    assert np.all(np.diff(cal_preds) >= 0.0), "Calibrated probabilities must be monotonic"


# ==============================================================================
# 11. Multi-Winter Observation Audit Structure
# ==============================================================================

def test_multi_winter_audit_structure():
    """Verify that audit_all_winters covers all 6 winter seasons without crashes."""
    from verify_forecast import ALL_WINTERS, audit_all_winters
    from forecast_model import load_all_observations
    from fetch_drivers import load_stations, DEFAULT_STATIONS_CSV

    obs_df = load_all_observations()
    stations_df = load_stations(DEFAULT_STATIONS_CSV)
    audit = audit_all_winters(obs_df, stations_df)

    assert len(audit) == len(ALL_WINTERS)
    for w_name, _, _ in ALL_WINTERS:
        assert w_name in audit
        assert "calendar_hours" in audit[w_name]
        assert "stations" in audit[w_name]
        for st_id in stations_df["id"]:
            assert st_id in audit[w_name]["stations"]
            st_data = audit[w_name]["stations"][st_id]
            for p in ["pm25", "pm10", "no2", "o3"]:
                assert p in st_data
                assert "valid_hours" in st_data[p]
                assert "missing_hours" in st_data[p]
                assert st_data[p]["valid_hours"] + st_data[p]["missing_hours"] == audit[w_name]["calendar_hours"]

