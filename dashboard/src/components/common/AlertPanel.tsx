import React, { useState } from 'react';
import type { AlertRecord } from '../../types';
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, MapPin, ShieldAlert } from 'lucide-react';
import { formatISTDateTime } from '../../utils/aqi';

interface Props {
  alerts: AlertRecord[];
}

export const AlertPanel: React.FC<Props> = ({ alerts }) => {
  const [expandedId, setExpandedId] = useState<string | null>(alerts[0]?.id || null);

  const getSeverityStyle = (severity: AlertRecord['severity']) => {
    switch (severity) {
      case 'critical':
        return {
          border: 'border-rose-200 bg-rose-50/70 text-rose-900',
          badge: 'bg-rose-100 text-rose-800 border-rose-300',
          icon: ShieldAlert,
          iconColor: 'text-rose-600',
        };
      case 'warning':
        return {
          border: 'border-amber-200 bg-amber-50/70 text-amber-900',
          badge: 'bg-amber-100 text-amber-800 border-amber-300',
          icon: AlertTriangle,
          iconColor: 'text-amber-600',
        };
      case 'info':
      default:
        return {
          border: 'border-teal-200 bg-teal-50/70 text-teal-900',
          badge: 'bg-teal-100 text-teal-800 border-teal-300',
          icon: Info,
          iconColor: 'text-teal-600',
        };
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Environmental & Atmospheric Alerts</h3>
            <p className="text-[11px] text-slate-500">Active meteorological triggers & forecast anomalies</p>
          </div>
        </div>

        <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
          {alerts.length} Active Alerts
        </span>
      </div>

      <div className="space-y-2.5">
        {alerts.map((alert) => {
          const style = getSeverityStyle(alert.severity);
          const Icon = style.icon;
          const isExpanded = expandedId === alert.id;

          return (
            <div
              key={alert.id}
              className={`rounded-lg border transition-all text-xs ${style.border}`}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                className="w-full text-left p-3 flex items-start justify-between gap-3 cursor-pointer"
              >
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${style.iconColor}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 truncate">{alert.title}</span>
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded border ${style.badge}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Issued: {formatISTDateTime(alert.issuedAt)}
                    </div>
                  </div>
                </div>

                <div className="text-slate-400 hover:text-slate-700 pt-0.5">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-200/60 text-slate-700 space-y-2">
                  <p className="leading-relaxed text-xs">{alert.message}</p>
                  
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-slate-500">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>Impacted: <strong className="text-slate-800">{alert.affectedAreas.join(', ')}</strong></span>
                    </div>
                    <div>
                      <span className="text-slate-400">Source:</span> <span className="font-medium text-slate-700">{alert.source}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
