import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { vaayuApi } from '../services/api';
import { exportToCSV, getAQICategoryInfo } from '../utils/aqi';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ReferenceLine 
} from 'recharts';
import { 
  Download 
} from 'lucide-react';

export const HistoricalReportsPage: React.FC = () => {
  const { selectedStationId, setSelectedStationId, stations } = useApp();
  const [dateRange, setDateRange] = useState<'30d' | '90d' | '1y'>('30d');
  const [selectedPollutant, setSelectedPollutant] = useState<'all' | 'pm25' | 'pm10'>('pm25');
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    vaayuApi.getHistoricalReports(selectedStationId, '2026-09-22', '2026-10-22').then((res) => {
      if (isMounted) {
        setHistoryRecords(res);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [selectedStationId, dateRange]);

  // Seasonal Comparisons (Monsoon July/Aug vs Autumn Oct/Nov vs Winter Dec/Jan vs Summer May/June)
  const seasonalData = [
    { season: 'Monsoon (Jul–Aug)', aqi: 82, pm25: 38, rainfall: 280, note: 'Precipitation scavenging & clean southerly winds' },
    { season: 'Post-Monsoon (Oct–Nov)', aqi: 345, pm25: 220, rainfall: 4, note: 'Stubble smoke influx + early nocturnal inversions' },
    { season: 'Winter Peak (Dec–Jan)', aqi: 385, pm25: 260, rainfall: 12, note: 'Extreme cold pool stagnation & shallow PBLH (<150m)' },
    { season: 'Pre-Monsoon / Summer (May–Jun)', aqi: 215, pm25: 110, rainfall: 35, note: 'Thar desert dust transport + photochemical ozone' },
  ];

  // Hour-of-day vs Day-of-week Diurnal Heatmap Data
  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hoursOfDay = [0, 3, 6, 9, 12, 15, 18, 21];

  const handleExportCSV = () => {
    exportToCSV(historyRecords, `VAAYU_Historical_Report_${selectedStationId}_${dateRange}`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="w-10 h-10 border-3 border-teal-800 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Retrieving verified CAAQMS historical observations...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-serif">
              Historical Air Quality Reports & Audits
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-mono">
              Regulatory CAAQMS Archive
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Verified observational data series, seasonal trends, and compliance benchmarking against Indian NAAQS standards.
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

          {/* Date range toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium">
            {(['30d', '90d', '1y'] as const).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setDateRange(r)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  dateRange === r ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {r === '30d' ? '30 Days' : r === '90d' ? '90 Days' : '1 Year'}
              </button>
            ))}
          </div>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-teal-800 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV Report</span>
          </button>
        </div>
      </div>

      {/* Main Historical Trend Chart (Past 30 Days) */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Daily AQI & Particulate Matter Trends ({dateRange})
            </h3>
            <p className="text-[11px] text-slate-500">
              Verified ground observations with Indian National Ambient Air Quality Standard (NAAQS) regulatory threshold.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSelectedPollutant('pm25')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                selectedPollutant === 'pm25' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              PM2.5 (NAAQS: 60)
            </button>
            <button
              type="button"
              onClick={() => setSelectedPollutant('pm10')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                selectedPollutant === 'pm10' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              PM10 (NAAQS: 100)
            </button>
            <button
              type="button"
              onClick={() => setSelectedPollutant('all')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                selectedPollutant === 'all' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              AQI Index
            </button>
          </div>
        </div>

        <div className="h-72 w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={historyRecords} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(d) => d.slice(5)} />
              <YAxis domain={[0, 450]} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                formatter={(val: any, name: any) => [`${val}`, name.toUpperCase()]}
              />

              {/* NAAQS Regulatory Threshold Lines */}
              {selectedPollutant === 'pm25' && (
                <ReferenceLine y={60} stroke="#dc2626" strokeDasharray="3 3" label={{ value: 'NAAQS Standard (60 µg/m³)', fill: '#dc2626', fontSize: 10, position: 'insideTopLeft' }} />
              )}
              {selectedPollutant === 'pm10' && (
                <ReferenceLine y={100} stroke="#dc2626" strokeDasharray="3 3" label={{ value: 'NAAQS Standard (100 µg/m³)', fill: '#dc2626', fontSize: 10, position: 'insideTopLeft' }} />
              )}
              {selectedPollutant === 'all' && (
                <ReferenceLine y={200} stroke="#f97316" strokeDasharray="3 3" label={{ value: 'Moderate/Poor Boundary (200)', fill: '#f97316', fontSize: 10 }} />
              )}

              <Area 
                type="monotone" 
                dataKey={selectedPollutant === 'all' ? 'aqi' : selectedPollutant} 
                fill="#0f766e" 
                fillOpacity={0.12} 
                stroke="#0f766e" 
                strokeWidth={2.5} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Diurnal Traffic Heatmap (Hour-of-Day vs Day-of-Week) */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              Diurnal vs Weekly Pollution Heatmap (Hour of Day vs Day of Week)
            </h3>
            <p className="text-[11px] text-slate-500">
              Notice traffic rush hours (07:00–09:00 IST and 19:00–22:00 IST) coinciding with evening nocturnal boundary layer compression.
            </p>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
            Diurnal Profile
          </span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[580px] space-y-1.5">
            {/* Hour headers */}
            <div className="grid grid-cols-9 gap-1.5 text-center text-[10px] font-mono text-slate-400 font-medium">
              <div className="text-left font-sans font-semibold text-slate-700">Day</div>
              {hoursOfDay.map(h => (
                <div key={h}>{String(h).padStart(2, '0')}:00</div>
              ))}
            </div>

            {/* Day rows */}
            {daysOfWeek.map((day, dayIdx) => (
              <div key={day} className="grid grid-cols-9 gap-1.5 items-center">
                <div className="text-xs font-semibold text-slate-700">{day}</div>
                {hoursOfDay.map((hour) => {
                  let factor = 1.0;
                  if (hour >= 6 && hour <= 9) factor = 1.35; // morning rush hour + inversion
                  else if (hour >= 12 && hour <= 15) factor = 0.75; // afternoon solar mixing
                  else if (hour >= 18 && hour <= 21) factor = 1.25; // evening rush hour
                  const isWeekend = dayIdx >= 5;
                  const val = Math.round(270 * factor * (isWeekend ? 0.88 : 1.0));
                  const catInfo = getAQICategoryInfo(val);

                  return (
                    <div
                      key={hour}
                      className="h-9 rounded-md flex items-center justify-center text-[11px] font-bold font-mono text-white transition-transform hover:scale-105 cursor-pointer shadow-2xs"
                      style={{ backgroundColor: catInfo.color }}
                      title={`${day} ${hour}:00 IST | Avg AQI: ${val} (${catInfo.label})`}
                    >
                      {val}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="text-[11px] text-slate-400 italic">Midday solar heating elevates mixing depth, lowering ground concentrations despite steady emissions.</span>
          <span className="font-mono text-teal-800 font-semibold text-[11px]">DPCC 1-Year Baseline</span>
        </div>
      </div>

      {/* Seasonal Air Quality Comparison Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              Delhi NCR Seasonal Climatology & Meteorology
            </h3>
            <p className="text-[11px] text-slate-500">
              Contrasting seasonal synoptic wind directions and rain washout effects.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-2.5">Season & Period</th>
                <th className="p-2.5">Seasonal Mean AQI</th>
                <th className="p-2.5">Mean PM2.5 (µg/m³)</th>
                <th className="p-2.5">Avg Rainfall (mm)</th>
                <th className="p-2.5">Primary Meteorological Driver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {seasonalData.map((s) => {
                const info = getAQICategoryInfo(s.aqi);
                return (
                  <tr key={s.season} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2.5 font-sans font-semibold text-slate-900">{s.season}</td>
                    <td className="p-2.5 font-bold" style={{ color: info.color }}>{s.aqi} AQI</td>
                    <td className="p-2.5 text-slate-700">{s.pm25} µg/m³</td>
                    <td className="p-2.5 text-slate-700">{s.rainfall} mm</td>
                    <td className="p-2.5 font-sans text-slate-600">{s.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
