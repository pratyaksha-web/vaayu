export type DataStatus = 'demo' | 'historical' | 'live' | 'delayed' | 'unavailable';

export type AQICategory = 
  | 'Good' 
  | 'Satisfactory' 
  | 'Moderate' 
  | 'Poor' 
  | 'Very Poor' 
  | 'Severe';

export interface AQICategoryInfo {
  label: AQICategory;
  min: number;
  max: number;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  description: string;
  healthAdvisory: string;
}

export interface MonitoringStation {
  id: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  elevationMeters: number;
  agency: string; // e.g. DPCC, CPCB, HSPCB, UPPCB
  isOperational: boolean;
  hasVerticalProfile?: boolean;
}

export interface PollutantValues {
  pm25: number | null; // µg/m³
  pm10: number | null; // µg/m³
  o3: number | null;   // µg/m³ or ppb
  no2: number | null;  // µg/m³
  so2: number | null;  // µg/m³
  co: number | null;   // mg/m³
  nox?: number | null; // ppb
}

export interface WeatherValues {
  temperature: number; // °C
  relativeHumidity: number; // %
  windSpeed: number; // km/h or m/s
  windDirection: number; // degrees 0-360
  surfacePressure: number; // hPa
  precipitation: number; // mm
  boundaryLayerHeight?: number; // meters (PBLH)
  inversionDetected?: boolean;
}

export interface StationObservation {
  stationId: string;
  stationName: string;
  timestamp: string; // ISO IST
  aqi: number;
  category: AQICategory;
  primaryPollutant: string;
  pollutants: PollutantValues;
  weather: WeatherValues;
  status: DataStatus;
}

export interface HourlyForecastPoint {
  timestamp: string;
  hourOffset: number; // 1 to 72
  predictedAQI: number;
  category: AQICategory;
  isObserved?: boolean; // false for forecast, true for historical/observed anchor
  pm25: number;
  pm10: number;
  o3: number;
  no2: number;
  nox?: number;
  so2?: number;
  co?: number;
  temperature: number;
  relativeHumidity: number;
  windSpeed: number;
  windDirection: number;
  boundaryLayerHeight: number;
  uncertaintyLower?: number;
  uncertaintyUpper?: number;
}

export interface StationForecast {
  stationId: string;
  stationName: string;
  generatedAt: string;
  forecastHorizonHours: 24 | 48 | 72;
  modelName: string;
  status: DataStatus;
  hourly: HourlyForecastPoint[];
  peakPollution: {
    maxAQI: number;
    peakTime: string;
    peakPollutant: string;
    stationName: string;
    durationAbove300Hours: number;
  };
}

export interface AlertRecord {
  id: string;
  title: string;
  type: 'elevated_pollution' | 'low_dispersion' | 'smoke_transport' | 'data_warning';
  severity: 'info' | 'warning' | 'critical';
  issuedAt: string;
  expiresAt: string;
  message: string;
  source: string;
  affectedAreas: string[];
}

export interface InversionDiagnostic {
  detected: boolean | 'insufficient_data';
  baseMeters: number | null;
  topMeters: number | null;
  deltaTCelsius: number | null; // Inversion delta T
  layerDepthMeters: number | null;
  strengthCategory: 'Weak' | 'Moderate' | 'Severe' | 'None' | 'Insufficient data';
  timestamp: string;
  source: string;
  explanation: string;
}

export interface VerticalProfileLevel {
  altitudeMeters: number;
  temperatureCelsius: number;
  dewPointCelsius: number;
  windSpeedKnots: number;
  windDirection: number;
  isInversionLayer?: boolean;
}

export interface FireDetection {
  id: string;
  latitude: number;
  longitude: number;
  acqDate: string;
  acqTime: string;
  satellite: 'VIIRS' | 'MODIS';
  instrument: string;
  confidence: 'low' | 'nominal' | 'high' | number;
  frp: number; // Fire Radiative Power in MW
  dayNight: 'D' | 'N';
  state: 'Punjab' | 'Haryana' | 'Uttar Pradesh' | 'Rajasthan' | 'Delhi';
  distanceToDelhiKm: number;
  bearingToDelhiDeg: number;
}

export interface PlumeTrajectoryPoint {
  stepHour: number; // -48 to 0 or 0 to +48
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  estimatedConcentrationIndex: number;
  timestamp: string;
}

export interface ModelValidationMetrics {
  mae: number;
  rmse: number;
  r2: number;
  validationPeriod: string;
  forecastHorizonHours: number;
  stationsEvaluatedCount: number;
  lastRunTimestamp: string;
  horizonErrors: {
    horizon: number; // 1, 6, 12, 24, 48, 72
    mae: number;
    rmse: number;
    r2: number;
    persistenceMae: number;
  }[];
  stationPerformance: {
    stationId: string;
    stationName: string;
    mae: number;
    rmse: number;
    r2: number;
  }[];
  configuration: {
    atmosphericModel: string;
    version: string;
    chemistryMechanism: string;
    aerosolConfig: string;
    twoWayFeedback: string;
    horizontalResolution: string;
    domain: string;
    initializationTime: string;
    emissionsInventory: string;
    mlEnsembleComponents: string;
    runStatus: 'Operational' | 'Degraded' | 'Offline';
    lastErrorNotice: string | null;
  };
}

export interface OverviewDashboardData {
  region: string;
  currentStationId: string;
  currentStationName: string;
  updatedAt: string;
  status: DataStatus;
  currentAQI: number;
  currentCategory: AQICategory;
  aqiChange24h: number;
  peakPredictedAQI72h: number;
  peakStationName: string;
  currentPM25: number;
  pm25Change24h: number;
  currentPM10: number;
  pm10Change24h: number;
  currentTemperature: number;
  currentRelativeHumidity: number;
  currentWindSpeed: number;
  currentWindDirection: number;
  currentWindDirectionText: string;
  alerts: AlertRecord[];
  historyAndForecast: {
    timestamp: string;
    aqi: number;
    isObserved: boolean;
    pm25: number;
    pm10: number;
    o3: number;
    no2: number;
  }[];
  stationComparisons: {
    stationId: string;
    stationName: string;
    city: string;
    aqi: number;
    category: AQICategory;
    primaryPollutant: string;
    observedAt: string;
  }[];
}
