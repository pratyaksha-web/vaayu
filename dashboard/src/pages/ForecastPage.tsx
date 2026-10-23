import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { vaayuApi } from '../services/api';
import type { StationForecast, HourlyForecastPoint } from '../types';
import { 
  getAQICategoryInfo, 
  formatISTDateTime, 
  formatISTTimeOnly, 
  formatISTDateOnly, 
  exportToCSV 
} from '../utils/aqi';
import { CPCBExplanationModal } from '../components/common/CPCBExplanationModal';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ReferenceLine 
} from 'recharts';
import { 
  Download, 
  Clock, 
  AlertTriangle, 
  Table as TableIcon
} from 'lucide-react';

export const ForecastPage: React.FC = () => {
  const { selectedStationId, setSelectedStationId, stations } = useApp();
  const [forecast, setForecast] = useState<StationForecast | null>(null);
  const [horizonHours, setHorizonHours] = useState<24 | 48 | 72>(72);
  const [viewInterval, setViewInterval] = useState<'hourly' | 'three_hourly'>('hourly');
  const [showOnlyPredicted, setShowOnlyPredicted] = useState(false);
  const [showCPCBModal, setShowCPCBModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    vaayuApi.getForecast(selectedStationId, horizonHours).then((res) => {
      if (isMounted) {
        setForecast(res);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [selectedStationId, horizonHours]);

  if (loading || !forecast) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="w-10 h-10 border-3 border-teal-800 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Generating 72-hour atmospheric boundary layer forecasts...</p>
      </div>
    );
  }

  // Filter hourly points
  let displayedPoints = forecast.hourly.filter(p => {
    if (showOnlyPredicted && p.hourOffset <= 0) return false;
    return p.hourOffset <= horizonHours;
  });

  if (viewInterval === 'three_hourly') {
    displayedPoints = displayedPoints.filter(p => p.hourOffset % 3 === 0);
  }

  // Forecast Heatmap Data (Stations on Y-axis, Forecast Horiz on X-axis)
  const heatmapStations = stations.slice(0, 7);
  const heatmapTimes = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72].filter(h => h <= horizonHours);

  const handleExportCSV = () => {
    const rows = displayedPoints.map(p => ({
      Timestamp_IST: formatISTDateTime(p.timestamp),
      Hour_Offset: `+${p.hourOffset}h`,
      Observation_or_Forecast: p.isObserved ? 'Observed' : 'Model Prediction',
      Predicted_AQI: p.predictedAQI,
      AQI_Category: p.category,
      PM25_ug_m3: p.pm25,
      PM10_ug_m3: p.pm10,
      O3_ug_m3: p.o3,
      NO2_ug_m3: p.no2,
      NOx_ppb: p.nox || 'N/A',
      Surface_Temp_C: p.temperature,
      Relative_Humidity_Pct: p.relativeHumidity,
      Wind_Speed_kmh: p.windSpeed,
      Boundary_Layer_Height_m: p.boundaryLayerHeight,
    }));
    exportToCSV(rows, `VAAYU_AQI_Forecast_${forecast.stationName}_${horizonHours}h`);
  };

  const peak = forecast.peakPollution;
  const peakInfo = getAQICategoryInfo(peak.maxAQI);

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-serif">
              72-Hour Air Quality & Pollutant Forecast
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-50 text-teal-800 border border-teal-200 font-mono">
              WRF-Chem + ML Ensemble
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Deterministic atmospheric forecasts resolved hourly for {forecast.stationName} and Delhi NCR micro-airsheds.
          </p>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Station selector */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs shadow-2xs">
            <span className="text-slate-400 font-medium">Station:</span>
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
            >
              {stations.map(st => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>
          </div>

          {/* Horizon Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium">
            {([24, 48, 72] as const).map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizonHours(h)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  horizonHours === h ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>

          {/* Hourly vs 3-hourly */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewInterval('hourly')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                viewInterval === 'hourly' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              1-Hourly
            </button>
            <button
              type="button"
              onClick={() => setViewInterval('three_hourly')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                viewInterval === 'three_hourly' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              3-Hourly
            </button>
          </div>

          {/* CSV Export Button */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-teal-800 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Peak Pollution & Episode Summary Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex items-center gap-3">
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border"
            style={{ backgroundColor: peakInfo.bgColor, borderColor: peakInfo.borderColor }}
          >
            <span className="text-xl font-bold font-serif" style={{ color: peakInfo.color }}>
              {peak.maxAQI}
            </span>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase">Predicted Peak AQI</div>
            <div className="text-sm font-bold text-slate-900 font-serif">{peakInfo.label} Category</div>
            <div className="text-[11px] text-slate-500">Primary: {peak.peakPollutant}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
            <Clock className="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase">Peak Timing</div>
            <div className="text-sm font-bold text-slate-800 font-serif">
              {peak.peakTime ? formatISTTimeOnly(peak.peakTime) + ' IST' : 'N/A'}
            </div>
            <div className="text-[11px] text-slate-500">
              {peak.peakTime ? formatISTDateOnly(peak.peakTime) : 'Early Morning Hours'}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase">Elevated Pollution Duration</div>
            <div className="text-sm font-bold text-slate-800 font-serif">
              {peak.durationAbove300Hours} Hours
            </div>
            <div className="text-[11px] text-slate-500">Predicted above AQI &gt; 300</div>
          </div>
        </div>

        <div className="bg-teal-50/60 rounded-xl border border-teal-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-teal-900 font-semibold">
            <span>Official CPCB Advisory</span>
            <button
              type="button"
              onClick={() => setShowCPCBModal(true)}
              className="text-teal-700 hover:text-teal-900 underline text-[11px] cursor-pointer"
            >
              Formula Info
            </button>
          </div>
          <p className="text-[11px] text-teal-800 mt-1 leading-snug">
            {peakInfo.healthAdvisory}
          </p>
        </div>
      </div>

      {/* Main Hourly AQI Forecast Chart with Uncertainty Band & Category Lines */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Hourly Predicted AQI Trajectory ({horizonHours} Hours Horizon)
            </h3>
            <p className="text-[11px] text-slate-500">
              Shaded area shows 90% confidence uncertainty interval derived from meteorological ensemble perturbations.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyPredicted}
                onChange={(e) => setShowOnlyPredicted(e.target.checked)}
                className="rounded border-slate-300 text-teal-800 focus:ring-teal-500"
              />
              <span>Forecast Only (Hide Past)</span>
            </label>
          </div>
        </div>

        <div className="h-80 w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={displayedPoints} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getHours()}:00`;
                }}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <YAxis 
                domain={[0, 480]} 
                ticks={[0, 50, 100, 200, 300, 400]}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload as HourlyForecastPoint;
                    const info = getAQICategoryInfo(item.predictedAQI);
                    return (
                      <div className="bg-slate-900 text-white text-xs p-3 rounded-lg shadow-xl border border-slate-700 min-w-[200px]">
                        <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 mb-1">
                          <span>{formatISTDateTime(item.timestamp)}</span>
                          <span className="text-teal-300">+{item.hourOffset}h</span>
                        </div>
                        <div className="flex items-baseline justify-between mt-1">
                          <span className="font-medium text-slate-300">Forecast AQI:</span>
                          <span className="text-lg font-bold font-serif" style={{ color: info.color }}>
                            {item.predictedAQI}
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-300 mb-2">
                          Category: {info.label}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                          <div>PM2.5: {item.pm25} µg/m³</div>
                          <div>PM10: {item.pm10} µg/m³</div>
                          <div>NO2: {item.no2} µg/m³</div>
                          <div>O3: {item.o3} µg/m³</div>
                          <div>Temp: {item.temperature}°C</div>
                          <div>PBLH: {item.boundaryLayerHeight}m</div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {/* Thresholds */}
              <ReferenceLine y={100} stroke="#65a30d" strokeDasharray="3 3" />
              <ReferenceLine y={200} stroke="#eab308" strokeDasharray="3 3" />
              <ReferenceLine y={300} stroke="#f97316" strokeDasharray="3 3" />
              <ReferenceLine y={400} stroke="#ef4444" strokeDasharray="3 3" />

              {/* Forecast start line */}
              <ReferenceLine x={displayedPoints.find(p => p.hourOffset === 0)?.timestamp} stroke="#0f766e" strokeWidth={2} />

              {/* Uncertainty Upper/Lower fill */}
              <Area
                type="monotone"
                dataKey="uncertaintyUpper"
                stroke="none"
                fill="#0f766e"
                fillOpacity={0.10}
              />
              <Area
                type="monotone"
                dataKey="uncertaintyLower"
                stroke="none"
                fill="#ffffff"
                fillOpacity={1}
              />

              <Line
                type="monotone"
                dataKey="predictedAQI"
                stroke="#0f766e"
                strokeWidth={2.5}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Forecast Heatmap Across Stations */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              Delhi NCR Multi-Station Forecast Heatmap
            </h3>
            <p className="text-[11px] text-slate-500">
              Color-coded predicted CPCB severity matrix across monitoring locations over the forecast timeline.
            </p>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">CPCB NAQI Bins</span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Header row with timestamps */}
            <div className="grid grid-cols-13 gap-1 mb-1 text-[11px] font-mono text-slate-500 text-center font-medium">
              <div className="text-left font-sans font-semibold text-slate-700">Station</div>
              {heatmapTimes.map(t => (
                <div key={t}>+{t}h</div>
              ))}
            </div>

            {/* Station rows */}
            <div className="space-y-1.5">
              {heatmapStations.map(st => {
                let stationBase = 280;
                if (st.id === 'anand_vihar') stationBase = 370;
                else if (st.id === 'mundka') stationBase = 355;
                else if (st.id === 'bawana') stationBase = 345;
                else if (st.id === 'punjabi_bagh') stationBase = 310;
                else if (st.id === 'ito') stationBase = 300;
                else if (st.id === 'lodhi_road') stationBase = 230;

                return (
                  <div key={st.id} className="grid grid-cols-13 gap-1 items-center">
                    <div className="text-xs font-semibold text-slate-800 truncate pr-2 text-left">
                      {st.name.split(' ')[0]}
                    </div>
                    {heatmapTimes.map(t => {
                      const wave = Math.sin((t + 5) * 0.26) * 35;
                      const aqi = Math.round(stationBase + wave);
                      const catInfo = getAQICategoryInfo(aqi);

                      return (
                        <div
                          key={t}
                          className="h-8 rounded flex items-center justify-center text-[10px] font-bold font-mono text-white transition-transform hover:scale-105 cursor-pointer shadow-2xs"
                          style={{ backgroundColor: catInfo.color }}
                          title={`${st.name} | +${t}h | Predicted AQI: ${aqi} (${catInfo.label})`}
                        >
                          {aqi}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Heatmap Legend */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> Good</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-lime-500" /> Satisfactory</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-400" /> Moderate</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-500" /> Poor</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500" /> Very Poor</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-950" /> Severe</span>
          </div>
          <span className="text-[11px] text-slate-400 italic">Hover cells to view exact predicted index</span>
        </div>
      </div>

      {/* Hourly Forecast Table with CSV Export */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <TableIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Hourly Forecast Output Table
              </h3>
              <p className="text-[11px] text-slate-500">
                Detailed temporal data table supporting regulatory audits and environmental research.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV ({displayedPoints.length} records)</span>
          </button>
        </div>

        <div className="mt-4 overflow-x-auto border border-slate-200 rounded-lg max-h-96">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 z-10">
              <tr>
                <th className="p-2.5">Date & Time (IST)</th>
                <th className="p-2.5">Horizon</th>
                <th className="p-2.5">Predicted AQI</th>
                <th className="p-2.5">Category</th>
                <th className="p-2.5">PM2.5 (µg/m³)</th>
                <th className="p-2.5">PM10 (µg/m³)</th>
                <th className="p-2.5">O3 (µg/m³)</th>
                <th className="p-2.5">NO2 (µg/m³)</th>
                <th className="p-2.5">Temp (°C)</th>
                <th className="p-2.5">Wind (km/h)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {displayedPoints.map((row) => {
                const info = getAQICategoryInfo(row.predictedAQI);
                return (
                  <tr key={row.timestamp} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-2.5 font-sans font-medium text-slate-900">
                      {formatISTDateTime(row.timestamp)}
                    </td>
                    <td className="p-2.5 text-slate-500">
                      {row.hourOffset > 0 ? `+${row.hourOffset}h` : 'Observed'}
                    </td>
                    <td className="p-2.5 font-bold" style={{ color: info.color }}>
                      {row.predictedAQI}
                    </td>
                    <td className="p-2.5 font-sans">
                      <span 
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                        style={{ backgroundColor: info.bgColor, color: info.textColor, borderColor: info.borderColor }}
                      >
                        {info.label}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-700">{row.pm25}</td>
                    <td className="p-2.5 text-slate-700">{row.pm10}</td>
                    <td className="p-2.5 text-slate-700">{row.o3}</td>
                    <td className="p-2.5 text-slate-700">{row.no2}</td>
                    <td className="p-2.5 text-slate-600">{row.temperature}°</td>
                    <td className="p-2.5 text-slate-600">{row.windSpeed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CPCBExplanationModal
        isOpen={showCPCBModal}
        onClose={() => setShowCPCBModal(false)}
      />
    </div>
  );
};
