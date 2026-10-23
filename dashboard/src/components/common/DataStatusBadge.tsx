import React, { useState } from 'react';
import type { DataStatus } from '../../types';
import { Info, CheckCircle2, Clock, AlertTriangle, Database } from 'lucide-react';

interface Props {
  status: DataStatus;
  sourceNote?: string;
  size?: 'sm' | 'md';
}

export const DataStatusBadge: React.FC<Props> = ({ status, sourceNote, size = 'md' }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const getBadgeConfig = () => {
    switch (status) {
      case 'live':
        return {
          label: 'Live Telemetry',
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-300',
          dot: 'bg-emerald-500 animate-pulse',
          icon: CheckCircle2,
          description: 'Live sensor telemetry received within the last 60 minutes from CPCB/DPCC monitoring network.',
        };
      case 'historical':
        return {
          label: 'Historical Data',
          bg: 'bg-blue-50 text-blue-700 border-blue-300',
          dot: 'bg-blue-500',
          icon: Database,
          description: 'Archived regulatory monitoring observations verified by DPCC/CPCB QA/QC protocol.',
        };
      case 'delayed':
        return {
          label: 'Delayed Sync',
          bg: 'bg-amber-50 text-amber-700 border-amber-300',
          dot: 'bg-amber-500',
          icon: Clock,
          description: 'Observation sync delayed >2 hours due to station data logger transmission latency.',
        };
      case 'unavailable':
        return {
          label: 'Unavailable',
          bg: 'bg-rose-50 text-rose-700 border-rose-300',
          dot: 'bg-rose-500',
          icon: AlertTriangle,
          description: 'Sensor data is offline or pending hardware recalibration.',
        };
      case 'demo':
      default:
        return {
          label: 'Demo Dataset',
          bg: 'bg-slate-100 text-slate-700 border-slate-300',
          dot: 'bg-teal-600',
          icon: Info,
          description: 'Representative calibrated demo data modeled from authentic CPCB Delhi station observations and NASA FIRMS stubble fire records.',
        };
    }
  };

  const config = getBadgeConfig();
  const IconComponent = config.icon;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setShowTooltip(!showTooltip)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`inline-flex items-center gap-1.5 font-medium border rounded-full transition-colors cursor-pointer ${config.bg} ${
          size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
        }`}
        title="Click to view data provenance"
      >
        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
        <IconComponent className="w-3 h-3" />
        <span>{config.label}</span>
      </button>

      {showTooltip && (
        <div className="absolute right-0 top-full mt-1.5 w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-xl z-50 border border-slate-700 leading-relaxed animate-in fade-in zoom-in-95 duration-150">
          <div className="font-semibold text-slate-100 mb-1 flex items-center justify-between">
            <span>{config.label} Notice</span>
            <span className="text-[10px] text-teal-300 font-mono">PROVENANCE</span>
          </div>
          <p className="text-slate-300">{config.description}</p>
          {sourceNote && (
            <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400">
              <span className="font-medium text-slate-300">Source:</span> {sourceNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
