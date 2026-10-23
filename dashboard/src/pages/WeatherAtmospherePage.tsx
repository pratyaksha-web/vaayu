import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { vaayuApi } from '../services/api';
import type { VerticalProfileLevel, InversionDiagnostic } from '../types';
import { SummaryMetricCard } from '../components/common/SummaryMetricCard';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  LineChart, 
  Line, 
  Area, 
  AreaChart,
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ReferenceArea, 
  ReferenceLine,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend
} from 'recharts';
import { 
  Thermometer, 
  Wind, 
  Droplets, 
  Gauge, 
  CloudRain, 
  Layers, 
  AlertTriangle, 
  Info, 
  Compass
} from 'lucide-react';

export const WeatherAtmospherePage: React.FC = () => {
  const { selectedStationId, selectedStation } = useApp();
  const [profile, setProfile] = useState<VerticalProfileLevel[]>([]);
  const [diagnostic, setDiagnostic] = useState<InversionDiagnostic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    vaayuApi.getAtmosphere(selectedStationId).then((res) => {
      if (isMounted) {
        setProfile(res.profile);
        setDiagnostic(res.diagnostic);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [selectedStationId]);

  // Hourly weather time-series (72h)
  const hourlyWeather = React.useMemo(() => {
    const list = [];
    const now = new Date('2026-10-22T18:00:00+05:30');
    for (let i = 0; i <= 72; i += 2) {
      const t = new Date(now.getTime() + i * 3600 * 1000);
      const hour = t.getHours();
      const temp = Number((23 + Math.sin((hour - 9) * 0.26) * 7.5).toFixed(1));
      const rh = Math.round(Math.max(38, 75 - (temp - 17) * 4));
      const windSpd = Number(Math.max(2.0, 7.5 + Math.sin((hour - 11) * 0.26) * 4.2).toFixed(1));
      const pblh = Math.round(Math.max(170, 1200 * Math.max(0.12, Math.sin((hour - 6) * (Math.PI / 14)))));
      list.push({
        hourLabel: `+${i}h`,
        timestamp: t.toISOString(),
        temperature: temp,
        humidity: rh,
        windSpeed: windSpd,
        precipitation: i === 48 ? 0.4 : 0, // negligible rain in autumn
        pblh,
      });
    }
    return list;
  }, []);

  // Wind Rose Directional Bins (NW, NNW, WNW dominate Delhi autumn/winter)
  const windRoseData = [
    { direction: 'N', calm: 4, light: 8, moderate: 4, fresh: 1 },
    { direction: 'NE', calm: 2, light: 4, moderate: 2, fresh: 0 },
    { direction: 'E', calm: 1, light: 2, moderate: 1, fresh: 0 },
    { direction: 'SE', calm: 1, light: 2, moderate: 1, fresh: 0 },
    { direction: 'S', calm: 2, light: 3, moderate: 2, fresh: 0 },
    { direction: 'SW', calm: 3, light: 6, moderate: 4, fresh: 1 },
    { direction: 'W', calm: 8, light: 16, moderate: 12, fresh: 3 },
    { direction: 'WNW', calm: 12, light: 24, moderate: 18, fresh: 6 },
    { direction: 'NW', calm: 14, light: 32, moderate: 22, fresh: 8 },
    { direction: 'NNW', calm: 10, light: 20, moderate: 14, fresh: 4 },
  ];

  if (loading || !diagnostic) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="w-10 h-10 border-3 border-teal-800 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Computing atmospheric boundary layer profiles and inversion metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-serif">
              Atmospheric Dynamics & Inversion Diagnostics
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-50 text-teal-800 border border-teal-200 font-mono">
              Boundary-Layer Meteorology
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Analyzing planetary boundary layer height (PBLH), wind shear, and vertical temperature stratification for {selectedStation.name}.
          </p>
        </div>
      </div>

      {/* Summary Cards Row (8 cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <SummaryMetricCard
          title="Surface Temp"
          value={22.4}
          unit="°C"
          timestamp="AWS Sensor"
          icon={<Thermometer className="w-4 h-4 text-teal-600" />}
        />
        <SummaryMetricCard
          title="Rel. Humidity"
          value={68}
          unit="%"
          timestamp="AWS Sensor"
          icon={<Droplets className="w-4 h-4 text-sky-600" />}
        />
        <SummaryMetricCard
          title="Wind Velocity"
          value={4.8}
          unit="km/h"
          timestamp="Low (Stagnant)"
          icon={<Wind className="w-4 h-4 text-amber-600" />}
        />
        <SummaryMetricCard
          title="Wind Vector"
          value="NW"
          unit="305°"
          timestamp="Smoke Corridor"
          icon={<Compass className="w-4 h-4 text-teal-700" />}
        />
        <SummaryMetricCard
          title="Pressure"
          value={1014.2}
          unit="hPa"
          timestamp="High Pressure"
          icon={<Gauge className="w-4 h-4 text-slate-600" />}
        />
        <SummaryMetricCard
          title="Rainfall"
          value={0.0}
          unit="mm"
          timestamp="Past 24 Hours"
          icon={<CloudRain className="w-4 h-4 text-blue-500" />}
        />
        <SummaryMetricCard
          title="Min PBL Height"
          value={180}
          unit="m"
          timestamp="Nocturnal Depth"
          highlightColor="#7f1d1d"
          icon={<Layers className="w-4 h-4 text-rose-600" />}
        />
        <SummaryMetricCard
          title="Inversion Status"
          value={diagnostic.detected ? 'Active' : 'None'}
          unit={diagnostic.strengthCategory}
          timestamp="Surface-Based"
          highlightColor="#ef4444"
          icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
        />
      </div>

      {/* Inversion Diagnostics Card & Educational Panel */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Atmospheric Inversion Diagnostics & Ventilation Index
              </h3>
              <p className="text-[11px] text-slate-500">
                Derived from IMD Ayanagar upper-air radiosonde soundings and WRF model boundary-layer physics.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
              Inversion Detected: {diagnostic.strengthCategory} (+{diagnostic.deltaTCelsius}°C)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Inversion Base Altitude</div>
            <div className="text-xl font-bold font-serif text-slate-900 mt-0.5">{diagnostic.baseMeters} meters AGL</div>
            <p className="text-[11px] text-slate-500 mt-1">Ground-level surface radiation inversion</p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Inversion Top / Cap</div>
            <div className="text-xl font-bold font-serif text-slate-900 mt-0.5">{diagnostic.topMeters} meters AGL</div>
            <p className="text-[11px] text-slate-500 mt-1">Lid preventing vertical pollutant escape</p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Thermal Stratification ΔT</div>
            <div className="text-xl font-bold font-serif text-rose-700 mt-0.5">+{diagnostic.deltaTCelsius}°C</div>
            <p className="text-[11px] text-slate-500 mt-1">Positive temperature lapse rate anomaly</p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Layer Depth</div>
            <div className="text-xl font-bold font-serif text-slate-900 mt-0.5">{diagnostic.layerDepthMeters} meters</div>
            <p className="text-[11px] text-slate-500 mt-1">Total depth of stagnant inversion pool</p>
          </div>
        </div>

        <div className="mt-4 p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <Info className="w-4 h-4 text-amber-700" />
            <span>Why Delhi NCR Experiences Severe Air Pollution Episodes During Inversions:</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-800">
            Normally, atmospheric temperature decreases with altitude, allowing buoyant warm surface air to rise and dilute ground-level pollutants. During autumn and winter nights, intense radiative ground cooling creates a <strong>temperature inversion</strong> where cooler, dense air is trapped underneath warmer air. Combined with <strong>calm surface winds (&lt;6 km/h)</strong> and a <strong>compressed boundary layer (&lt;200m)</strong>, vehicular exhaust and agricultural smoke have zero vertical or horizontal ventilation, causing particulate concentrations to spike 3x–6x.
          </p>
        </div>
      </div>

      {/* Main Charts: Vertical Temperature Profile & Boundary Layer Height */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* A. Vertical Temperature Profile */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Vertical Atmospheric Temperature Profile (0–2600m)
              </h3>
              <p className="text-[11px] text-slate-500">
                Temperature vs Altitude. The highlighted yellow zone shows the thermal inversion layer.
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
              Radiosonde Sounding
            </span>
          </div>

          <div className="h-80 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={profile}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                  type="number" 
                  dataKey="temperatureCelsius" 
                  domain={[0, 30]} 
                  unit="°C"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  label={{ value: 'Temperature (°C)', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 11 }}
                />
                <YAxis 
                  type="number" 
                  dataKey="altitudeMeters" 
                  domain={[0, 2600]} 
                  unit="m"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  label={{ value: 'Altitude AGL (meters)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                  formatter={(val: any, name: any) => [`${val}°C`, name === 'temperatureCelsius' ? 'Dry Bulb Temp' : 'Dew Point']}
                  labelFormatter={(alt) => `Altitude: ${alt} meters`}
                />

                {/* Highlight Inversion Zone 50m to 380m */}
                <ReferenceArea 
                  y1={50} 
                  y2={380} 
                  fill="#fef08a" 
                  fillOpacity={0.35} 
                  stroke="#eab308" 
                  strokeDasharray="3 3"
                />

                <Line 
                  type="monotone" 
                  dataKey="temperatureCelsius" 
                  stroke="#ef4444" 
                  strokeWidth={2.5} 
                  dot={{ r: 3, fill: '#ef4444' }} 
                  name="Temperature (°C)"
                />
                <Line 
                  type="monotone" 
                  dataKey="dewPointCelsius" 
                  stroke="#0284c7" 
                  strokeWidth={2} 
                  strokeDasharray="4 4"
                  dot={{ r: 2, fill: '#0284c7' }} 
                  name="Dew Point (°C)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200 border border-amber-400" /> Inversion Layer (50m–380m)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-500" /> Ambient Temp</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-sky-500 border-dashed" /> Dew Point</span>
          </div>
        </div>

        {/* B. Boundary Layer Height (PBLH) Forecast */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Planetary Boundary Layer Height (PBLH 72h)
              </h3>
              <p className="text-[11px] text-slate-500">
                Notice diurnal breathing: daytime convective growth to &gt;1100m, nocturnal collapse to &lt;200m.
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-semibold border border-teal-200">
              WRF-Chem PBL
            </span>
          </div>

          <div className="h-80 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyWeather} margin={{ top: 10, right: 15, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis 
                  dataKey="hourLabel" 
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  label={{ value: 'Forecast Horizon Hours', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 11 }}
                />
                <YAxis 
                  domain={[0, 1400]} 
                  unit="m" 
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                  formatter={(val: any) => [`${val} meters`, 'Mixing Layer Height']}
                  labelFormatter={(lbl) => `Horizon: ${lbl}`}
                />
                <ReferenceLine y={250} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Critical Shallow Stagnation (<250m)', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
                <Area 
                  type="monotone" 
                  dataKey="pblh" 
                  stroke="#0f766e" 
                  strokeWidth={2.5} 
                  fill="#0f766e" 
                  fillOpacity={0.15} 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
            <span>When PBLH drops below 250m at night, pollution concentration rapidly doubles.</span>
            <span className="font-mono text-teal-700 font-semibold">T+72h Horizon</span>
          </div>
        </div>
      </div>

      {/* Wind Rose and Dispersion Forcing Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Wind Rose Chart (1 col) */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Delhi NCR Wind Rose
              </h3>
              <p className="text-[11px] text-slate-500">Directional frequency & speed bins</p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
              Predominant NW
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={windRoseData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="direction" tick={{ fontSize: 10, fill: '#475569' }} />
                <PolarRadiusAxis angle={30} domain={[0, 35]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                <Radar name="Moderate (4-6 m/s)" dataKey="moderate" stroke="#0f766e" fill="#0f766e" fillOpacity={0.4} />
                <Radar name="Light (2-4 m/s)" dataKey="light" stroke="#0284c7" fill="#0284c7" fillOpacity={0.25} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
            <span>North-westerly winds (NW/WNW) account for 68% of post-monsoon airflow.</span>
          </div>
        </div>

        {/* Weather Time-Series Grid: Wind Speed, Temp, Humidity (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <h3 className="font-bold text-slate-900 text-sm sm:text-base mb-1">
            Hourly Meteorological Dispersion Forcing (72 Hours)
          </h3>
          <p className="text-[11px] text-slate-500 mb-4">
            Surface wind speed and ambient temperature driving nocturnal stagnation vs daytime ventilation.
          </p>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyWeather} margin={{ top: 10, right: 15, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="hourLabel" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis yAxisId="wind" domain={[0, 18]} unit="km/h" tick={{ fontSize: 10, fill: '#0284c7' }} />
                <YAxis yAxisId="temp" orientation="right" domain={[10, 36]} unit="°C" tick={{ fontSize: 10, fill: '#ef4444' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                  formatter={(val: any, name: any) => [
                    name === 'windSpeed' ? `${val} km/h` : `${val}°C`,
                    name === 'windSpeed' ? 'Wind Speed' : 'Temperature'
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                <Line yAxisId="wind" type="monotone" dataKey="windSpeed" stroke="#0284c7" strokeWidth={2} dot={false} name="Wind Speed (km/h)" />
                <Line yAxisId="temp" type="monotone" dataKey="temperature" stroke="#ef4444" strokeWidth={2} dot={false} name="Temperature (°C)" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-400">Calm wind periods (&lt;5 km/h) correlate directly with severe AQI episodes.</span>
            <span className="font-mono text-teal-700 font-semibold text-[10px]">PBLH Coupling</span>
          </div>
        </div>
      </div>
    </div>
  );
};
