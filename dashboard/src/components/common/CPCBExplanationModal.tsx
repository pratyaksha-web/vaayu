import React from 'react';
import { X, BookOpen, AlertCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CPCBExplanationModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Official CPCB AQI Calculation Rules</h2>
              <p className="text-xs text-slate-500">Ministry of Environment, Forest and Climate Change (MoEFCC), India</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs text-slate-600 leading-relaxed">
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3.5 text-teal-900">
            <h4 className="font-semibold text-teal-950 mb-1 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-teal-700" />
              Not an Average of Pollutant Values
            </h4>
            <p className="text-[11px] leading-relaxed">
              Official Indian National Air Quality Index (NAQI) is <strong>NOT an arithmetic mean or sum</strong> of pollutant concentrations. Instead, individual sub-indices are calculated for each pollutant using specific mathematical breakpoints, and the <strong>overall AQI is the maximum (worst) sub-index</strong> among monitored pollutants.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 text-sm mb-2">Mandatory Data Sufficiency Criteria</h4>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>A minimum of <strong>three pollutants</strong> must be measured to calculate a valid official AQI.</li>
              <li>At least one of the measured pollutants must be a particulate fraction: <strong>PM2.5 or PM10</strong>.</li>
              <li>Averaging periods differ by pollutant: <strong>24-hour average</strong> for PM2.5, PM10, NO2, SO2, NH3, and Pb; <strong>8-hour average</strong> for CO and O3.</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 text-sm mb-2">Indian NAQI Breakpoints Matrix</h4>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-2">Category</th>
                    <th className="p-2">AQI Range</th>
                    <th className="p-2">PM2.5 (24h)</th>
                    <th className="p-2">PM10 (24h)</th>
                    <th className="p-2">NO2 (24h)</th>
                    <th className="p-2">O3 (8h)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-emerald-50/40">
                    <td className="p-2 font-medium text-emerald-800">Good</td>
                    <td className="p-2 font-mono">0 – 50</td>
                    <td className="p-2">0 – 30</td>
                    <td className="p-2">0 – 50</td>
                    <td className="p-2">0 – 40</td>
                    <td className="p-2">0 – 50</td>
                  </tr>
                  <tr className="bg-lime-50/40">
                    <td className="p-2 font-medium text-lime-800">Satisfactory</td>
                    <td className="p-2 font-mono">51 – 100</td>
                    <td className="p-2">31 – 60</td>
                    <td className="p-2">51 – 100</td>
                    <td className="p-2">41 – 80</td>
                    <td className="p-2">51 – 100</td>
                  </tr>
                  <tr className="bg-yellow-50/40">
                    <td className="p-2 font-medium text-yellow-800">Moderate</td>
                    <td className="p-2 font-mono">101 – 200</td>
                    <td className="p-2">61 – 90</td>
                    <td className="p-2">101 – 250</td>
                    <td className="p-2">81 – 180</td>
                    <td className="p-2">101 – 168</td>
                  </tr>
                  <tr className="bg-orange-50/40">
                    <td className="p-2 font-medium text-orange-800">Poor</td>
                    <td className="p-2 font-mono">201 – 300</td>
                    <td className="p-2">91 – 120</td>
                    <td className="p-2">251 – 350</td>
                    <td className="p-2">181 – 280</td>
                    <td className="p-2">169 – 208</td>
                  </tr>
                  <tr className="bg-red-50/40">
                    <td className="p-2 font-medium text-red-800">Very Poor</td>
                    <td className="p-2 font-mono">301 – 400</td>
                    <td className="p-2">121 – 250</td>
                    <td className="p-2">351 – 430</td>
                    <td className="p-2">281 – 400</td>
                    <td className="p-2">209 – 748</td>
                  </tr>
                  <tr className="bg-rose-100/50">
                    <td className="p-2 font-medium text-rose-950">Severe</td>
                    <td className="p-2 font-mono">401 – 500</td>
                    <td className="p-2">250+</td>
                    <td className="p-2">430+</td>
                    <td className="p-2">400+</td>
                    <td className="p-2">748+</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-slate-400 mt-1.5">
              * Units: PM2.5, PM10, NO2, O3 in µg/m³. Source: Central Pollution Control Board guidelines (2014/2015 revisions).
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-mono text-[11px]">Implemented in VAAYU Sub-Index Engine</span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
