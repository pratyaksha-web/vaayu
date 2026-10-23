import type { 
  MonitoringStation, 
  StationForecast, 
  HourlyForecastPoint, 
  AlertRecord, 
  InversionDiagnostic, 
  VerticalProfileLevel, 
  FireDetection, 
  PlumeTrajectoryPoint, 
  ModelValidationMetrics, 
  OverviewDashboardData 
} from '../types';
import { getAQICategory } from '../utils/aqi';

export const DELHI_NCR_STATIONS: MonitoringStation[] = [
  { id: 'alipur', name: 'Alipur (Site 5024)', city: 'Delhi', state: 'Delhi', latitude: 28.8153, longitude: 77.1530, elevationMeters: 218, agency: 'DPCC', isOperational: true, hasVerticalProfile: true },
  { id: 'anand_vihar', name: 'Anand Vihar', city: 'Delhi', state: 'Delhi', latitude: 28.6476, longitude: 77.3158, elevationMeters: 206, agency: 'DPCC', isOperational: true },
  { id: 'aya_nagar', name: 'Aya Nagar', city: 'Delhi', state: 'Delhi', latitude: 28.4707, longitude: 77.1099, elevationMeters: 272, agency: 'IMD', isOperational: true, hasVerticalProfile: true },
  { id: 'bawana', name: 'Bawana Industrial Area', city: 'Delhi', state: 'Delhi', latitude: 28.7762, longitude: 77.0511, elevationMeters: 226, agency: 'DPCC', isOperational: true },
  { id: 'dwarka_sec8', name: 'Dwarka Sector-8', city: 'Delhi', state: 'Delhi', latitude: 28.5710, longitude: 77.0719, elevationMeters: 217, agency: 'DPCC', isOperational: true },
  { id: 'ito', name: 'ITO Intersection', city: 'Delhi', state: 'Delhi', latitude: 28.6286, longitude: 77.2410, elevationMeters: 210, agency: 'CPCB', isOperational: true },
  { id: 'lodhi_road', name: 'Lodhi Road', city: 'Delhi', state: 'Delhi', latitude: 28.5883, longitude: 77.2217, elevationMeters: 213, agency: 'IMD', isOperational: true, hasVerticalProfile: true },
  { id: 'mundka', name: 'Mundka Industrial Area', city: 'Delhi', state: 'Delhi', latitude: 28.6847, longitude: 77.0766, elevationMeters: 219, agency: 'DPCC', isOperational: true },
  { id: 'patparganj', name: 'Patparganj', city: 'Delhi', state: 'Delhi', latitude: 28.6237, longitude: 77.2872, elevationMeters: 204, agency: 'DPCC', isOperational: true },
  { id: 'punjabi_bagh', name: 'Punjabi Bagh', city: 'Delhi', state: 'Delhi', latitude: 28.6740, longitude: 77.1310, elevationMeters: 218, agency: 'DPCC', isOperational: true },
  { id: 'rk_puram', name: 'R K Puram', city: 'Delhi', state: 'Delhi', latitude: 28.5632, longitude: 77.1869, elevationMeters: 228, agency: 'DPCC', isOperational: true },
  { id: 'noida_sec62', name: 'Noida Sector-62', city: 'Noida', state: 'Uttar Pradesh', latitude: 28.6245, longitude: 77.3638, elevationMeters: 201, agency: 'UPPCB', isOperational: true },
  { id: 'ghaziabad_vasundhara', name: 'Vasundhara', city: 'Ghaziabad', state: 'Uttar Pradesh', latitude: 28.6603, longitude: 77.3573, elevationMeters: 202, agency: 'UPPCB', isOperational: true },
  { id: 'gurugram_sec51', name: 'Gurugram Sector-51', city: 'Gurugram', state: 'Haryana', latitude: 28.4227, longitude: 77.0667, elevationMeters: 224, agency: 'HSPCB', isOperational: true },
  { id: 'faridabad_sec16a', name: 'Faridabad Sector-16A', city: 'Faridabad', state: 'Haryana', latitude: 28.4088, longitude: 77.3178, elevationMeters: 206, agency: 'HSPCB', isOperational: true },
];

