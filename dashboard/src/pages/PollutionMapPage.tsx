import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { DelhiNCRMap } from '../components/map/DelhiNCRMap';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Info, 
  Wind, 
  Compass
} from 'lucide-react';

type MapVariable = 'AQI' | 'PM2.5' | 'PM10' | 'O3' | 'NO2' | 'Temperature' | 'Wind';

export const PollutionMapPage: React.FC = () => {
  const { stations, selectedStationId, setSelectedStationId } = useApp();
  const [selectedVariable, setSelectedVariable] = useState<MapVariable>('AQI');
  const [timeOffsetHours, setTimeOffsetHours] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const playbackSpeed = 1000; // 1s per step

  // Auto playback loop
  useEffect(() => {
    let timer: any = null;
    if (isPlaying) {
      timer = setInterval(() => {
        setTimeOffsetHours(prev => {
          if (prev >= 72) {
            setIsPlaying(false);
            return 72;
          }
          return prev + 3;
        });
      }, playbackSpeed);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, playbackSpeed]);

  return (
    <div className="space-y-5 pb-12">
      {/* Top Controls Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-serif">
              Delhi NCR Atmospheric & Pollution Map
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-50 text-teal-800 border border-teal-200 font-mono">
              Leaflet GIS • 3km Grid
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Continuous ground telemetry from 15 CAAQMS monitors coupled with 72-hour spatial wind and particulate forecasts.
          </p>
        </div>

        {/* Spatial Layer Selector */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl self-start md:self-auto overflow-x-auto max-w-full">
          {(['AQI', 'PM2.5', 'PM10', 'NO2', 'O3', 'Temperature', 'Wind'] as MapVariable[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setSelectedVariable(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                selectedVariable === v
                  ? 'bg-teal-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Time Animation & Playback Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2.5 rounded-lg bg-teal-800 text-white hover:bg-teal-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              title={isPlaying ? 'Pause playback' : 'Play 72h forecast animation'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              <span>{isPlaying ? 'Pause' : 'Play 72h'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setTimeOffsetHours(0);
              }}
              className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              title="Reset to current observation (T+0h)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="text-xs">
              <span className="font-semibold text-slate-900 font-mono text-sm">
                T+{timeOffsetHours}h
              </span>
              <span className="text-slate-400 ml-2">
                {timeOffsetHours === 0 ? '(Current Observations)' : `(Forecast +${timeOffsetHours} Hours Ahead)`}
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-500 font-mono">
            Forecast Step: <strong className="text-slate-800">3-Hour Synoptic Intervals</strong>
          </div>
        </div>

        {/* Range Slider */}
        <div className="mt-3">
          <input
            type="range"
            min="0"
            max="72"
            step="3"
            value={timeOffsetHours}
            onChange={(e) => {
              setIsPlaying(false);
              setTimeOffsetHours(Number(e.target.value));
            }}
            className="w-full accent-teal-800 cursor-pointer h-2 bg-slate-200 rounded-lg"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
            <span>T+0h (Now)</span>
            <span>T+12h</span>
            <span>T+24h (Day 1)</span>
            <span>T+36h</span>
            <span>T+48h (Day 2)</span>
            <span>T+60h</span>
            <span>T+72h (Day 3)</span>
          </div>
        </div>
      </div>

      {/* Interactive Map Component */}
      <div className="relative">
        <DelhiNCRMap
          stations={stations}
          selectedVariable={selectedVariable}
          timeHourOffset={timeOffsetHours}
          activeStationId={selectedStationId}
          onSelectStation={(id) => setSelectedStationId(id)}
          height="640px"
          showDetailsDrawer={true}
        />
      </div>

      {/* Layer Metadata & Scientific Provenance Legend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5">
          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-teal-700" />
            <span>Spatial Coverage & Resolution</span>
          </div>
          <p className="text-slate-500 leading-relaxed text-[11px]">
            Delhi NCT (11 DPCC/IMD stations), Noida (UPPCB), Ghaziabad (UPPCB), Gurugram (HSPCB), and Faridabad (HSPCB). Atmospheric fields are simulated on a 3km nested WRF grid.
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5">
          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
            <Wind className="w-4 h-4 text-sky-600" />
            <span>Wind Advection & Plume Vector</span>
          </div>
          <p className="text-slate-500 leading-relaxed text-[11px]">
            North-westerly winds (290°–320°) transport regional stubble emissions through the Punjab-Haryana corridor directly across northern and trans-Yamuna airsheds.
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5">
          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-slate-600" />
            <span>Map Layers Transparency Note</span>
          </div>
          <p className="text-slate-500 leading-relaxed text-[11px]">
            Station values represent true CAAQMS ground monitors. Regional shading represents deterministic WRF-Chem atmospheric simulation rather than unvalidated mathematical interpolation.
          </p>
        </div>
      </div>
    </div>
  );
};
