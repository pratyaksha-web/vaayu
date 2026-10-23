import React from 'react';
import { getAQICategoryInfo } from '../../utils/aqi';
import { ArrowUp, ArrowDown, HelpCircle, Activity } from 'lucide-react';

interface Props {
  aqi: number;
  isForecast?: boolean;
  timestamp?: string;
  stationName: string;
  change24h?: number;
  onExplainClick?: () => void;
}

export const AQICard: React.FC<Props> = ({
  aqi,
  isForecast = false,
  timestamp,
  stationName,
  change24h,
  onExplainClick,
}) => {
  const info = getAQICategoryInfo(aqi);

  // Percentage on 0-500 scale clamped to 100%
  const scalePercent = Math.min(100, Math.max(0, (aqi / 500) * 100));

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
      {/* Category Indicator Accent Strip */}
      <div 
        className="absolute top-0 left-0 right-0 h-1.5"
        style={{ backgroundColor: info.color }}
      />

      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isForecast ? 'Predicted Peak AQI (72h)' : 'Current Station AQI'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-slate-100 text-slate-600">
              {isForecast ? 'MODEL PREDICTION' : 'OBSERVED'}
            </span>
          </div>

          {onExplainClick && (
            <button
              type="button"
              onClick={onExplainClick}
              className="text-slate-400 hover:text-teal-700 flex items-center gap-1 text-xs transition-colors"
              title="How is CPCB AQI calculated?"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">CPCB Rules</span>
            </button>
          )}
        </div>

        {/* Big AQI Number and Category Pill */}
        <div className="mt-3 flex items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <span 
              className="text-4xl sm:text-5xl font-black font-serif tracking-tight"
              style={{ color: info.color }}
            >
              {aqi}
            </span>
            <span className="text-xs text-slate-400 font-medium">Index Points</span>
          </div>

          <div 
            className="px-3 py-1 rounded-full text-xs font-bold border tracking-wide shadow-2xs"
            style={{ 
              backgroundColor: info.bgColor, 
              color: info.textColor, 
              borderColor: info.borderColor 
            }}
          >
            {info.label}
          </div>
        </div>

        {/* Station and Advisory */}
        <p className="text-xs font-semibold text-slate-700 mt-2">
          {stationName}
        </p>
        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
          {info.healthAdvisory}
        </p>

        {/* 6-Level CPCB Scale Bar with Marker */}
        <div className="mt-4">
          <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
            <span>0 Good</span>
            <span>100</span>
            <span>200</span>
            <span>300</span>
            <span>400</span>
            <span>500 Severe</span>
          </div>
          
          <div className="h-2 rounded-full w-full bg-slate-100 relative overflow-hidden flex">
            <div className="w-[10%] h-full bg-emerald-500" title="Good (0-50)" />
            <div className="w-[10%] h-full bg-lime-500" title="Satisfactory (51-100)" />
            <div className="w-[20%] h-full bg-yellow-400" title="Moderate (101-200)" />
            <div className="w-[20%] h-full bg-orange-500" title="Poor (201-300)" />
            <div className="w-[20%] h-full bg-red-500" title="Very Poor (301-400)" />
            <div className="w-[20%] h-full bg-rose-950" title="Severe (401-500)" />
          </div>

          {/* Scale Pointer */}
          <div className="relative w-full h-2 mt-0.5">
            <div 
              className="absolute -top-1.5 -ml-1 w-2.5 h-2.5 rotate-45 border-2 border-white shadow-xs rounded-xs"
              style={{ 
                left: `${scalePercent}%`, 
                backgroundColor: info.color 
              }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1">
          <Activity className="w-3.5 h-3.5 text-slate-400" />
          <span>Primary: <strong className="text-slate-700 font-medium">PM2.5</strong></span>
          {change24h !== undefined && (
            <span className="ml-2 flex items-center">
              {change24h > 0 ? (
                <span className="text-rose-600 flex items-center font-medium">
                  <ArrowUp className="w-3 h-3 mr-0.5" />+{change24h} (24h)
                </span>
              ) : (
                <span className="text-emerald-600 flex items-center font-medium">
                  <ArrowDown className="w-3 h-3 mr-0.5" />{change24h} (24h)
                </span>
              )}
            </span>
          )}
        </div>

        {timestamp && <span className="font-mono text-[10px] text-slate-400">{timestamp}</span>}
      </div>
    </div>
  );
};