export const MOCK_ALERTS: AlertRecord[] = [
  {
    id: 'alt-01',
    title: 'Severe Nocturnal Inversion Expected',
    type: 'low_dispersion',
    severity: 'critical',
    issuedAt: '2026-10-22T16:00:00+05:30',
    expiresAt: '2026-10-23T09:00:00+05:30',
    message: 'Strong surface temperature inversion (+4.8°C across 280m depth) combined with calm winds (<4 km/h) will compress the planetary boundary layer to under 190m tonight, severely limiting pollutant ventilation.',
    source: 'VAAYU WRF-Chem Atmospheric Diagnostics',
    affectedAreas: ['North Delhi', 'North-West Delhi', 'Anand Vihar', 'Trans-Yamuna'],
  },
  {
    id: 'alt-02',
    title: 'Predicted Stubble Smoke Influx (48h Window)',
    type: 'smoke_transport',
    severity: 'warning',
    issuedAt: '2026-10-22T14:30:00+05:30',
    expiresAt: '2026-10-24T18:00:00+05:30',
    message: 'Backward and forward trajectories indicate north-westerly boundary-layer winds (305° at 8-12 km/h) transporting agricultural fire emissions from Sangrur and Karnal corridors toward Delhi NCR. Secondary PM2.5 enhancement expected +45-65 µg/m³.',
    source: 'VIIRS FIRMS + HYSPLIT Plume Advection Model',
    affectedAreas: ['Alipur', 'Bawana', 'Mundka', 'Punjabi Bagh'],
  },
  {
    id: 'alt-03',
    title: 'Very Poor to Severe AQI Forecast Peak',
    type: 'elevated_pollution',
    severity: 'critical',
    issuedAt: '2026-10-22T17:15:00+05:30',
    expiresAt: '2026-10-23T11:00:00+05:30',
    message: 'Peak hourly AQI is forecasted to reach 382–415 (Severe) at Anand Vihar and Mundka stations between 05:00 and 08:30 IST tomorrow morning during morning traffic rush hours coinciding with lowest PBLH.',
    source: 'VAAYU ML-Atmospheric Ensemble (72h Horizon)',
    affectedAreas: ['All Delhi NCR Monitoring Sectors'],
  },
  {
    id: 'alt-04',
    title: 'Sensor Calibration Status',
    type: 'data_warning',
    severity: 'info',
    issuedAt: '2026-10-22T12:00:00+05:30',
    expiresAt: '2026-10-23T12:00:00+05:30',
    message: 'ITO Intersection station underwent DPCC zero/span calibration between 11:00-11:45 IST; historical reading interpolated for 1 hour. All other 14 stations reporting nominal valid data.',
    source: 'CPCB Automated QA/QC Engine',
    affectedAreas: ['ITO Intersection'],
  },
];

