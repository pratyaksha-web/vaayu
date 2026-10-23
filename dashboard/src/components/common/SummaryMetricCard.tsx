import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface Props {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  timestamp?: string;
  change?: number;
  changePeriod?: string;
  statusBadge?: React.ReactNode;
  icon?: React.ReactNode;
  highlightColor?: string;
}

export const SummaryMetricCard: React.FC<Props> = ({
  title,
  value,
  unit,
  subtitle,
  timestamp,
  change,
  changePeriod = '24h',
  statusBadge,
  icon,
  highlightColor,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between">
      {highlightColor && (
        <div 
          className="absolute top-0 left-0 right-0 h-1" 
          style={{ backgroundColor: highlightColor }} 
        />
      )}

      <div>
        <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5">
          <span className="font-medium truncate">{title}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {statusBadge}
            {icon && <span className="text-slate-400">{icon}</span>}
          </div>
        </div>

        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-serif">
            {value}
          </span>
          {unit && <span className="text-xs font-semibold text-slate-500">{unit}</span>}
        </div>

        {subtitle && (
          <p className="text-xs text-slate-500 mt-1 font-medium">{subtitle}</p>
        )}
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        {change !== undefined ? (
          <div className="flex items-center gap-1 font-medium">
            {change > 0 ? (
              <span className="text-rose-600 flex items-center">
                <ArrowUp className="w-3 h-3 mr-0.5" />+{change}
              </span>
            ) : change < 0 ? (
              <span className="text-emerald-600 flex items-center">
                <ArrowDown className="w-3 h-3 mr-0.5" />{change}
              </span>
            ) : (
              <span className="text-slate-500 flex items-center">
                <Minus className="w-3 h-3 mr-0.5" />0
              </span>
            )}
            <span className="text-slate-400">vs past {changePeriod}</span>
          </div>
        ) : (
          <span className="text-slate-400">Stable</span>
        )}

        {timestamp && <span className="font-mono text-[10px] text-slate-400">{timestamp}</span>}
      </div>
    </div>
  );
};
