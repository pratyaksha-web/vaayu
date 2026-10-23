import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { vaayuApi } from '../services/api';
import type { OverviewDashboardData } from '../types';
import { AQICard } from '../components/common/AQICard';
import { SummaryMetricCard } from '../components/common/SummaryMetricCard';
import { AlertPanel } from '../components/common/AlertPanel';
import { DelhiNCRMap } from '../components/map/DelhiNCRMap';
import { CPCBExplanationModal } from '../components/common/CPCBExplanationModal';
import { getAQICategoryInfo, formatISTDateTime } from '../utils/aqi';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ReferenceLine, 
  BarChart, 
  Bar, 
  Cell 
} from 'recharts';
import { 
  Thermometer, 
  Wind, 
  TrendingUp, 
  Info
} from 'lucide-react';

export const OverviewPage: React.FC = () => {
  const { selectedStationId, setSelectedStationId, stations } = useApp();
  const [data, setData] = useState<OverviewDashboardData | null>(null);
  const [forecastHorizon, setForecastHorizon] = useState<24 | 48 | 72>(72);
  const [selectedPollutant, setSelectedPollutant] = useState<'pm25' | 'pm10' | 'o3' | 'no2'>('pm25');
  const [showCPCBModal, setShowCPCBModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    vaayuApi.getOverview(selectedStationId).then((res) => {
      if (isMounted) {
        setData(res);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [selectedStationId]);

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="w-10 h-10 border-3 border-teal-800 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading Delhi NCR atmospheric observations & 72h forecast...</p>
      </div>
    );
  }

  // Filter forecast points according to selected horizon
  const nowIndex = data.historyAndForecast.findIndex(p => !p.isObserved);
  const filteredHistoryAndForecast = data.historyAndForecast.filter((p, idx) => {
    if (p.isObserved) return true; // keep historical lead
    const hoursAhead = idx - (nowIndex >= 0 ? nowIndex : 12);
    return hoursAhead <= forecastHorizon;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Page Title & Context Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-serif">
              Delhi NCR Air Quality Overview
            </h1>
            <span className="hidden sm:inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-50 text-teal-800 border border-teal-200">
              72-Hour Horizon
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Coupled atmospheric chemistry & meteorological dispersion predictions initialized from {data.updatedAt}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCPCBModal(true)}
            className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Info className="w-3.5 h-3.5 text-teal-700" />
            <span>CPCB Sub-Index Rules</span>
          </button>
        </div>
      </div>

      {/* Top 6 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* 1. Current AQI */}
        <AQICard
          aqi={data.currentAQI}
          stationName={data.currentStationName}
          timestamp="Observed at 18:00 IST"
          change24h={data.aqiChange24h}
          onExplainClick={() => setShowCPCBModal(true)}
        />

        {/* 2. Peak Predicted AQI (72h) */}
        <SummaryMetricCard
          title="Predicted 72h Peak AQI"
          value={data.peakPredictedAQI72h}
          unit="AQI"
          subtitle={`Peak expected at ${data.peakStationName}`}
          timestamp="T+14h Window (Early Morning)"
          highlightColor="#7f1d1d"
          icon={<TrendingUp className="w-4 h-4 text-rose-600" />}
        />

        {/* 3. PM2.5 Concentration */}
        <SummaryMetricCard
          title="Fine Particulate PM2.5"
          value={data.currentPM25}
          unit="µg/m³"
          subtitle="NAAQS 24h Standard: 60 µg/m³"
          change={data.pm25Change24h}
          timestamp="Continuous Beta-Attenuation"
          highlightColor="#f97316"
        />

        {/* 4. PM10 Concentration */}
        <SummaryMetricCard
          title="Coarse Particulate PM10"
          value={data.currentPM10}
          unit="µg/m³"
          subtitle="NAAQS 24h Standard: 100 µg/m³"
          change={data.pm10Change24h}
          timestamp="Continuous Optical Particle"
          highlightColor="#eab308"
        />

        {/* 5. Surface Temperature */}
        <SummaryMetricCard
          title="Ambient Temperature"
          value={data.currentTemperature}
          unit="°C"
          subtitle={`Relative Humidity: ${data.currentRelativeHumidity}%`}
          timestamp="Surface AWS Sensor"
          highlightColor="#0f766e"
          icon={<Thermometer className="w-4 h-4 text-teal-600" />}
        />

        {/* 6. Wind Speed & Direction */}
        <SummaryMetricCard
          title="Wind Velocity & Vector"
          value={data.currentWindSpeed}
          unit="km/h"
          subtitle={`Vector: ${data.currentWindDirectionText}`}
          timestamp="Ultrasonic Anemometer (10m AGL)"
          highlightColor="#0284c7"
          icon={<Wind className="w-4 h-4 text-sky-600" />}
        />
      </div>

      {/* Main Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): AQI History & Forecast Chart */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    AQI Historical Observations & 72-Hour Forecast
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-teal-50 text-teal-800 font-semibold border border-teal-200">
                    {data.currentStationName}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Solid line denotes observed CAAQMS ground data; dashed line indicates coupled WRF-Chem model prediction.
                </p>
              </div>

              {/* Horizon Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto text-xs font-medium">
                {([24, 48, 72] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setForecastHorizon(h)}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      forecastHorizon === h
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {h}h View
                  </button>
                ))}
              </div>
            </div>

            {/* Recharts AQI Chart */}
            <div className="h-72 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={filteredHistoryAndForecast} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
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
                        const item = payload[0].payload;
                        const info = getAQICategoryInfo(item.aqi);
                        return (
                          <div className="bg-slate-900 text-white text-xs p-3 rounded-lg shadow-xl border border-slate-700 min-w-[180px]">
                            <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 mb-1">
                              <span>{formatISTDateTime(item.timestamp)}</span>
                              <span className={item.isObserved ? 'text-emerald-400' : 'text-teal-300'}>
                                {item.isObserved ? 'OBSERVED' : 'FORECAST'}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between mt-1">
                              <span className="font-medium text-slate-300">AQI Index:</span>
                              <span className="text-base font-bold font-serif" style={{ color: info.color }}>
                                {item.aqi}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] mt-0.5">
                              <span className="text-slate-400">Category:</span>
                              <span className="font-semibold text-slate-200">{info.label}</span>
                            </div>
                            <div className="mt-2 pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between">
                              <span>PM2.5: {item.pm25} µg/m³</span>
                              <span>PM10: {item.pm10} µg/m³</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  {/* CPCB Threshold Reference Lines */}
                  <ReferenceLine y={100} stroke="#65a30d" strokeDasharray="3 3" label={{ value: 'Satisfactory', position: 'insideTopRight', fill: '#65a30d', fontSize: 10 }} />
                  <ReferenceLine y={200} stroke="#eab308" strokeDasharray="3 3" label={{ value: 'Moderate', position: 'insideTopRight', fill: '#eab308', fontSize: 10 }} />
                  <ReferenceLine y={300} stroke="#f97316" strokeDasharray="3 3" label={{ value: 'Poor', position: 'insideTopRight', fill: '#f97316', fontSize: 10 }} />
                  <ReferenceLine y={400} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Very Poor / Severe', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }} />

                  {/* Vertical Forecast Start Marker */}
                  {data.historyAndForecast[nowIndex]?.timestamp && (
                    <ReferenceLine 
                      x={data.historyAndForecast[nowIndex].timestamp} 
                      stroke="#0f766e" 
                      strokeWidth={2}
                      label={{ value: 'NOW (Forecast Start)', position: 'insideTopLeft', fill: '#0f766e', fontSize: 11, fontWeight: 'bold' }} 
                    />
                  )}

                  {/* Uncertainty Band area */}
                  <Area
                    type="monotone"
                    dataKey="aqi"
                    fill="#0f766e"
                    fillOpacity={0.08}
                    stroke="none"
                  />

                  <Line
                    type="monotone"
                    dataKey="aqi"
                    stroke="#0f766e"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: '#0f766e', stroke: '#fff', strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Threshold Legend Bar */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Good (0-50)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-lime-500" /> Satisfactory (51-100)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-yellow-400" /> Moderate (101-200)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-orange-500" /> Poor (201-300)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-red-500" /> Very Poor (301-400)</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-rose-950" /> Severe (401-500)</span>
              </div>
            </div>
          </div>

          {/* Individual Pollutant Trends */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                  Individual Criteria Pollutant Dynamics
                </h3>
                <p className="text-[11px] text-slate-500">
                  Select a pollutant to inspect temporal variation across historical and forecast horizons.
                </p>
              </div>

              {/* Pollutant Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setSelectedPollutant('pm25')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    selectedPollutant === 'pm25' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  PM2.5 (µg/m³)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPollutant('pm10')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    selectedPollutant === 'pm10' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  PM10 (µg/m³)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPollutant('no2')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    selectedPollutant === 'no2' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  NO2 (µg/m³)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPollutant('o3')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    selectedPollutant === 'o3' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  O3 (µg/m³)
                </button>
              </div>
            </div>

            <div className="h-56 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={filteredHistoryAndForecast} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(val) => `${new Date(val).getHours()}:00`}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                    formatter={(val: any) => [`${val} µg/m³`, selectedPollutant.toUpperCase()]}
                    labelFormatter={(val) => formatISTDateTime(String(val))}
                  />
                  <Area
                    type="monotone"
                    dataKey={selectedPollutant}
                    fill={selectedPollutant === 'pm25' ? '#0f766e' : selectedPollutant === 'pm10' ? '#d97706' : selectedPollutant === 'no2' ? '#e11d48' : '#0284c7'}
                    fillOpacity={0.12}
                    stroke={selectedPollutant === 'pm25' ? '#0f766e' : selectedPollutant === 'pm10' ? '#d97706' : selectedPollutant === 'no2' ? '#e11d48' : '#0284c7'}
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): Station Comparison & Compact Map */}
        <div className="space-y-6">
          {/* Station Comparison Bar Chart */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Station AQI Comparison</h3>
                <p className="text-[11px] text-slate-500">Sorted from highest to lowest severity</p>
              </div>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                15 CAAQMS
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.stationComparisons.slice(0, 8)}
                  layout="vertical"
                  margin={{ top: 5, right: 15, left: 35, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 420]} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis 
                    type="category" 
                    dataKey="stationName" 
                    tick={{ fontSize: 10, fill: '#334155' }} 
                    width={85}
                    tickFormatter={(val) => val.split(' ')[0]}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                    formatter={(val: any) => [`${val} AQI`, 'Observed AQI']}
                  />
                  <Bar dataKey="aqi" radius={[0, 4, 4, 0]}>
                    {data.stationComparisons.slice(0, 8).map((entry) => {
                      const info = getAQICategoryInfo(entry.aqi);
                      return <Cell key={entry.stationId} fill={info.color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-2 text-[11px] text-slate-400 text-center">
              Click any station on the map below to switch primary focus.
            </div>
          </div>

          {/* Environmental Alerts Panel */}
          <AlertPanel alerts={data.alerts} />

          {/* Compact Delhi NCR Map */}
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
            <div className="flex items-center justify-between pb-2 mb-2">
              <h3 className="font-bold text-slate-900 text-sm">Delhi NCR Spatial Network</h3>
              <span className="text-[11px] text-teal-700 font-medium">Click station to select</span>
            </div>
            <DelhiNCRMap
              stations={stations}
              activeStationId={selectedStationId}
              onSelectStation={(id) => setSelectedStationId(id)}
              height="280px"
              showDetailsDrawer={false}
            />
          </div>
        </div>
      </div>

      {/* CPCB Rules Modal */}
      <CPCBExplanationModal
        isOpen={showCPCBModal}
        onClose={() => setShowCPCBModal(false)}
      />
    </div>
  );
};