// Generate 72-hour realistic hourly forecast points
export function generateHourlyForecast(stationId: string, hours: number = 72): HourlyForecastPoint[] {
  const station = DELHI_NCR_STATIONS.find(s => s.id === stationId) || DELHI_NCR_STATIONS[0];
  const points: HourlyForecastPoint[] = [];

  // Base values adjusted by station micro-climate
  let baseAQI = 295;
  if (station.id === 'anand_vihar' || station.id === 'mundka' || station.id === 'bawana') baseAQI = 345;
  if (station.id === 'lodhi_road' || station.id === 'aya_nagar') baseAQI = 240;

  const now = new Date('2026-10-22T18:00:00+05:30');

  for (let i = -12; i <= hours; i++) {
    const time = new Date(now.getTime() + i * 3600 * 1000);
    const hourOfDay = time.getHours();

    // Diurnal atmospheric pattern:
    // Peak early morning (5am-8am) due to nocturnal inversion collapse and morning rush hour
    // Trough in mid-afternoon (2pm-4pm) due to convective vertical mixing and deeper boundary layer
    // Second peak at night (8pm-11pm) due to cooling, calm winds and diesel freight entry
    let diurnalFactor = 1.0;
    if (hourOfDay >= 4 && hourOfDay <= 9) diurnalFactor = 1.25;
    else if (hourOfDay >= 13 && hourOfDay <= 16) diurnalFactor = 0.78;
    else if (hourOfDay >= 20 && hourOfDay <= 23) diurnalFactor = 1.18;
    else diurnalFactor = 0.95;

    // Multi-day synoptic weather wave (e.g. cold front / stubble plume transit on day 2)
    const dayOffset = Math.floor(i / 24);
    const synopticTrend = dayOffset === 1 ? 1.15 : (dayOffset === 2 ? 1.08 : 1.0);

    const aqi = Math.round(baseAQI * diurnalFactor * synopticTrend + (Math.sin(i * 0.4) * 12));
    const pm25 = Math.round(aqi * 0.62 + (Math.cos(i * 0.5) * 8));
    const pm10 = Math.round(aqi * 0.98 + (Math.sin(i * 0.3) * 15));
    const o3 = Math.round(Math.max(12, 45 + Math.sin((hourOfDay - 8) * 0.26) * 35));
    const no2 = Math.round(Math.max(20, 68 + diurnalFactor * 32 + (Math.sin(i * 0.7) * 9)));
    const nox = Math.round(no2 * 1.55);
    const so2 = Math.round(18 + Math.sin(i * 0.2) * 5);
    const co = Number((1.8 + diurnalFactor * 0.9).toFixed(1));

    // Meteorology
    const temp = Number((24 + Math.sin((hourOfDay - 9) * 0.26) * 7.5 - dayOffset * 0.4).toFixed(1));
    const rh = Math.round(Math.max(35, 75 - (temp - 17) * 4));
    const windSpd = Number(Math.max(2.1, 7.5 + Math.sin((hourOfDay - 11) * 0.26) * 4.2).toFixed(1));
    const windDir = (305 + Math.round(Math.sin(i * 0.2) * 25)) % 360; // Predominantly NW
    const pblh = Math.round(Math.max(160, 1150 * Math.max(0.12, Math.sin((hourOfDay - 6) * (Math.PI / 14)))));

    const uncertainty = Math.round(i > 0 ? (i / 72) * 28 : 0);

    points.push({
      timestamp: time.toISOString(),
      hourOffset: i,
      predictedAQI: aqi,
      category: getAQICategory(aqi),
      isObserved: i <= 0,
      pm25: Math.max(15, pm25),
      pm10: Math.max(30, pm10),
      o3,
      no2,
      nox,
      so2,
      co,
      temperature: temp,
      relativeHumidity: rh,
      windSpeed: windSpd,
      windDirection: windDir,
      boundaryLayerHeight: pblh,
      uncertaintyLower: i > 0 ? Math.max(0, aqi - uncertainty) : undefined,
      uncertaintyUpper: i > 0 ? aqi + uncertainty : undefined,
    });
  }

  return points;
}

export function getStationForecast(stationId: string, horizonHours: 24 | 48 | 72 = 72): StationForecast {
  const station = DELHI_NCR_STATIONS.find(s => s.id === stationId) || DELHI_NCR_STATIONS[0];
  const allPoints = generateHourlyForecast(station.id, horizonHours);
  const futurePoints = allPoints.filter(p => p.hourOffset >= 1 && p.hourOffset <= horizonHours);

  let maxAQI = 0;
  let peakTime = '';
  let durationAbove300 = 0;

  futurePoints.forEach(p => {
    if (p.predictedAQI > maxAQI) {
      maxAQI = p.predictedAQI;
      peakTime = p.timestamp;
    }
    if (p.predictedAQI >= 300) {
      durationAbove300++;
    }
  });

  return {
    stationId: station.id,
    stationName: station.name,
    generatedAt: '2026-10-22T18:00:00+05:30',
    forecastHorizonHours: horizonHours,
    modelName: 'VAAYU Coupled WRF-Chem + LightGBM Ensemble v2.1',
    status: 'demo',
    hourly: allPoints,
    peakPollution: {
      maxAQI,
      peakTime,
      peakPollutant: 'PM2.5',
      stationName: station.name,
      durationAbove300Hours: durationAbove300,
    },
  };
}

