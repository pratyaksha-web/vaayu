import React from 'react';
import { useApp } from '../../context/AppContext';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { Wind, Menu, MapPin, Clock, Radio } from 'lucide-react';

interface Props {
  onToggleMobileMenu: () => void;
}

export const Header: React.FC<Props> = ({ onToggleMobileMenu }) => {
  const { 
    selectedStationId, 
    setSelectedStationId, 
    selectedRegion, 
    setSelectedRegion, 
    stations, 
    dataStatus, 
    isDemoMode, 
    toggleDemoMode,
    lastUpdated,
    currentTimeString
  } = useApp();

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 lg:px-6 py-2.5 transition-all">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Mobile Toggle & Brand */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-800 flex items-center justify-center text-teal-200 shadow-sm border border-teal-700">
              <Wind className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-slate-900 tracking-tight font-serif">VAAYU</span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-teal-50 text-teal-700 rounded border border-teal-200">
                  AI-AQI 72H
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block leading-tight font-medium">
                Delhi NCR Air Quality & Atmospheric Inversion Forecasting
              </p>
            </div>
          </div>
        </div>

        {/* Center: Controls for Region and Station */}
        <div className="hidden md:flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
            <MapPin className="w-3.5 h-3.5 text-teal-700" />
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer"
              aria-label="Filter by Region"
            >
              <option value="Delhi NCR">Delhi NCR (All Sectors)</option>
              <option value="North Delhi">North Delhi</option>
              <option value="South Delhi">South Delhi</option>
              <option value="East Delhi & Noida">East Delhi & Noida</option>
              <option value="West Delhi & Gurugram">West Delhi & Gurugram</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-slate-400 font-medium">Station:</span>
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[140px] truncate"
              aria-label="Filter by Monitoring Station"
            >
              {stations.map(st => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.city})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Clock, Status Badge, Live toggle */}
        <div className="flex items-center gap-2.5">
          <div className="hidden xl:flex flex-col items-end text-right">
            <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{currentTimeString || 'Loading IST...'}</span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <span>{lastUpdated}</span>
              <span>•</span>
              <span className="text-teal-700 font-medium">Coupled WRF-Chem 72h</span>
            </div>
          </div>

          <DataStatusBadge 
            status={dataStatus} 
            sourceNote="DPCC/CPCB Continuous Ambient Air Quality Monitoring (CAAQMS)" 
          />

          <button
            type="button"
            onClick={toggleDemoMode}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
              isDemoMode 
                ? 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200' 
                : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 shadow-sm'
            }`}
            title="Toggle between demo dataset and live Python backend endpoint"
          >
            <Radio className={`w-3.5 h-3.5 ${isDemoMode ? 'text-slate-400' : 'text-emerald-600 animate-pulse'}`} />
            <span className="hidden sm:inline">{isDemoMode ? 'Mode: Demo' : 'Mode: Live API'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
