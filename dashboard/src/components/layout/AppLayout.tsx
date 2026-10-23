import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export const AppLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      <Header onToggleMobileMenu={() => setMobileMenuOpen(true)} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar 
          mobileOpen={mobileMenuOpen} 
          onCloseMobile={() => setMobileMenuOpen(false)} 
        />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto w-full">
          <Outlet />
        </main>
      </div>

      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>VAAYU (Air-Quality Atmospheric Intelligence System) • Delhi National Capital Region</span>
          <div className="flex items-center gap-4 text-[11px]">
            <span>CPCB Indian Air Quality Index Standard</span>
            <span>•</span>
            <span>OpenStreetMap & NASA FIRMS Data Attribution</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
