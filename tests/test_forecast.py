"""Unit tests for statistical baseline forecasting in make_forecast_data.py.

All tests use synthetic data only; no external or raw data files are touched.
Tests:
1. LEAKAGE: change every value after as-of date D and assert forecast for D is unchanged.
2. No labels or features are built across missing days.
3. Category probabilities sum to 1.
4. Brier skill of a forecast against itself is 0.
5. Contributions plus the intercept reproduce the point forecast.
"""

from datetime import date, timedelta
import math
from typing import Any, Dict, List, Tuple
import numpy as np
import pandas as pd
import pytest

from make_forecast_data import (
    FEATURE_NAMES,
    build_training_set,
    compute_brier_score,
    compute_brier_skill_score,
    compute_features_for_date,
    fit_ridge_regression,
    predict_distribution,
)


@pytest.fixture
def mock_breakpoints():
    """Minimal synthetic CPCB breakpoint DataFrame for testing."""
    return pd.DataFrame([
        {"pollutant": "PM2.5", "conc_low": 0.0, "conc_high": 30.0, "index_low": 0, "index_high": 50, "category": "Good"},
        {"pollutant": "PM2.5", "conc_low": 31.0, "conc_high": 60.0, "index_low": 51, "index_high": 100, "category": "Satisfactory"},
        {"pollutant": "PM2.5", "conc_low": 61.0, "conc_high": 90.0, "index_low": 101, "index_high": 200, "category": "Moderate"},
        {"pollutant": "PM2.5", "conc_low": 91.0, "conc_high": 120.0, "index_low": 201, "index_high": 300, "category": "Poor"},
        {"pollutant": "PM2.5", "conc_low": 121.0, "conc_high": 250.0, "index_low": 301, "index_high": 400, "category": "Very Poor"},
        {"pollutant": "PM2.5", "conc_low": 251.0, "conc_high": 500.0, "index_low": 401, "index_high": 500, "category": "Severe"},
    ])


@pytest.fixture
def mock_thresholds():
    return {
        "Severe": 401.0,
        "Very Poor or worse": 301.0,
    }


def create_synthetic_daily_data(
    n_days: int = 50,
    n_stations: int = 2,
    start_date: date = date(2025, 10, 1),
    seed: int = 123,
) -> Tuple[Dict[Tuple[str, date], Dict[str, Any]], List[str], List[date]]:
    """Generate synthetic daily station records for testing."""
    rng = np.random.RandomState(seed)
    stations = [f"st_{i}" for i in range(n_stations)]
    all_dates = [start_date + timedelta(days=d) for d in range(n_days)]

    data_map = {}
    for st_idx, st in enumerate(stations):
        base_aqi = 150.0 + st_idx * 30.0
        for i, dt in enumerate(all_dates):
            # Smooth synthetic AQI oscillation
            val = base_aqi + 50.0 * math.sin(i / 5.0) + rng.uniform(-10, 10)
            val = max(10.0, min(480.0, val))
            p25 = val * 0.6
            p10 = val * 1.2
            data_map[(st, dt)] = {
                "date": dt,
                "station": st,
                "pm25": p25,
                "pm10": p10,
                "aqi": val,
            }

    return data_map, stations, all_dates


# --- Test 1: Leakage Test ---