export function getOverviewDashboardData(stationId: string = 'alipur'): OverviewDashboardData {
  const station = DELHI_NCR_STATIONS.find(s => s.id === stationId) || DELHI_NCR_STATIONS[0];
  const forecast = getStationForecast(station.id, 72);
  const currentPoint = forecast.hourly.find(p => p.hourOffset === 0) || forecast.hourly[12];
  const past24Point = forecast.hourly.find(p => p.hourOffset === -12) || currentPoint;

  const stationComparisons = DELHI_NCR_STATIONS.map(st => {
    let aqi = 290;
    if (st.id === 'anand_vihar') aqi = 378;
    else if (st.id === 'mundka') aqi = 365;
    else if (st.id === 'bawana') aqi = 352;
    else if (st.id === 'punjabi_bagh') aqi = 318;
    else if (st.id === 'ito') aqi = 312;
    else if (st.id === 'alipur') aqi = 304;
    else if (st.id === 'patparganj') aqi = 296;
    else if (st.id === 'dwarka_sec8') aqi = 282;
    else if (st.id === 'ghaziabad_vasundhara') aqi = 330;
    else if (st.id === 'noida_sec62') aqi = 310;
    else if (st.id === 'gurugram_sec51') aqi = 288;
    else if (st.id === 'faridabad_sec16a') aqi = 294;
    else if (st.id === 'lodhi_road') aqi = 242;
    else if (st.id === 'aya_nagar') aqi = 238;

    return {
      stationId: st.id,
      stationName: st.name,
      city: st.city,
      aqi,
      category: getAQICategory(aqi),
      primaryPollutant: 'PM2.5',
      observedAt: '2026-10-22T18:00:00+05:30',
    };
  }).sort((a, b) => b.aqi - a.aqi);

  return {
    region: 'Delhi NCR',
    currentStationId: station.id,
    currentStationName: station.name,
    updatedAt: '2026-10-22T18:00:00+05:30',
    status: 'demo',
    currentAQI: currentPoint.predictedAQI,
    currentCategory: currentPoint.category,
    aqiChange24h: currentPoint.predictedAQI - past24Point.predictedAQI,
    peakPredictedAQI72h: forecast.peakPollution.maxAQI,
    peakStationName: 'Anand Vihar',
    currentPM25: currentPoint.pm25,
    pm25Change24h: currentPoint.pm25 - past24Point.pm25,
    currentPM10: currentPoint.pm10,
    pm10Change24h: currentPoint.pm10 - past24Point.pm10,
    currentTemperature: currentPoint.temperature,
    currentRelativeHumidity: currentPoint.relativeHumidity,
    currentWindSpeed: currentPoint.windSpeed,
    currentWindDirection: currentPoint.windDirection,
    currentWindDirectionText: 'NW (305°)',
    alerts: MOCK_ALERTS,
    historyAndForecast: forecast.hourly.map(h => ({
      timestamp: h.timestamp,
      aqi: h.predictedAQI,
      isObserved: !!h.isObserved,
      pm25: h.pm25,
      pm10: h.pm10,
      o3: h.o3,
      no2: h.no2,
    })),
    stationComparisons,
  };
}

export const MOCK_VERTICAL_PROFILE: VerticalProfileLevel[] = [
  { altitudeMeters: 0, temperatureCelsius: 19.8, dewPointCelsius: 14.2, windSpeedKnots: 2.1, windDirection: 310, isInversionLayer: false },
  { altitudeMeters: 75, temperatureCelsius: 20.9, dewPointCelsius: 13.8, windSpeedKnots: 3.2, windDirection: 315, isInversionLayer: true },
  { altitudeMeters: 150, temperatureCelsius: 22.4, dewPointCelsius: 13.0, windSpeedKnots: 4.5, windDirection: 320, isInversionLayer: true },
  { altitudeMeters: 240, temperatureCelsius: 24.1, dewPointCelsius: 12.1, windSpeedKnots: 5.8, windDirection: 325, isInversionLayer: true },
  { altitudeMeters: 350, temperatureCelsius: 24.6, dewPointCelsius: 11.2, windSpeedKnots: 7.2, windDirection: 330, isInversionLayer: true },
  { altitudeMeters: 450, temperatureCelsius: 23.8, dewPointCelsius: 10.4, windSpeedKnots: 8.5, windDirection: 330, isInversionLayer: false },
  { altitudeMeters: 600, temperatureCelsius: 22.2, dewPointCelsius: 9.1, windSpeedKnots: 10.2, windDirection: 335, isInversionLayer: false },
  { altitudeMeters: 800, temperatureCelsius: 20.4, dewPointCelsius: 7.5, windSpeedKnots: 12.0, windDirection: 340, isInversionLayer: false },
  { altitudeMeters: 1000, temperatureCelsius: 18.5, dewPointCelsius: 5.8, windSpeedKnots: 13.8, windDirection: 340, isInversionLayer: false },
  { altitudeMeters: 1400, temperatureCelsius: 14.8, dewPointCelsius: 2.2, windSpeedKnots: 16.5, windDirection: 345, isInversionLayer: false },
  { altitudeMeters: 1800, temperatureCelsius: 11.2, dewPointCelsius: -1.5, windSpeedKnots: 19.2, windDirection: 350, isInversionLayer: false },
  { altitudeMeters: 2200, temperatureCelsius: 7.6, dewPointCelsius: -5.2, windSpeedKnots: 22.0, windDirection: 355, isInversionLayer: false },
  { altitudeMeters: 2600, temperatureCelsius: 4.1, dewPointCelsius: -9.0, windSpeedKnots: 25.4, windDirection: 355, isInversionLayer: false },
];

