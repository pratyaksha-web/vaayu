import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { vaayuApi } from '../services/api';
import type { FireDetection, PlumeTrajectoryPoint } from '../types';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { 
  Flame, 
  Wind, 
  Satellite, 
  ShieldAlert, 
  TrendingUp 
} from 'lucide-react';

// Custom Fire Icon generator
function createFireMarker(frp: number, confidence: string) {
  const size = Math.min(28, Math.max(14, Math.round(frp * 0.4) + 12));
  const color = confidence === 'high' ? '#dc2626' : confidence === 'nominal' ? '#ea580c' : '#ca8a04';

  const html = `
    <div style="transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center;">
      <div style="width: ${size}px; height: ${size}px; border-radius: 9999px; background-color: ${color}; opacity: 0.85; border: 2px solid #ffffff; box-shadow: 0 0 8px ${color}; animation: pulse 2s infinite;">
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-fire-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export const StubbleBurningTrackerPage: React.FC = () => {
  const { selectedStation } = useApp();
  const [detections, setDetections] = useState<FireDetection[]>([]);
  const [trajectory, setTrajectory] = useState<PlumeTrajectoryPoint[]>([]);
  const [selectedState, setSelectedState] = useState<string>('All');
  const [selectedConfidence, setSelectedConfidence] = useState<string>('All');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    vaayuApi.getFireData().then((res) => {
      if (isMounted) {
        setDetections(res.detections);
        setTrajectory(res.trajectory);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, []);

  // Filter fire detections
  const filteredFires = detections.filter(f => {
    if (selectedState !== 'All' && f.state !== selectedState) return false;
    if (selectedConfidence !== 'All' && f.confidence !== selectedConfidence) return false;
    return true;
  });

  // Daily fire trend vs PM2.5 enhancement data
  const trendData = [
    { date: '16 Oct', fires: 312, pm25: 145, fireContribution: 12 },
    { date: '17 Oct', fires: 480, pm25: 168, fireContribution: 16 },
    { date: '18 Oct', fires: 620, pm25: 195, fireContribution: 22 },
    { date: '19 Oct', fires: 890, pm25: 242, fireContribution: 28 },
    { date: '20 Oct', fires: 1240, pm25: 298, fireContribution: 34 },
    { date: '21 Oct', fires: 1560, pm25: 345, fireContribution: 39 },
    { date: '22 Oct', fires: 1420, pm25: 330, fireContribution: 36 },
  ];

  const trajectoryCoords: [number, number][] = trajectory.map(p => [p.latitude, p.longitude]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="w-10 h-10 border-3 border-teal-800 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Fetching NASA FIRMS VIIRS satellite thermal anomaly hotspots...</p>
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
              Agricultural Fire & Smoke Transport Tracker
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-800 border border-rose-200 font-mono">
              NASA FIRMS VIIRS 375m
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Tracking post-monsoon farm residue thermal anomalies across Punjab & Haryana with forward HYSPLIT smoke advection vectors.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs shadow-2xs">
            <span className="text-slate-400 font-medium">State:</span>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="All">All Regions</option>
              <option value="Punjab">Punjab</option>
              <option value="Haryana">Haryana</option>
              <option value="Uttar Pradesh">Western UP</option>
              <option value="Rajasthan">Rajasthan</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs shadow-2xs">
            <span className="text-slate-400 font-medium">Confidence:</span>
            <select
              value={selectedConfidence}
              onChange={(e) => setSelectedConfidence(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="All">All Confidences</option>
              <option value="high">High Confidence</option>
              <option value="nominal">Nominal Confidence</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase">Active Thermal Detections</div>
            <div className="text-xl font-black font-serif text-slate-900 mt-0.5">{filteredFires.length} Hotspots</div>
            <div className="text-[11px] text-slate-500">VIIRS Suomi-NPP & NOAA-20</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
            <Wind className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase">Transport Vector</div>
            <div className="text-xl font-bold font-serif text-slate-900 mt-0.5">NW 305° • 11 km/h</div>
            <div className="text-[11px] text-slate-500">Direct advection toward Delhi</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase">Estimated Fire PM2.5 Share</div>
            <div className="text-xl font-bold font-serif text-teal-800 mt-0.5">36% (±8%)</div>
            <div className="text-[11px] text-slate-500">Coupled SAFAR-style chemical tracer</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Satellite className="w-6 h-6 text-slate-600" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase">Satellite Overpass Time</div>
            <div className="text-sm font-bold text-slate-800 font-serif mt-0.5">13:42 IST (Daytime)</div>
            <div className="text-[11px] text-slate-500">Next pass: 01:50 IST (Night)</div>
          </div>
        </div>
      </div>

      {/* Interactive GIS Fire Map & Smoke Trajectory */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              Regional Satellite Fire Hotspots & HYSPLIT Plume Trajectory
            </h3>
            <p className="text-[11px] text-slate-500">
              Red markers represent thermal anomalies from NASA FIRMS. Dashed cyan line displays 48-hour forward boundary-layer transport path.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-600" /> High Confidence</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Nominal</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-teal-600 border-dashed" /> Forward Plume</span>
          </div>
        </div>

        <div className="h-[520px] rounded-xl overflow-hidden border border-slate-200">
          <MapContainer
            center={[29.80, 76.20]} // Centered between Punjab/Haryana and Delhi
            zoom={8}
            minZoom={6}
            maxZoom={12}
            className="w-full h-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Fire markers */}
            {filteredFires.map((fire) => (
              <Marker
                key={fire.id}
                position={[fire.latitude, fire.longitude]}
                icon={createFireMarker(fire.frp, String(fire.confidence))}
              >
                <Popup>
                  <div className="p-2.5 text-xs font-sans min-w-[200px]">
                    <div className="font-bold text-slate-900 text-sm flex items-center justify-between border-b pb-1 mb-1.5">
                      <span>Thermal Hotspot</span>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                        {fire.confidence}
                      </span>
                    </div>
                    <div className="space-y-1 text-slate-600">
                      <div>State: <strong>{fire.state}</strong></div>
                      <div>Fire Radiative Power: <strong>{fire.frp} MW</strong></div>
                      <div>Satellite / Instrument: <strong>{fire.satellite} ({fire.instrument})</strong></div>
                      <div>Acquired: {fire.acqDate} at {fire.acqTime} IST</div>
                      <div>Distance to Delhi NCR: <strong>{fire.distanceToDelhiKm} km</strong></div>
                      <div>Bearing to Delhi: <strong>{fire.bearingToDelhiDeg}°</strong></div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Forward Smoke Trajectory Line */}
            {trajectoryCoords.length > 0 && (
              <Polyline
                positions={trajectoryCoords}
                pathOptions={{
                  color: '#0f766e',
                  weight: 3.5,
                  dashArray: '6, 6',
                  opacity: 0.85,
                }}
              />
            )}

            {/* Target Destination: Delhi NCR */}
            <CircleMarker
              center={[28.6139, 77.2090]}
              radius={10}
              pathOptions={{
                color: '#0f172a',
                fillColor: '#0f766e',
                fillOpacity: 0.9,
                weight: 2,
              }}
            >
              <Popup>
                <div className="text-xs p-1 font-sans">
                  <strong>Delhi NCR Receptor Airshed</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">Selected Station: {selectedStation.name}</p>
                </div>
              </Popup>
            </CircleMarker>
          </MapContainer>
        </div>
      </div>

      {/* Visualizations: Fire Count vs PM2.5 Enhancement */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              Regional Fire Activity & Delhi PM2.5 Correlation (7-Day Episode)
            </h3>
            <p className="text-[11px] text-slate-500">
              Examining the 24-hour to 48-hour transport lag between peak burning and air quality degradation in the capital.
            </p>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-semibold border border-teal-200">
            Source-Receptor Analysis
          </span>
        </div>

        <div className="h-72 w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis yAxisId="fire" orientation="left" domain={[0, 2000]} unit=" pts" tick={{ fontSize: 10, fill: '#dc2626' }} />
              <YAxis yAxisId="pm" orientation="right" domain={[0, 420]} unit=" µg" tick={{ fontSize: 10, fill: '#0f766e' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                formatter={(val: any, name: any) => [
                  name === 'fires' ? `${val} Fires` : `${val} µg/m³`,
                  name === 'fires' ? 'Satellite Detections' : 'Delhi PM2.5'
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Bar yAxisId="fire" dataKey="fires" fill="#fca5a5" stroke="#ef4444" radius={[4, 4, 0, 0]} name="Satellite Fire Detections" />
              <Line yAxisId="pm" type="monotone" dataKey="pm25" stroke="#0f766e" strokeWidth={3} dot={{ r: 4 }} name="Delhi Observed PM2.5 (µg/m³)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Mandatory Scientific Disclaimer Banner */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-2">
        <div className="font-semibold text-slate-800 flex items-center gap-1.5 text-sm">
          <ShieldAlert className="w-4 h-4 text-teal-800" />
          <span>Scientific Disclaimer on Stubble Fire Attribution</span>
        </div>
        <p className="leading-relaxed text-[11px] text-slate-500">
          Satellite thermal anomalies detected by VIIRS/MODIS indicate high-temperature radiative surfaces (such as open agricultural fires, forest fires, or industrial brick kilns) but <strong>do not independently prove the chemical source</strong> of urban air pollution without coupled chemical transport modeling (CTM), backward trajectory calculations, and meteorological boundary layer height verification. Local emissions (vehicular exhaust, road dust, construction, and municipal solid waste burning) remain substantial baseline contributors to Delhi NCR pollution year-round.
        </p>
      </div>
    </div>
  );
};
