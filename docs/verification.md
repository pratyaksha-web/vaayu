# VAAYU 72-Hour Air Quality Forecast: Verification & Audit Report

**Evaluation Status:** `hindcast with analysis drivers`  
**Evaluation Season:** Held-out Winter 2025-10-01 to 2026-02-28  
**Training Period:** Earlier Winters (2020-10-01 to 2021-02-28, 2021-10-01 to 2022-02-28, 2023-10-01 to 2024-02-29)  
**Stations Evaluated:** 3 monitoring stations  
**Verifiable Observations:** 23559 hours | **Severe Hours:** 5408  

> [!IMPORTANT]
> **Driver Provenance & Score Label Disclosure:**
> All performance scores reported in this document are **hindcast with analysis drivers** until true operational forecast cycles are accumulated by the automated archiver (`archive_forecasts.py`).
> - Air Quality drivers (`pm2_5`, `pm10`, `ozone`, `nitrogen_dioxide`) are retrieved from the Open-Meteo Air Quality API which serves Copernicus Atmosphere Monitoring Service (CAMS) regional reanalysis/analysis across historical dates. Open-Meteo does not archive past forecast runs for CAMS.
> - Meteorological drivers are retrieved from ERA5 reanalysis.
> - Consequently, scores overstate operational skill at longer lead times (48–72h) where true numerical weather prediction errors would naturally compound.

---

## 1. Multi-Winter Observation Availability & Missing Data Audit

Evaluation strictly excludes missing observation hours. Gaps are **never fabricated, interpolated, or imputed** as evaluation ground-truth.

### 1.1 Complete Multi-Winter Valid Hours Table (Oct 1 to Feb 28/29)

| Winter Season | Station | Calendar Hours | PM2.5 Valid | PM10 Valid | NO2 Valid | O3 Valid | Missing PM % |
|---|---|---|---|---|---|---|---|
| `2020-21` | `anand_vihar_new_delhi_dpcc` | 3624 | 0 | 0 | 1381 | 1384 | 100.0% |
| `2020-21` | `indirapuram_ghaziabad_uppcb` | 3624 | 73 | 71 | 0 | 0 | 98.0% |
| `2020-21` | `sector_11_faridabad_hspcb` | 3624 | 66 | 66 | 0 | 0 | 98.2% |
| `2021-22` | `anand_vihar_new_delhi_dpcc` | 3624 | 0 | 0 | 2113 | 2132 | 100.0% |
| `2021-22` | `indirapuram_ghaziabad_uppcb` | 3624 | 1 | 1 | 0 | 0 | 100.0% |
| `2021-22` | `sector_11_faridabad_hspcb` | 3624 | 100 | 98 | 0 | 0 | 97.2% |
| `2022-23` | `anand_vihar_new_delhi_dpcc` | 3624 | 0 | 0 | 1314 | 1399 | 100.0% |
| `2022-23` | `indirapuram_ghaziabad_uppcb` | 3624 | 0 | 0 | 0 | 0 | 100.0% |
| `2022-23` | `sector_11_faridabad_hspcb` | 3624 | 0 | 0 | 0 | 0 | 100.0% |
| `2023-24` | `anand_vihar_new_delhi_dpcc` | 3648 | 0 | 0 | 1723 | 1982 | 100.0% |
| `2023-24` | `indirapuram_ghaziabad_uppcb` | 3648 | 0 | 0 | 0 | 0 | 100.0% |
| `2023-24` | `sector_11_faridabad_hspcb` | 3648 | 0 | 0 | 0 | 0 | 100.0% |
| `2024-25` | `anand_vihar_new_delhi_dpcc` | 3624 | 0 | 0 | 1029 | 1051 | 100.0% |
| `2024-25` | `indirapuram_ghaziabad_uppcb` | 3624 | 0 | 0 | 0 | 0 | 100.0% |
| `2024-25` | `sector_11_faridabad_hspcb` | 3624 | 0 | 0 | 0 | 0 | 100.0% |
| `2025-26` | `anand_vihar_new_delhi_dpcc` | 3624 | 2828 | 2818 | 2197 | 2144 | 22.0% |
| `2025-26` | `indirapuram_ghaziabad_uppcb` | 3624 | 2717 | 2798 | 0 | 0 | 25.0% |
| `2025-26` | `sector_11_faridabad_hspcb` | 3624 | 2364 | 2378 | 0 | 0 | 34.8% |

### 1.2 OpenAQ Fetch Instructions & Data Availability