export const MOCK_INVERSION_DIAGNOSTIC: InversionDiagnostic = {
  detected: true,
  baseMeters: 50,
  topMeters: 380,
  deltaTCelsius: 4.8,
  layerDepthMeters: 330,
  strengthCategory: 'Severe',
  timestamp: '2026-10-22T05:30:00+05:30',
  source: 'IMD Radiosonde / Ayanagar Boundary-Layer Sounding + WRF Model Profile',
  explanation: 'Radiation ground cooling under cloudless nocturnal skies has produced a severe surface-based thermal inversion. Temperature increases by +4.8°C with altitude up to 380m, preventing vertical convective dispersion of ground-level particulate matter and exhaust emissions.',
};

export const MOCK_FIRE_DETECTIONS: FireDetection[] = [
  // Punjab active clusters (NASA FIRMS VIIRS attributes)
  { id: 'fire-pb-01', latitude: 30.9884, longitude: 74.8402, acqDate: '2026-10-22', acqTime: '13:42', satellite: 'VIIRS', instrument: 'VIIRS-NPP', confidence: 'high', frp: 38.6, dayNight: 'D', state: 'Punjab', distanceToDelhiKm: 312, bearingToDelhiDeg: 132 },
  { id: 'fire-pb-02', latitude: 31.0405, longitude: 74.7972, acqDate: '2026-10-22', acqTime: '13:42', satellite: 'VIIRS', instrument: 'VIIRS-NPP', confidence: 'high', frp: 54.2, dayNight: 'D', state: 'Punjab', distanceToDelhiKm: 320, bearingToDelhiDeg: 133 },
  { id: 'fire-pb-03', latitude: 30.2450, longitude: 75.4520, acqDate: '2026-10-22', acqTime: '13:43', satellite: 'VIIRS', instrument: 'VIIRS-NPP', confidence: 'high', frp: 42.8, dayNight: 'D', state: 'Punjab', distanceToDelhiKm: 225, bearingToDelhiDeg: 138 },
  { id: 'fire-pb-04', latitude: 30.3120, longitude: 75.3980, acqDate: '2026-10-22', acqTime: '13:43', satellite: 'VIIRS', instrument: 'VIIRS-NPP', confidence: 'nominal', frp: 18.5, dayNight: 'D', state: 'Punjab', distanceToDelhiKm: 231, bearingToDelhiDeg: 137 },
  { id: 'fire-pb-05', latitude: 31.5485, longitude: 75.4735, acqDate: '2026-10-22', acqTime: '13:42', satellite: 'VIIRS', instrument: 'VIIRS-NPP', confidence: 'high', frp: 62.4, dayNight: 'D', state: 'Punjab', distanceToDelhiKm: 365, bearingToDelhiDeg: 142 },
  { id: 'fire-pb-06', latitude: 30.7200, longitude: 75.1200, acqDate: '2026-10-22', acqTime: '01:50', satellite: 'VIIRS', instrument: 'VIIRS-NOAA20', confidence: 'nominal', frp: 14.2, dayNight: 'N', state: 'Punjab', distanceToDelhiKm: 275, bearingToDelhiDeg: 135 },
  { id: 'fire-pb-07', latitude: 30.0800, longitude: 75.7800, acqDate: '2026-10-22', acqTime: '13:43', satellite: 'VIIRS', instrument: 'VIIRS-NPP', confidence: 'high', frp: 31.0, dayNight: 'D', state: 'Punjab', distanceToDelhiKm: 198, bearingToDelhiDeg: 142 },
  // Haryana active clusters
  { id: 'fire-hr-01', latitude: 29.8006, longitude: 75.8804, acqDate: '2026-10-22', acqTime: '13:43', satellite: 'VIIRS', instrument: 'VIIRS-NPP', confidence: 'nominal', frp: 16.4, dayNight: 'D', state: 'Haryana', distanceToDelhiKm: 168, bearingToDelhiDeg: 148 },
  { id: 'fire-hr-02', latitude: 29.6850, longitude: 76.9800, acqDate: '2026-10-22', acqTime: '13:44', satellite: 'VIIRS', instrument: 'VIIRS-NPP', confidence: 'high', frp: 28.3, dayNight: 'D', state: 'Haryana', distanceToDelhiKm: 124, bearingToDelhiDeg: 172 },
  { id: 'fire-hr-03', latitude: 29.9600, longitude: 76.8400, acqDate: '2026-10-22', acqTime: '13:44', satellite: 'VIIRS', instrument: 'VIIRS-NPP', confidence: 'high', frp: 34.5, dayNight: 'D', state: 'Haryana', distanceToDelhiKm: 152, bearingToDelhiDeg: 169 },
  { id: 'fire-hr-04', latitude: 29.5200, longitude: 76.1200, acqDate: '2026-10-22', acqTime: '13:43', satellite: 'VIIRS', instrument: 'VIIRS-NPP', confidence: 'nominal', frp: 12.8, dayNight: 'D', state: 'Haryana', distanceToDelhiKm: 140, bearingToDelhiDeg: 142 },
  // Western UP & Rajasthan
  { id: 'fire-up-01', latitude: 28.9990, longitude: 79.3617, acqDate: '2026-10-22', acqTime: '13:45', satellite: 'VIIRS', instrument: 'VIIRS-NPP', confidence: 'nominal', frp: 10.3, dayNight: 'D', state: 'Uttar Pradesh', distanceToDelhiKm: 215, bearingToDelhiDeg: 258 },
  { id: 'fire-up-02', latitude: 29.0407, longitude: 79.2153, acqDate: '2026-10-22', acqTime: '13:45', satellite: 'VIIRS', instrument: 'VIIRS-NPP', confidence: 'nominal', frp: 14.6, dayNight: 'D', state: 'Uttar Pradesh', distanceToDelhiKm: 202, bearingToDelhiDeg: 256 },
  { id: 'fire-rj-01', latitude: 27.8353, longitude: 73.0463, acqDate: '2026-10-22', acqTime: '13:40', satellite: 'VIIRS', instrument: 'VIIRS-NPP', confidence: 'low', frp: 6.8, dayNight: 'D', state: 'Rajasthan', distanceToDelhiKm: 420, bearingToDelhiDeg: 78 },
];