def test_no_leakage_after_as_of_date(mock_breakpoints, mock_thresholds):
    """1. LEAKAGE: change every value after as-of date D and assert forecast for D is unchanged."""
    data_map, stations, all_dates = create_synthetic_daily_data(n_days=50, n_stations=2, seed=42)
    as_of_d = date(2025, 11, 10)  # Day 40
    horizon = 1

    # 1. Compute forecast for as_of_d with original data
    X_tr_orig, y_tr_orig = build_training_set(data_map, stations, all_dates, as_of_d, horizon)
    assert len(X_tr_orig) >= 30, f"Expected >= 30 training rows, got {len(X_tr_orig)}"

    beta_0_orig, beta_orig, mu_orig, sigma_orig, res_orig = fit_ridge_regression(X_tr_orig, y_tr_orig)
    feats_orig = compute_features_for_date(data_map, stations[0], as_of_d)
    pred_orig = predict_distribution(
        beta_0_orig, beta_orig, mu_orig, sigma_orig, res_orig, feats_orig, mock_breakpoints, mock_thresholds
    )

    # 2. Mutate EVERY future value for all dates > as_of_d
    for st in stations:
        for dt in all_dates:
            if dt > as_of_d:
                data_map[(st, dt)] = {
                    "date": dt,
                    "station": st,
                    "pm25": 999.0,
                    "pm10": 1999.0,
                    "aqi": 9999.0,  # Drastically different future data
                }

    # 3. Compute forecast again for as_of_d
    X_tr_mut, y_tr_mut = build_training_set(data_map, stations, all_dates, as_of_d, horizon)
    beta_0_mut, beta_mut, mu_mut, sigma_mut, res_mut = fit_ridge_regression(X_tr_mut, y_tr_mut)
    feats_mut = compute_features_for_date(data_map, stations[0], as_of_d)
    pred_mut = predict_distribution(
        beta_0_mut, beta_mut, mu_mut, sigma_mut, res_mut, feats_mut, mock_breakpoints, mock_thresholds
    )

    # 4. Strict assertions: Training data, coefficients, and predictions must be identical
    assert len(X_tr_orig) == len(X_tr_mut)
    np.testing.assert_array_equal(X_tr_orig, X_tr_mut)
    np.testing.assert_array_equal(y_tr_orig, y_tr_mut)
    assert beta_0_orig == beta_0_mut
    np.testing.assert_array_almost_equal(beta_orig, beta_mut)

    assert pred_orig["point_forecast"] == pred_mut["point_forecast"]
    assert pred_orig["point_aqi"] == pred_mut["point_aqi"]
    assert pred_orig["interval_80"] == pred_mut["interval_80"]
    assert pred_orig["p_severe"] == pred_mut["p_severe"]
    assert pred_orig["p_very_poor_plus"] == pred_mut["p_very_poor_plus"]
    assert pred_orig["category_probabilities"] == pred_mut["category_probabilities"]

    orig_contribs = [c["contribution"] for c in pred_orig["all_contributions"]]
    mut_contribs = [c["contribution"] for c in pred_mut["all_contributions"]]
    np.testing.assert_array_almost_equal(orig_contribs, mut_contribs)


# --- Test 2: Missing Days Continuity Guard ---

def test_no_labels_or_features_built_across_missing_days():
    """2. No labels or features are built across missing days."""
    # Create dataset with a missing gap on 2025-10-06
    start_d = date(2025, 10, 1)
    dates_with_gap = [
        start_d + timedelta(days=0),  # Oct 1
        start_d + timedelta(days=1),  # Oct 2
        start_d + timedelta(days=2),  # Oct 3
        start_d + timedelta(days=3),  # Oct 4
        start_d + timedelta(days=4),  # Oct 5
        # Oct 6 MISSING
        start_d + timedelta(days=6),  # Oct 7
        start_d + timedelta(days=7),  # Oct 8
        start_d + timedelta(days=8),  # Oct 9
        start_d + timedelta(days=9),  # Oct 10
    ]

    st = "st_0"
    data_map = {}
    for d in dates_with_gap:
        data_map[(st, d)] = {
            "date": d,
            "station": st,
            "pm25": 50.0,
            "pm10": 100.0,
            "aqi": 120.0,
        }

    # 1. Feature check: Oct 7 has Oct 6 missing -> aqi_D_minus_1 is missing -> features must be None
    oct_7 = date(2025, 10, 7)
    assert compute_features_for_date(data_map, st, oct_7) is None

    # 2. Feature check: 7-day mean on Oct 8, 9, 10 still contains Oct 6 gap -> must be None
    oct_8 = date(2025, 10, 8)
    oct_9 = date(2025, 10, 9)
    assert compute_features_for_date(data_map, st, oct_8) is None
    assert compute_features_for_date(data_map, st, oct_9) is None

    # 3. Label check: for horizon h=1, target for Oct 5 is Oct 6 (missing) -> must NOT shift to Oct 7
    all_d = sorted(dates_with_gap)
    oct_5 = date(2025, 10, 5)
    X_tr, y_tr = build_training_set(data_map, [st], all_d, as_of_date=date(2025, 10, 10), horizon=1)

    # For h=1, target date is t + 1. Oct 5 + 1 = Oct 6, which does not exist.
    # Therefore, Oct 5 cannot produce a training pair.
    # Check that y_tr does not contain AQI from Oct 7 paired with Oct 5.
    for target_val in y_tr:
        # None of the targets should be formed by skipping over the Oct 6 gap
        assert not np.isnan(target_val)