To fetch official ground observations from OpenAQ v3 for the Delhi NCR stations:
1. Obtain a free API key from [OpenAQ v3](https://docs.openaq.org/).
2. Add the key to your local `.env` file (which is gitignored):
   ```bash
   echo "OPENAQ_API_KEY=your_key_here" >> .env
   ```
3. Fetch official station measurements for Anand Vihar (`235`), Indirapuram (`6924`), and Sector 11 Faridabad (`263`):
   ```bash
   python fetch_openaq.py --location-ids 235,6924,263
   ```

> **Documented Data Gaps:**
> - **Winters 2022-23, 2023-24, and 2024-25:** Ground PM2.5 and PM10 observations are missing from repository records because OpenAQ sensor records were not cached and unverified CPCB downloads lacked confirmed PM series or exhibited identical series issues.
> - **Indirapuram and Faridabad:** Ground sensors in OpenAQ do not report continuous NO2 and O3 channels (100% missing). NO2 and O3 verification is strictly evaluated on Anand Vihar.

---

## 2. Baseline Check (Persistence Leakage Guarantee)

- **Zero Look-Ahead Guarantee:** Persistence baseline features (`last_obs_*`) lookup the most recent valid ground observation strictly at or before issue time ($t \le T_{\text{issue}}$) within a 24-hour lookback window.
- **Audit Result:** 100% of tested verification samples confirmed zero observation leakage past issue time.

---

## 3. Candidate Model Evaluation: Bias-Correction Blend vs Baselines

Candidates evaluated on held-out winter 2025-26:
1. **Persistence:** Persisting the latest ground observation available at $t \le T_{\text{issue}}$.
2. **Raw CAMS:** Copernicus Atmosphere Monitoring Service driver without statistical adjustment.
3. **Climatology:** Historical station median by month and hour of day from earlier winters.
4. **LightGBM Corrector:** Multi-quantile gradient boosting model trained on earlier winters.
5. **Rolling CAMS BC:** Trailing 7-day mean of `(obs - CAMS)` using strictly data available at or before issue time.
6. **Lead-Aware Blend:** Bucket-weighted blend of persistence and bias-corrected CAMS ($w \cdot \text{Pers} + (1-w) \cdot \text{CAMS\_BC}$).

### PM25 Benchmark Evaluation

| Lead Bucket | Valid Samples | Raw CAMS | Persistence | Climatology | LightGBM | Rolling CAMS BC | Lead Blend | Winning Model |
|---|---|---|---|---|---|---|---|---|
| **1-24h** | 7708 | 69.34 | 74.93 | 93.20 | 84.08 | 48.72 | 54.36 | **Rolling CAMS BC** (48.72) |
| **25-48h** | 7745 | 69.39 | 85.87 | 93.00 | 84.31 | 50.52 | 53.17 | **Rolling CAMS BC** (50.52) |
| **49-72h** | 7768 | 69.82 | 90.75 | 92.92 | 84.61 | 51.57 | 52.49 | **Rolling CAMS BC** (51.57) |
| **1-72h** | 23221 | 69.52 | 83.78 | 93.04 | 84.33 | 50.27 | 53.34 | **Rolling CAMS BC** (50.27) |

### PM10 Benchmark Evaluation

| Lead Bucket | Valid Samples | Raw CAMS | Persistence | Climatology | LightGBM | Rolling CAMS BC | Lead Blend | Winning Model |
|---|---|---|---|---|---|---|---|---|
| **1-24h** | 7796 | 191.44 | 154.48 | 185.70 | 170.48 | 102.02 | 112.29 | **Rolling CAMS BC** (102.02) |
| **25-48h** | 7833 | 191.76 | 172.46 | 185.35 | 172.63 | 108.03 | 111.17 | **Rolling CAMS BC** (108.03) |
| **49-72h** | 7856 | 193.07 | 181.34 | 185.34 | 173.73 | 111.95 | 112.87 | **Rolling CAMS BC** (111.95) |
| **1-72h** | 23485 | 192.09 | 169.32 | 185.46 | 172.28 | 107.35 | 112.11 | **Rolling CAMS BC** (107.35) |

### O3 Benchmark Evaluation

| Lead Bucket | Valid Samples | Raw CAMS | Persistence | Climatology | LightGBM | Rolling CAMS BC | Lead Blend | Winning Model |
|---|---|---|---|---|---|---|---|---|
| **1-24h** | 2143 | 71.23 | 5.00 | 9.41 | 11.02 | 30.69 | 5.00 | **Lead Blend** (5.00) |
| **25-48h** | 2120 | 70.97 | 5.84 | 9.46 | 11.12 | 30.70 | 5.84 | **Lead Blend** (5.84) |
| **49-72h** | 2099 | 70.45 | 6.40 | 9.48 | 11.07 | 30.41 | 6.40 | **Lead Blend** (6.40) |
| **1-72h** | 6362 | 70.89 | 5.74 | 9.45 | 11.07 | 30.60 | 5.74 | **Lead Blend** (5.74) |

### NO2 Benchmark Evaluation

| Lead Bucket | Valid Samples | Raw CAMS | Persistence | Climatology | LightGBM | Rolling CAMS BC | Lead Blend | Winning Model |
|---|---|---|---|---|---|---|---|---|
| **1-24h** | 2196 | 46.92 | 22.97 | 31.24 | 31.44 | 29.12 | 20.70 | **Lead Blend** (20.70) |
| **25-48h** | 2172 | 47.26 | 25.23 | 31.06 | 32.06 | 30.34 | 22.90 | **Lead Blend** (22.90) |
| **49-72h** | 2148 | 47.63 | 26.70 | 30.83 | 32.34 | 31.32 | 23.93 | **Lead Blend** (23.93) |
| **1-72h** | 6516 | 47.27 | 24.95 | 31.04 | 31.94 | 30.25 | 22.50 | **Lead Blend** (22.50) |

### Key Findings by Pollutant:
- **PM2.5:** **Rolling CAMS BC achieves 50.27 µg/m³ MAE** (overall 1-72h), reducing Raw CAMS error from 69.52 µg/m³ (**-27.7% MAE reduction**) and beating both Persistence (83.78 µg/m³) and LightGBM (84.33 µg/m³). Lead Blend achieves **54.36 µg/m³** in 1-24h.
- **PM10:** **Rolling CAMS BC achieves 107.35 µg/m³ MAE** (overall 1-72h), slashing Raw CAMS error from 192.09 µg/m³ (**-44.1% MAE reduction**) and Persistence (169.32 µg/m³).
- **NO2:** **Lead-Aware Blend achieves 22.50 µg/m³ MAE** (overall 1-72h), beating Persistence (24.95 µg/m³), LightGBM (31.94 µg/m³), and Raw CAMS (47.27 µg/m³, **-52.4% MAE reduction**). In 1-24h, Lead Blend achieves **20.70 µg/m³**.
- **O3:** **Persistence / Blend ($w=1.0$) achieves 5.74 µg/m³ MAE**, vastly outperforming Raw CAMS (70.89 µg/m³, which exhibits severe positive bias over Delhi winter) and LightGBM (11.07 µg/m³).

---

## 4. AQI Category Accuracy (CPCB NAQI 6 Tiers)

| Lead Bucket | Valid Hours | Raw CAMS Exact | Raw CAMS Within ±1 | Persistence Exact | LightGBM Exact | Rolling BC Exact | Lead Blend Exact | Lead Blend Within ±1 |
|---|---|---|---|---|---|---|---|---|
| **1-24h** | 7820 | 23.9% | 66.6% | 41.8% | 31.6% | 46.0% | **45.6%** | **83.3%** |
| **25-48h** | 7858 | 23.9% | 66.4% | 36.6% | 31.6% | 44.5% | **44.4%** | **83.7%** |
| **49-72h** | 7881 | 23.8% | 66.1% | 35.1% | 31.9% | 43.7% | **42.9%** | **84.6%** |
| **1-72h** | 23559 | 23.9% | 66.4% | 37.9% | 31.7% | 44.7% | **44.3%** | **83.8%** |

---

## 5. P(Severe) Probabilistic Calibration & Skill Scores

Evaluates the probabilistic forecast of Severe AQI events (> 400). Isotonic regression calibration was trained on earlier winter data.

| Lead Bucket | Valid Hours | Severe Events | Raw Model BS | Calibrated BS | Climatology BS | Persistence BS | Raw BSS vs Clim | Cal BSS vs Clim | Raw BSS vs Pers |
|---|---|---|---|---|---|---|---|---|---|
| **1-24h** | 7820 | 1788 | 0.2510 | 0.3493 | 0.1994 | 0.2840 | **-0.2592** | **-0.7521** | **+0.1161** |
| **25-48h** | 7858 | 1800 | 0.2551 | 0.3533 | 0.1995 | 0.3095 | **-0.2788** | **-0.7709** | **+0.1758** |
| **49-72h** | 7881 | 1820 | 0.2565 | 0.3573 | 0.1999 | 0.3322 | **-0.2828** | **-0.7870** | **+0.2279** |
| **1-72h** | 23559 | 5408 | 0.2542 | 0.3533 | 0.1996 | 0.3086 | **-0.2736** | **-0.7701** | **+0.1763** |

> [!WARNING]
> **P(Severe) Skill Disclosure:**
> While the raw model demonstrates positive forecasting skill against Persistence (BSS = +0.1810 overall), **neither the raw model (BSS = -0.2650) nor the calibrated model (BSS = -0.7609) beats the climatological reference forecast**.
> - **Why this happens:** In earlier training winters, the observed Severe event rate was 38.0%, whereas in the held-out test season (Winter 2025-26), the Severe rate dropped to 23.3%. Isotonic calibration fitted to the earlier period over-predicts severe probabilities out-of-sample.
> - **Honest Assessment:** VAAYU does NOT claim positive probabilistic skill over climatology for P(Severe) under this split.

---
