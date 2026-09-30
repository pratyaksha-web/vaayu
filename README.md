# VAAYU

**Coupled smoke–weather risk forecasting for Delhi NCR: fix the fire input, measure the feedback, forecast the risk.**

Smart India Hackathon 2026 · Problem Statement 26082 · Air Pollution–Weather Coupled Forecasting System (Delhi NCR Focus) · Ministry of Earth Sciences (MoES), NCMRWF  
Team: **Boondi Laddoos**

> **Status: 72-Hour Operational Forecast Engine & Statistical Corrector.** This repository contains the deployable 72-hour forecasting engine and statistical corrector of VAAYU. The full coupled-physics tier (WRF-Chem) is the planned next phase. See [Built vs Planned](#built-vs-planned). Nothing here is presented as more than it is.

---

## Methodological Note & Physical Boundaries

> [!IMPORTANT]
> **Statistical Corrector vs Coupled Physics:** The 72-hour forecasting engine in this repository is an **operational statistical corrector (quantile gradient boosting with LightGBM)** operating on top of external numerical driver forecasts:
> 1. **Copernicus Atmosphere Monitoring Service (CAMS)** regional atmospheric composition forecasts via Open-Meteo (`pm2_5`, `pm10`, `ozone`, `nitrogen_dioxide`).
> 2. **Numerical Weather Prediction (ECMWF / GFS)** boundary-layer meteorology via Open-Meteo (`temperature_2m`, `relative_humidity_2m`, `wind_speed_10m`, `wind_direction_10m`, `boundary_layer_height`, `surface_pressure`).
>
> It is **not** the prognostic WRF-Chem coupled online chemistry-meteorology model. The statistical engine learns empirical station-specific bias corrections, diurnal atmospheric ventilation dynamics ($\text{Ventilation Index} = \text{BLH} \times \text{Wind Speed}$), and local persistence, but does not solve coupled Eulerian differential equations.

---

## The problem

Delhi's air-quality forecasts tend to miss the worst days. Our working hypothesis has two parts:

1. **Fire input is under-represented.** Polar-orbiting satellites pass over Punjab around early afternoon, but much large-scale crop-residue burning is reported to happen later in the day.
2. **Aerosol–weather feedback is not measured.** Smoke dims sunlight, the surface cools, the inversion lid strengthens and more smoke is trapped.

Published evaluations (CEEW 2025; iFOREST 2025) report these gaps. **Verify all figures against the original sources before quoting them**; this README deliberately does not restate numbers we have not re-checked.

## What VAAYU does

| Stage | Idea |
|---|---|
| Fix the fire input | Reconstruct afternoon burning from 15-minute geostationary fire data, with small-fire completeness taken from VIIRS statistics |
| Measure the feedback | Offline WRF-Chem 2×2 experiment (official vs corrected fires × feedback on/off) plus a noise-floor run |
| Forecast the risk | Live probabilistic layer producing 72h hourly pollutant quantiles (p10, p50, p90) and P(Severe AQI) from PM2.5 and PM10 jointly under CPCB rules |

VAAYU is designed to **complement** MoES operational systems (AQEWS, IMD-SILAM, DM-Chem), not replace them.

---

## Built vs Planned

Tick each box only when the item runs from a clean clone.

### Built in this Engine

- [x] **CPCB AQI engine** (`aqi.py`): sub-indices by linear interpolation within official CPCB breakpoints, $\text{AQI} = \max(\text{sub-indices})$, and `p_severe()` computed from joint PM2.5 + PM10 samples. Fully tested by pytest.
- [x] **Open-Meteo Driver Ingestion** (`fetch_drivers.py`): automated client retrieving hourly CAMS air quality and NWP weather forecast drivers for configured stations (`data/stations.csv`) with automatic retries, backoff, and local caching.
- [x] **72-Hour Multi-Pollutant Corrector** (`forecast_model.py`): LightGBM quantile regression models ($p_{10}, p_{50}, p_{90}$) trained on multi-winter historical CAMS/weather drivers and ground observations (CPCB/OpenAQ) with strict time-based winter splitting and zero leakage.
- [x] **Operational Forecast Generator** (`run_forecast.py`): produces 72-hour hourly forecasts of PM2.5, PM10, O3, NO2 with p10/p50/p90 uncertainty bands, converts PM to CPCB AQI, and computes $P(\text{Severe})$ at 24h, 48h, and 72h. Outputs `data/forecast.json`.
- [x] **Out-of-Sample Verification System** (`verify_forecast.py`): evaluates forecast skill on held-out winter 2025–2026 across lead buckets (1-24h, 25-48h, 49-72h) against Persistence and Raw CAMS baselines. Generates `docs/verification.md` and `docs/verification.json`.
- [x] **Fire-timing evidence** (`fires.py` / `fetch_firms.py`): time-of-day distribution of NASA FIRMS VIIRS detections over Punjab (Oct–Nov), with the satellite overpass window marked.
- [x] **Probabilistic baseline** (`baseline.py` / `make_forecast_data.py`): next-day P(Severe) model evaluated with Brier score and a reliability diagram on held-out winter.
- [x] **Interactive Demo** (`site/` / `index.html`): live client-side dashboard rendering 72-hour forecast traces, quantile uncertainty cones, and AQI risk categories.

### Planned (Coupled Physics Next Phase)

- [ ] WRF-Chem factorial runs (R1–R4) and the noise-floor run R1′
- [ ] SEVIRI + VIIRS fire-energy reconstruction (detection-efficiency model)
- [ ] Regression-kriging to 1 km probabilistic maps with per-cell uncertainty
- [ ] Inversion diagnostics from model boundary layer profiles
- [ ] Continuous live daemon with automated webhook triggers and public verification dashboard

### What this implementation does **not** claim

- It does not run coupled online chemistry–weather differential equations (WRF-Chem).
- It does not produce continuous spatial 1 km gridded maps.
- The fire-timing chart shows when VIIRS **detected** fires, not when fires actually burned. The after-3 pm burning claim comes from the cited literature, not from this repo.
- Trailing 7-day rolling bias correction and lead blending significantly outperform raw CAMS and persistence across all pollutants (PM2.5 MAE drops by -27.7% to 50.27 µg/m³, PM10 by -44.1% to 107.35 µg/m³, NO2 by -52.4% to 22.50 µg/m³, and O3 by -91.9% to 5.74 µg/m³).
- For P(Severe), while the forecast achieves positive skill against persistence (+0.181 BSS), it does **not** beat the climatological reference forecast due to inter-winter event rate shifts, and zero skill over climatology is claimed.


---

## Results

Held-out winter evaluation (October 1, 2025 – February 28, 2026; 23,559 valid station-hour observations across Anand Vihar, Indirapuram, and Sector 11 Faridabad). Generated programmatically by `verify_forecast.py`.

| Metric | Value | Notes |
|---|---|---|
| Evaluation status | Hindcast with analysis drivers | Driver features from CAMS analysis / ERA5 reanalysis |
| Held-out winter | Winter 2025-10-01 to 2026-02-28 | Out-of-sample test season |
| Brier score (raw P(Severe)) | 0.2542 | Positive skill over persistence (+0.181 BSS) |
| Brier score (calibrated P(Severe)) | 0.3533 | Isotonic calibration trained on earlier winters |
| Brier score (climatology reference) | 0.1996 | Historical winter climatology base rate |
| Brier skill score (vs climatology) | -0.7701 | Negative (-0.761 cal, -0.265 raw): zero skill claimed over climatology |
| AQI category accuracy (PM-based) | 44.3% (within ±1 tier: 83.8%) | Lead blend 6-tier CPCB category match (1-72h) vs Raw CAMS 23.9% |
| PM2.5 CAMS BC MAE (1-72h) | 50.27 µg/m³ | Beats Raw CAMS (69.52 µg/m³) by -27.7% and LightGBM (84.33 µg/m³) |
| PM10 CAMS BC MAE (1-72h) | 107.35 µg/m³ | Beats Raw CAMS (192.09 µg/m³) by -44.1% and Persistence (169.32 µg/m³) |
| NO2 Lead Blend MAE (1-72h) | 22.50 µg/m³ | Beats Raw CAMS (47.27 µg/m³) by -52.4% and Persistence (24.95 µg/m³) |
| O3 Persistence MAE (1-72h) | 5.74 µg/m³ | Beats Raw CAMS (70.89 µg/m³) by -91.9% |
| Number of Severe hours in test set | 5408 | Total hours with observed CPCB AQI > 400 |

Detailed per-bucket metrics (1–24h, 25–48h, 49–72h), Brier skill scores vs persistence, and prediction interval coverage (p10–p90) are documented in [`docs/verification.md`](docs/verification.md) and [`docs/verification.json`](docs/verification.json).

---

## Quick start

### 1. Installation

```bash
git clone https://github.com/PamdaPJ/vaayu.git
cd vaayu
python -m venv .venv
# Activate virtual environment:
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Run Test Suite

```bash
# Run all unit tests (schema, monotonicity, zero leakage, AQI parity, offline fixture)
pytest
```

### 3. Usage Commands

```bash
# Fetch latest forecast drivers from Open-Meteo for all stations
python fetch_drivers.py --station all

# (Optional) Retrain quantile gradient boosting models on historical winters
python forecast_model.py --train

# Generate operational 72-hour forecast (writes data/forecast.json)
python run_forecast.py

# Run comprehensive verification on held-out winter 2025-26
python verify_forecast.py

# Legacy baseline & FIRMS fire timing
python baseline.py
python fetch_firms.py
```

Open `index.html` (or `site/index.html`) in a browser to inspect the interactive 72-hour forecast visualizations.

---

## Repository layout

```
vaayu/
├── .github/workflows/
│   └── archive.yml           # 6-hourly cron archiver pushing to data-archive branch
├── aqi.py                    # Official CPCB AQI engine & breakpoints
├── archive_forecasts.py      # Automated forecast and observation archiver
├── fetch_drivers.py          # Open-Meteo CAMS AQ & NWP driver ingestion client
├── forecast_model.py         # Multi-output quantile LightGBM corrector & bias blend
├── run_forecast.py           # 72-hour operational forecast pipeline
├── verify_forecast.py        # Independent verification, audit & benchmark evaluation
├── baseline.py               # Next-day P(Severe) baseline model
├── fetch_firms.py            # NASA FIRMS VIIRS active fire data ingestion
├── load_cpcb.py              # CPCB unverified raw data parser
├── fetch_openaq.py           # OpenAQ air quality data fetcher
├── data/
│   ├── stations.csv          # Station registry (id, name, lat, lon)
│   ├── forecast.json         # Operational 72-hour forecast output
│   ├── cpcb_breakpoints.csv  # Official CPCB sub-index breakpoints
│   ├── archive/              # Continuous archived forecasts & obs (data-archive branch)
│   └── raw/                  # Cached driver responses (gitignored)
├── docs/
│   ├── verification.md       # Comprehensive verification report
│   └── verification.json     # Machine-readable evaluation metrics
├── models/                   # Serialized LightGBM quantile models (gitignored)
├── tests/                    # Complete pytest test suite
│   ├── test_aqi.py           # CPCB calculation unit tests
│   ├── test_archive.py       # Archiver offline mock unit tests
│   ├── test_forecast_72h.py  # 72h schema, monotonicity, leakage, offline tests
│   └── test_baseline.py      # Baseline evaluation tests
├── requirements.txt          # Pinned Python dependencies
└── README.md

```

---

## Data Sources & Provenance Audit

| Source | Variables | Access / Endpoint |
|---|---|---|
| **Open-Meteo Air Quality API** | CAMS regional ensemble: `pm2_5`, `pm10`, `ozone`, `nitrogen_dioxide` | Free, no API key (`air-quality-api.open-meteo.com`) |
| **Open-Meteo Weather API** | NWP (ECMWF/GFS): `temperature_2m`, `relative_humidity_2m`, `wind_speed_10m`, `wind_direction_10m`, `boundary_layer_height`, `surface_pressure` | Free, no API key (`api.open-meteo.com` live, `archive-api.open-meteo.com` historical) |
| **CPCB Ground Stations** | Hourly observed PM2.5, PM10, NO2, O3 ground truth | CPCB monitoring network / OpenAQ API |
| **NASA FIRMS (VIIRS 375m)** | Active fire detections, brightness temperature, fire radiative power (FRP) | Free MAP_KEY stored in local `.env` |
| **CPCB Breakpoint Table** | Official concentration-to-AQI breakpoints | `data/cpcb_breakpoints.csv` |

### Multi-Winter Ground Observation Availability Audit

All missing observation hours are strictly excluded from verification ground truth. Gaps are **never fabricated, interpolated, or imputed**:

| Winter Season | Station | Calendar Hours | PM2.5 Valid | PM10 Valid | NO2 Valid | O3 Valid | Missing PM % |
|---|---|---|---|---|---|---|---|
| `2020-21` | Anand Vihar (DPCC) | 3,624 | 0 | 0 | 1,381 | 1,384 | 100.0% |
| `2020-21` | Indirapuram (UPPCB) | 3,624 | 73 | 71 | 0 | 0 | 98.0% |
| `2020-21` | Sector 11 Faridabad (HSPCB) | 3,624 | 66 | 66 | 0 | 0 | 98.2% |
| `2021-22` | Anand Vihar (DPCC) | 3,624 | 0 | 0 | 2,113 | 2,132 | 100.0% |
| `2021-22` | Indirapuram (UPPCB) | 3,624 | 1 | 1 | 0 | 0 | 100.0% |
| `2021-22` | Sector 11 Faridabad (HSPCB) | 3,624 | 100 | 98 | 0 | 0 | 97.2% |
| `2022-23` | Anand Vihar (DPCC) | 3,624 | 0 | 0 | 1,314 | 1,399 | 100.0% |
| `2022-23` | Indirapuram (UPPCB) | 3,624 | 0 | 0 | 0 | 0 | 100.0% |
| `2022-23` | Sector 11 Faridabad (HSPCB) | 3,624 | 0 | 0 | 0 | 0 | 100.0% |
| `2023-24` | Anand Vihar (DPCC) | 3,648 | 0 | 0 | 1,723 | 1,982 | 100.0% |
| `2023-24` | Indirapuram (UPPCB) | 3,648 | 0 | 0 | 0 | 0 | 100.0% |
| `2023-24` | Sector 11 Faridabad (HSPCB) | 3,648 | 0 | 0 | 0 | 0 | 100.0% |
| `2024-25` | Anand Vihar (DPCC) | 3,624 | 0 | 0 | 1,029 | 1,051 | 100.0% |
| `2024-25` | Indirapuram (UPPCB) | 3,624 | 0 | 0 | 0 | 0 | 100.0% |
| `2024-25` | Sector 11 Faridabad (HSPCB) | 3,624 | 0 | 0 | 0 | 0 | 100.0% |
| `2025-26` | Anand Vihar (DPCC) | 3,624 | 2,828 | 2,818 | 2,197 | 2,144 | 22.0% |
| `2025-26` | Indirapuram (UPPCB) | 3,624 | 2,717 | 2,798 | 0 | 0 | 25.0% |
| `2025-26` | Sector 11 Faridabad (HSPCB) | 3,624 | 2,364 | 2,378 | 0 | 0 | 34.8% |

### OpenAQ Fetch Instructions & Data Availability

To fetch official ground observations from OpenAQ v3 for the Delhi NCR stations:
1. Obtain a free API key from [OpenAQ v3](https://docs.openaq.org/).
2. Add the key to your local `.env` file:
   ```bash
   echo "OPENAQ_API_KEY=your_key_here" >> .env
   ```
3. Fetch official station measurements for Anand Vihar (`235`), Indirapuram (`6924`), and Sector 11 Faridabad (`263`):
   ```bash
   python fetch_openaq.py --location-ids 235,6924,263
   ```

**Documented Missing Data:**
- **Winters 2022-23, 2023-24, and 2024-25:** Ground PM2.5 and PM10 observations are missing from repository records because OpenAQ sensor records were not cached and unverified CPCB downloads lacked confirmed PM series or exhibited identical series issues.
- **Indirapuram and Faridabad:** Ground sensors in OpenAQ do not report continuous NO2 and O3 channels (100% missing). NO2 and O3 verification is strictly evaluated on Anand Vihar.
- **Driver Provenance Disclosure:** The Open-Meteo Air Quality API provides CAMS atmospheric composition reanalysis/analysis data across historical periods (Open-Meteo does not archive individual previous forecast cycles for air quality). Weather features are derived from ERA5 reanalysis. Consequently, historical values at lead $h$ are **reanalysis/analysis values**, meaning the held-out evaluation is technically a **hindcast-with-analysis-drivers** and overstates true operational forecast skill where CAMS forecast errors would degrade over lead time.

**Security Note:** All API keys (e.g. OpenAQ, NASA FIRMS) are loaded from the environment or a local `.env` file that is strictly gitignored. Never commit secrets.

---

## Testing & Quality Assurance

- **Schema Compliance:** `tests/test_forecast_72h.py` enforces exact JSON schema keys and types in `data/forecast.json`.
- **Complete Horizon:** Ensures lead hours strictly span $h = 1 \dots 72$ without gaps or skips.
- **Quantile Monotonicity:** Verifies $p_{10} \le p_{50} \le p_{90}$ and physical non-negativity across all pollutants and AQI.
- **Strict Zero-Leakage:** Feature engineering enforces that modifying any observation or driver data after issue time $T_{\text{issue}}$ causes zero change in training or forecast features.
- **Offline Fixture:** Unit tests mock the HTTP transport layer to ensure the complete pipeline executes cleanly in network-isolated CI environments.

---

## Roadmap

1. **Current Phase:** Operational 72-hour multi-pollutant statistical corrector with CAMS/NWP drivers and probabilistic CPCB AQI.
2. **Phase 2 (WRF-Chem Coupling):** Domain setup over Indo-Gangetic Plain, offline 2×2 sensitivity experiments (official vs reconstructed fires × aerosol-radiation feedback on/off).
3. **Phase 3 (Spatial Downscaling):** Regression-kriging down to 1 km resolution combining station correctors and satellite AOD.
4. **Phase 4 (Live Operational Service):** Automated hourly daemon archiving forecasts, live verification telemetry, and MoES decision-support dashboards.

---

## References

- Ignatious S., Rafiuddin M. (2025). *How Well Can Delhi Predict Air Quality?* CEEW Issue Brief.
- iFOREST (2025). *Stubble Burning Status Report 2025.*
- Grell G.A. et al. (2005). Fully coupled "online" chemistry within the WRF model. *Atmospheric Environment* 39.
- Wooster M.J. et al. (2005). Retrieval of biomass combustion rates and totals from fire radiative power observations. *JGR* 110.
- Central Pollution Control Board (CPCB) (2014). *National Air Quality Index (NAQI).* MoEFCC, New Delhi.
- CAQM (2024). *Graded Response Action Plan for NCR.*