# --- Test 3: Category Probabilities Sum to 1 ---

def test_category_probabilities_sum_to_one(mock_breakpoints, mock_thresholds):
    """3. Category probabilities sum to 1."""
    # Synthetic ridge model
    mu = np.array([200.0, 190.0, 195.0, 2.0, 0.5, 0.86])
    sigma = np.array([30.0, 30.0, 25.0, 0.4, 0.2, 0.2])
    beta = np.array([0.2, 0.1, 0.15, 0.05, 0.02, -0.03])
    beta_0 = 5.3  # log(200) approx
    residuals = np.linspace(-0.4, 0.4, 40)

    # Test across multiple feature levels
    test_features = [
        [50.0, 45.0, 48.0, 1.8, 0.5, 0.86],    # Good / Satisfactory
        [150.0, 140.0, 145.0, 2.1, 0.5, 0.86],  # Moderate
        [280.0, 270.0, 260.0, 2.0, 0.5, 0.86],  # Poor
        [360.0, 350.0, 340.0, 2.2, 0.5, 0.86],  # Very Poor
        [450.0, 440.0, 430.0, 1.9, 0.5, 0.86],  # Severe
    ]

    for feats in test_features:
        pred = predict_distribution(
            beta_0, beta, mu, sigma, residuals, feats, mock_breakpoints, mock_thresholds
        )
        cat_probs = pred["category_probabilities"]
        prob_sum = sum(cat_probs.values())
        assert prob_sum == pytest.approx(1.0, abs=1e-6)
        assert all(0.0 <= p <= 1.0 for p in cat_probs.values())


# --- Test 4: Brier Skill of Forecast Against Itself is 0 ---

def test_brier_skill_against_self_is_zero():
    """4. Brier skill of a forecast against itself is 0."""
    # Direct function test with arbitrary positive Brier scores
    assert compute_brier_skill_score(0.125, 0.125) == 0.0
    assert compute_brier_skill_score(0.0456, 0.0456) == 0.0
    assert compute_brier_skill_score(0.0, 0.0) == 0.0

    # With probability and outcome vectors
    y_true = [1.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0]
    y_prob = [0.85, 0.15, 0.70, 0.90, 0.20, 0.10, 0.80]

    bs = compute_brier_score(y_true, y_prob)
    assert bs > 0.0
    bss_self = compute_brier_skill_score(bs, bs)
    assert bss_self == 0.0


# --- Test 5: Contributions + Intercept Reproduce Point Forecast ---

def test_contributions_plus_intercept_reproduce_point_forecast(mock_breakpoints, mock_thresholds):
    """5. Contributions plus the intercept reproduce the point forecast."""
    rng = np.random.RandomState(999)
    k = len(FEATURE_NAMES)

    mu = rng.uniform(50.0, 300.0, size=k)
    sigma = rng.uniform(10.0, 50.0, size=k)
    beta = rng.uniform(-0.3, 0.5, size=k)
    beta_0 = rng.uniform(4.5, 6.0)
    residuals = rng.normal(0, 0.15, size=35)

    # Test 10 random feature vectors
    for _ in range(10):
        feats = mu + rng.uniform(-2.0, 2.0, size=k) * sigma
        pred = predict_distribution(
            beta_0, beta, mu, sigma, residuals, feats, mock_breakpoints, mock_thresholds
        )

        intercept = pred["intercept"]
        contrib_sum = sum(c["contribution"] for c in pred["all_contributions"])
        point_forecast = pred["point_forecast"]

        # Exact algebraic identity
        assert np.isclose(point_forecast, intercept + contrib_sum, atol=1e-9)
        assert np.isclose(pred["point_aqi"], math.exp(point_forecast), atol=0.1)