export const MOCK_PLUME_TRAJECTORY: PlumeTrajectoryPoint[] = [
  { stepHour: -48, latitude: 31.04, longitude: 74.80, altitudeMeters: 650, estimatedConcentrationIndex: 85, timestamp: '2026-10-20T18:00:00+05:30' },
  { stepHour: -36, latitude: 30.55, longitude: 75.35, altitudeMeters: 580, estimatedConcentrationIndex: 78, timestamp: '2026-10-21T06:00:00+05:30' },
  { stepHour: -24, latitude: 29.98, longitude: 75.92, altitudeMeters: 490, estimatedConcentrationIndex: 72, timestamp: '2026-10-21T18:00:00+05:30' },
  { stepHour: -12, latitude: 29.35, longitude: 76.50, altitudeMeters: 380, estimatedConcentrationIndex: 65, timestamp: '2026-10-22T06:00:00+05:30' },
  { stepHour: 0, latitude: 28.70, longitude: 77.10, altitudeMeters: 250, estimatedConcentrationIndex: 58, timestamp: '2026-10-22T18:00:00+05:30' },
  { stepHour: 12, latitude: 28.52, longitude: 77.25, altitudeMeters: 190, estimatedConcentrationIndex: 52, timestamp: '2026-10-23T06:00:00+05:30' },
  { stepHour: 24, latitude: 28.35, longitude: 77.40, altitudeMeters: 210, estimatedConcentrationIndex: 44, timestamp: '2026-10-23T18:00:00+05:30' },
];

