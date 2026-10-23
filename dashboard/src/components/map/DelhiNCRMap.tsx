import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { MonitoringStation } from '../../types';
import { getAQICategory, getAQICategoryInfo } from '../../utils/aqi';
import { X, ChevronRight } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';

interface Props {
  stations: MonitoringStation[];
  selectedVariable?: 'AQI' | 'PM2.5' | 'PM10' | 'O3' | 'NO2' | 'Temperature' | 'Wind';
  timeHourOffset?: number;
  onSelectStation?: (stationId: string) => void;
  activeStationId?: string;
  height?: string;
  showDetailsDrawer?: boolean;
}

// Function to generate dynamic Leaflet DivIcon with AQI or variable value
function createStationDivIcon(value: number, variable: string, isSelected: boolean) {
  let color = '#0f766e';
  let bgColor = '#f0fdf4';
  let textColor = '#15803d';

  if (variable === 'AQI' || variable === 'PM2.5' || variable === 'PM10') {
    const info = getAQICategoryInfo(value);
    color = info.color;
    bgColor = info.bgColor;
    textColor = info.textColor;
  } else if (variable === 'Temperature') {
    color = '#f97316';
    bgColor = '#fff7ed';
    textColor = '#c2410c';
  } else if (variable === 'Wind') {
    color = '#0284c7';
    bgColor = '#f0f9ff';
    textColor = '#0369a1';
  }

  const borderClass = isSelected ? 'border-2 border-slate-900 ring-3 ring-teal-400 scale-110 z-50' : 'border border-slate-300';

  const html = `
    <div style="transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center;">
      <div class="shadow-md rounded-full px-2 py-0.5 text-xs font-bold font-mono transition-transform ${borderClass}" 
           style="background-color: ${bgColor}; color: ${textColor}; border-color: ${color}; white-space: nowrap;">
        ${value}
      </div>
      <div style="width: 2px; height: 6px; background-color: ${color};"></div>
      <div style="width: 6px; height: 6px; border-radius: 9999px; background-color: ${color};"></div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-station-pin',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

// Component to dynamically re-center map if active station changes
const MapRecenter: React.FC<{ coords: [number, number] | null }> = ({ coords }) => {
  const map = useMap();
  React.useEffect(() => {
    if (coords) {
      map.flyTo(coords, Math.max(map.getZoom(), 11), { duration: 1.2 });
    }
  }, [coords, map]);
  return null;
};

export const DelhiNCRMap: React.FC<Props> = ({
  stations,
  selectedVariable = 'AQI',
  timeHourOffset = 0,
  onSelectStation,
  activeStationId,
  height = '540px',
  showDetailsDrawer = true,
}) => {
  const [inspectedStation, setInspectedStation] = useState<MonitoringStation | null>(null);

  // Compute values for each station based on hour offset
  const getStationValue = (st: MonitoringStation) => {
    let base = 285;
    if (st.id === 'anand_vihar') base = 375;
    else if (st.id === 'mundka') base = 360;
    else if (st.id === 'bawana') base = 350;
    else if (st.id === 'punjabi_bagh') base = 315;
    else if (st.id === 'ito') base = 310;
    else if (st.id === 'alipur') base = 305;
    else if (st.id === 'lodhi_road') base = 240;
    else if (st.id === 'aya_nagar') base = 235;

    // Temporal wave
    const wave = Math.sin((timeHourOffset + 6) * 0.26) * 35;
    const aqi = Math.round(base + wave);

    if (selectedVariable === 'AQI') return aqi;
    if (selectedVariable === 'PM2.5') return Math.round(aqi * 0.62);
    if (selectedVariable === 'PM10') return Math.round(aqi * 0.96);
    if (selectedVariable === 'O3') return Math.round(45 + Math.sin(timeHourOffset * 0.3) * 25);
    if (selectedVariable === 'NO2') return Math.round(70 + Math.sin(timeHourOffset * 0.4) * 22);
    if (selectedVariable === 'Temperature') return Number((22 + Math.sin(timeHourOffset * 0.26) * 6).toFixed(1));
    if (selectedVariable === 'Wind') return Number((6.5 + Math.sin(timeHourOffset * 0.2) * 3).toFixed(1));
    return aqi;
  };

  const activeStation = stations.find(s => s.id === (activeStationId || inspectedStation?.id));
  const activeCoords: [number, number] | null = activeStation ? [activeStation.latitude, activeStation.longitude] : null;

  // Generate mini forecast for inspected station
  const miniForecastData = React.useMemo(() => {
    if (!activeStation) return [];
    const base = getStationValue(activeStation);
    return Array.from({ length: 24 }).map((_, idx) => ({
      hour: `+${idx * 3}h`,
      aqi: Math.round(base + Math.sin((idx + 2) * 0.5) * 35),
    }));
  }, [activeStation, selectedVariable, timeHourOffset]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-200 shadow-xs bg-slate-100" style={{ height }}>
      {/* Top Map Source Badge */}
      <div className="absolute top-3 left-3 z-[400] bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-200/90 shadow-sm text-xs flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-semibold text-slate-800">Ground In-Situ Network</span>
        <span className="text-slate-400">|</span>
        <span className="text-slate-500 font-mono text-[11px]">DPCC / CPCB Stations (15 CAAQMS)</span>
      </div>

      {/* Map Container */}
      <MapContainer
        center={[28.6139, 77.2090]} // Delhi NCR Center
        zoom={10}
        minZoom={8}
        maxZoom={15}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapRecenter coords={activeCoords} />

        {stations.map((st) => {
          const val = getStationValue(st);
          const isSelected = activeStation?.id === st.id;
          const icon = createStationDivIcon(Number(val), selectedVariable, isSelected);

          return (
            <React.Fragment key={st.id}>
              {/* Optional slight halo for high pollution stations */}
              {selectedVariable === 'AQI' && val >= 300 && (
                <Circle
                  center={[st.latitude, st.longitude]}
                  radius={2800}
                  pathOptions={{
                    color: val >= 400 ? '#7f1d1d' : '#ef4444',
                    fillColor: val >= 400 ? '#7f1d1d' : '#ef4444',
                    fillOpacity: 0.12,
                    weight: 1,
                    dashArray: '4, 4',
                  }}
                />
              )}

              <Marker
                position={[st.latitude, st.longitude]}
                icon={icon}
                eventHandlers={{
                  click: () => {
                    setInspectedStation(st);
                    onSelectStation?.(st.id);
                  },
                }}
              >
                <Popup>
                  <div className="p-3 min-w-[210px] text-xs font-sans">
                    <div className="font-bold text-slate-900 text-sm border-b pb-1.5 mb-2 flex items-center justify-between">
                      <span>{st.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                        {st.agency}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-slate-600">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium">{selectedVariable}:</span>
                        <strong className="text-slate-900 font-mono text-sm">{val}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">City:</span>
                        <span>{st.city}, {st.state}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Coordinates:</span>
                        <span className="font-mono text-[10px]">{st.latitude.toFixed(3)}°N, {st.longitude.toFixed(3)}°E</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setInspectedStation(st);
                        onSelectStation?.(st.id);
                      }}
                      className="mt-3 w-full py-1.5 px-2 bg-teal-800 text-white rounded-md text-[11px] font-semibold hover:bg-teal-700 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>Inspect 72h Forecast</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}
      </MapContainer>

      {/* Floating Station Inspector Drawer / Card */}
      {showDetailsDrawer && activeStation && (
        <div className="absolute bottom-3 right-3 z-[400] w-80 sm:w-96 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 p-4 shadow-xl text-xs space-y-3 animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Selected Monitor:</span>
                <span className="font-bold text-slate-900 text-sm">{activeStation.name}</span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono">
                {activeStation.agency} CAAQMS • Elevation: {activeStation.elevationMeters}m
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInspectedStation(null)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              title="Close inspection drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Metric Summary Grid */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Predicted AQI</div>
              <div className="text-lg font-black text-slate-900 font-serif mt-0.5">
                {getStationValue(activeStation)}
              </div>
              <div className="text-[10px] font-medium text-amber-700">
                {getAQICategory(Number(getStationValue(activeStation)))}
              </div>
            </div>

            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Est. PM2.5</div>
              <div className="text-lg font-bold text-slate-800 font-serif mt-0.5">
                {Math.round(Number(getStationValue(activeStation)) * 0.62)}
              </div>
              <div className="text-[10px] text-slate-400">µg/m³</div>
            </div>

            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Surface Temp</div>
              <div className="text-lg font-bold text-slate-800 font-serif mt-0.5">
                22.8°
              </div>
              <div className="text-[10px] text-slate-400">Celsius</div>
            </div>
          </div>

          {/* Miniature 72-Hour Sparkline Forecast */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium mb-1">
              <span>72-Hour AQI Trajectory</span>
              <span className="font-mono text-[10px] text-teal-700">WRF-Chem Model</span>
            </div>
            <div className="h-16 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={miniForecastData}>
                  <Line 
                    type="monotone" 
                    dataKey="aqi" 
                    stroke="#0f766e" 
                    strokeWidth={2} 
                    dot={false} 
                  />
                  <XAxis dataKey="hour" hide />
                  <YAxis domain={['auto', 'auto']} hide />
                  <Tooltip 
                    contentStyle={{ fontSize: '10px', padding: '4px 8px', borderRadius: '6px' }}
                    formatter={(val: any) => [`${val} AQI`, 'Forecast']}
                    labelFormatter={(lbl) => `Offset: ${lbl}`}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span>Lat: {activeStation.latitude.toFixed(3)}°, Lon: {activeStation.longitude.toFixed(3)}°</span>
            <span className="text-teal-700 font-semibold font-mono">T+{timeHourOffset}h Forecast</span>
          </div>
        </div>
      )}
    </div>
  );
};
