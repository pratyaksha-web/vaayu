import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Map as MapIcon, 
  CloudSun, 
  Flame, 
  Cpu, 
  FileText, 
  ShieldCheck,
  X
} from 'lucide-react';

interface Props {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
  badge?: string;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Overview', path: '/', icon: LayoutDashboard, description: 'Delhi NCR real-time status & summaries' },
  { name: 'AQI Forecast', path: '/forecast', icon: TrendingUp, badge: '72h', description: 'Hourly predictions & peak alerts' },
  { name: 'Pollution Map', path: '/map', icon: MapIcon, description: 'Interactive GIS station & plume layers' },
  { name: 'Weather & Atmosphere', path: '/weather', icon: CloudSun, description: 'Inversion layers & boundary height' },
  { name: 'Stubble-Burning Tracker', path: '/fires', icon: Flame, badge: 'VIIRS', description: 'Farm fires & smoke transport plumes' },
  { name: 'Model Insights', path: '/models', icon: Cpu, description: 'WRF-Chem validation & diagnostics' },
  { name: 'Historical Reports', path: '/reports', icon: FileText, description: 'Historical data analysis & CSV export' },
];

export const Sidebar: React.FC<Props> = ({ mobileOpen, onCloseMobile }) => {
  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-white border-r border-slate-200 flex flex-col transition-transform duration-250 ease-in-out lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Mobile Header Close */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between lg:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 font-serif">VAAYU</span>
            <span className="text-xs text-teal-700 bg-teal-50 px-2 py-0.5 rounded font-medium">Navigation</span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar Nav Header on Desktop */}
        <div className="p-4 border-b border-slate-100 hidden lg:block">
          <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Intelligence Modules
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const IconComponent = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  `flex items-start gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                    isActive
                      ? 'bg-teal-800 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <IconComponent
                      className={`w-5 h-5 shrink-0 mt-0.5 transition-colors ${
                        isActive ? 'text-teal-200' : 'text-slate-400 group-hover:text-slate-600'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="truncate">{item.name}</span>
                        {item.badge && (
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold ml-2 ${
                              isActive
                                ? 'bg-teal-900 text-teal-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-[11px] font-normal truncate mt-0.5 ${
                          isActive ? 'text-teal-100/90' : 'text-slate-400'
                        }`}
                      >
                        {item.description}
                      </p>
                    </div>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Model Transparency & Scientific Disclaimer Card */}
        <div className="p-3.5 m-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-2">
          <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
            <ShieldCheck className="w-4 h-4 text-teal-700" />
            <span>Scientific Transparency</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            All forecasts utilize CPCB 24-hour sub-index rules and coupled WRF-Chem atmospheric dispersion physics. Predictions are updated twice daily.
          </p>
          <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
            <span>CPCB Sub-Index Rules</span>
            <span className="font-mono text-teal-700 font-semibold">v2.1-Prod</span>
          </div>
        </div>
      </aside>
    </>
  );
};
