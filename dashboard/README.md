# VAAYU — AI-Powered Air Quality Forecasting Dashboard for Delhi NCR

![VAAYU Banner](public/vaayu-icon.svg)

**VAAYU** (वायु - Sanskrit for *Air* and *Wind*) is an operational environmental intelligence and 72-hour air quality forecasting platform specifically engineered for the **Delhi National Capital Region (NCR), India**.

The system synthesizes continuous regulatory ground station telemetry, boundary-layer meteorological soundings, atmospheric inversion diagnostics, coupled chemistry-transport simulations (WRF-Chem), and satellite agricultural fire detection (NASA FIRMS VIIRS) into a high-resolution, interactive dashboard.

---

## 1. System Architecture

VAAYU decouples the reactive scientific user interface from the numerical and machine learning modeling core via a typed API service layer:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   VAAYU FRONTEND DASHBOARD (React + Vite)              │
│  7 Navigable Pages • GIS Leaflet Maps • Recharts • Tailwind CSS v4      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                         Typed API Contract Layer
                        (src/services/api.ts)
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌───────────────────────────────┐         ┌──────────────────────────────┐
│       VERIFIED DEMO MODE      │         │   FUTURE PYTHON ML BACKEND   │
│ Calibrated CAAQMS observations│         │  FastAPI / WRF-Chem / GFS    │
│ & VIIRS stubble fire dataset  │         │  Coupled 2-Way Aerosol Model │
└───────────────────────────────┘         └──────────────────────────────┘
```

---

## 2. Navigable Intelligence Modules (7 Pages)

| # | Module | Route | Key Capabilities |
|---|--------|-------|------------------|
| **1** | **Overview Dashboard** | `/` | Delhi NCR 6-metric summary cards, 72h AQI trajectory with uncertainty bands, multi-criteria pollutant trends, station severity ranking, active atmospheric alerts, and compact spatial station viewer. |
| **2** | **AQI Forecast** | `/forecast` | 72-hour deterministic hourly forecasts, peak pollution timing & duration counter, multi-station CPCB severity heatmap, hourly table, and one-click CSV export. |
| **3** | **Pollution Map** | `/map` | Interactive React Leaflet + OpenStreetMap GIS map of Delhi NCR, layer switcher (AQI, PM2.5, PM10, O3, NO2, Temp, Wind), interactive 72h playback time slider, and detailed station popups with mini-sparklines. |
| **4** | **Weather & Atmosphere** | `/weather` | Planetary boundary layer height (PBLH) diurnal breathing curve, vertical radiosonde sounding profile (0–2600m) with detected inversion layer highlighting, inversion diagnostics, and Delhi NCR directional wind rose. |
| **5** | **Stubble-Burning Tracker** | `/fires` | NASA FIRMS VIIRS 375m active thermal anomaly map across Punjab & Haryana, forward HYSPLIT smoke plume trajectory toward Delhi NCR, 7-day fire activity vs Delhi PM2.5 correlation, and scientific attribution disclaimers. |
| **6** | **Model Insights** | `/models` | Model validation metrics (MAE, RMSE, R² score), scatter plot with 1:1 reference diagonal, forecast error degradation by horizon (1h to 72h vs persistence baseline), station-level error metrics, and WRF-Chem physics configuration specs. |
| **7** | **Historical Reports** | `/reports` | Archived CAAQMS historical data, compliance benchmarking against Indian NAAQS thresholds (60 µg/m³ PM2.5, 100 µg/m³ PM10), hour-of-day vs day-of-week diurnal rush-hour heatmap, and seasonal climatology breakdowns. |

---

## 3. Technology Stack

- **Framework**: [React 19](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/)
- **Bundler & Build Tool**: [Vite 8](https://vite.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) with scientific palette (Teal `#0f766e`, Navy `#0f172a`, and CPCB NAQI severity colors)
- **Data Visualization**: [Recharts](https://recharts.org/) (Composed charts, Area uncertainty bands, Radar Wind Rose, Scatter plots, and Bar charts)
- **Geographic Mapping**: [React Leaflet](https://react-leaflet.js.org/) + [Leaflet](https://leafletjs.com/) with OpenStreetMap tiles & custom HTML DivIcon pins
- **Icons**: [Lucide React](https://lucide.dev/)
- **Routing**: [React Router v7](https://reactrouter.com/)

---

## 4. Quick Start & Installation

### Prerequisites
- **Node.js**: v18.0.0 or later (v24+ recommended)
- **npm**: v9.0.0 or later

### Installation Steps

1. Clone or navigate to the repository directory:
   ```bash
   cd Vaayu
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch development server:
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:5173/` (or `http://127.0.0.1:5173/`).

4. Production Build:
   ```bash
   npm run build
   ```
   Generates optimized assets in the `dist/` directory.

---

## 5. Connecting a Future Python Backend

The frontend is architected to transition from the calibrated demo dataset to an operational Python backend (e.g. FastAPI / Flask) seamlessly.

### Environment Variables

Create a `.env` file in the project root:

```env
# Toggle between "demo" (calibrated mock dataset) and "api" (live backend calls)
VITE_API_MODE=demo

# Base URL for the future Python modeling backend
VITE_API_BASE_URL=http://localhost:8000
```

### Proposed API Endpoint Specifications

Your Python backend should implement the following REST contracts:

```http
GET /api/overview?station={stationId}
GET /api/forecast?station={stationId}&hours={24|48|72}
GET /api/map?variable={AQI|PM2.5|PM10|Wind}&time={isoTimestamp}
GET /api/atmosphere?station={stationId}
GET /api/fires?start={date}&end={date}
GET /api/model/metrics
GET /api/history?station={stationId}&start={date}&end={date}
```

The TypeScript schemas for all responses are strictly defined in [`src/types/index.ts`](src/types/index.ts). If the backend is offline or unreachable, the frontend gracefully falls back to the verified offline dataset without crashing, tagging the payload with the `demo` data status badge.

---

## 6. Scientific Rigor & Regulatory Alignment

- **CPCB NAQI Sub-Index Standard**: Official Indian Air Quality Index rules are followed. The overall AQI is the **maximum sub-index** of at least three monitored pollutants (including either PM2.5 or PM10) using specific piecewise linear breakpoints, rather than an arbitrary arithmetic average.
- **Data Provenance**: Every metric card and chart distinguishes **Observed** CAAQMS continuous ground monitoring data from **Forecast** model predictions.
- **Stubble Burning Attribution**: Satellite thermal anomalies (NASA FIRMS VIIRS) are treated with scientific caution: satellite hotspots detect open heat signatures but require meteorological advection verification (HYSPLIT vectors) before attributing urban receptor concentrations.

---

## 7. License

Developed for Delhi NCR atmospheric monitoring and environmental intelligence research.