export const MOCK_MODEL_METRICS: ModelValidationMetrics = {
  mae: 18.6,
  rmse: 24.8,
  r2: 0.86,
  validationPeriod: 'Winter Campaign (Oct 2025 – Feb 2026)',
  forecastHorizonHours: 72,
  stationsEvaluatedCount: 15,
  lastRunTimestamp: '2026-10-22T12:00:00+05:30',
  horizonErrors: [
    { horizon: 1, mae: 8.4, rmse: 11.2, r2: 0.94, persistenceMae: 14.5 },
    { horizon: 6, mae: 12.1, rmse: 16.4, r2: 0.91, persistenceMae: 25.8 },
    { horizon: 12, mae: 15.6, rmse: 20.8, r2: 0.88, persistenceMae: 34.2 },
    { horizon: 24, mae: 18.6, rmse: 24.8, r2: 0.86, persistenceMae: 44.0 },
    { horizon: 48, mae: 24.2, rmse: 31.5, r2: 0.80, persistenceMae: 58.7 },
    { horizon: 72, mae: 31.8, rmse: 40.2, r2: 0.74, persistenceMae: 69.4 },
  ],
  stationPerformance: [
    { stationId: 'alipur', stationName: 'Alipur (Site 5024)', mae: 17.2, rmse: 22.9, r2: 0.88 },
    { stationId: 'anand_vihar', stationName: 'Anand Vihar', mae: 22.4, rmse: 29.8, r2: 0.82 },
    { stationId: 'aya_nagar', stationName: 'Aya Nagar', mae: 14.8, rmse: 19.5, r2: 0.90 },
    { stationId: 'bawana', stationName: 'Bawana', mae: 21.0, rmse: 28.1, r2: 0.84 },
    { stationId: 'dwarka_sec8', stationName: 'Dwarka Sector-8', mae: 16.5, rmse: 22.0, r2: 0.87 },
    { stationId: 'ito', stationName: 'ITO Intersection', mae: 19.8, rmse: 26.2, r2: 0.85 },
    { stationId: 'lodhi_road', stationName: 'Lodhi Road', mae: 15.1, rmse: 20.2, r2: 0.89 },
    { stationId: 'mundka', stationName: 'Mundka', mae: 23.1, rmse: 30.5, r2: 0.81 },
    { stationId: 'patparganj', stationName: 'Patparganj', mae: 18.2, rmse: 24.1, r2: 0.86 },
    { stationId: 'punjabi_bagh', stationName: 'Punjabi Bagh', mae: 18.9, rmse: 25.0, r2: 0.85 },
    { stationId: 'rk_puram', stationName: 'R K Puram', mae: 17.8, rmse: 23.4, r2: 0.87 },
  ],
  configuration: {
    atmosphericModel: 'WRF-Chem (Weather Research & Forecasting with Chemistry)',
    version: 'v4.4.2 (NCAR / NOAA)',
    chemistryMechanism: 'RADM2 (Regional Acid Deposition Model 2)',
    aerosolConfig: 'MADE/SORGAM (Modal Aerosol Dynamics for Europe / Secondary Organic Aerosols)',
    twoWayFeedback: 'Coupled (Aerosol direct & indirect radiative feedbacks enabled on PBL thermodynamics)',
    horizontalResolution: '3 km × 3 km nested inner grid (d03 Delhi NCR), 9 km outer domain (d02 Indo-Gangetic Plain)',
    domain: 'Indo-Gangetic Plain (26°N–32°N, 73°E–81°E)',
    initializationTime: 'Daily 00:00 UTC & 12:00 UTC from NCEP GFS 0.25° Global Boundary Conditions',
    emissionsInventory: 'SAFAR High-Resolution 1km Delhi + EDGAR v6.1 Global + CPCB Point Sources + VIIRS Near-Real-Time FRP Stubble Injection',
    mlEnsembleComponents: 'Gradient Boosted Trees (LightGBM) + Bidirectional LSTM post-processing bias correction',
    runStatus: 'Operational',
    lastErrorNotice: null,
  },
};
