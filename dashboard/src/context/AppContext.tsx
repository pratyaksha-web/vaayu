import React, { createContext, useContext, useState, useEffect } from 'react';
import { DELHI_NCR_STATIONS } from '../services/mockData';
import type { MonitoringStation, DataStatus } from '../types';
import { apiConfig } from '../services/api';

interface AppContextType {
  selectedStationId: string;
  setSelectedStationId: (id: string) => void;
  selectedStation: MonitoringStation;
  selectedRegion: string;
  setSelectedRegion: (region: string) => void;
  stations: MonitoringStation[];
  dataStatus: DataStatus;
  setDataStatus: (status: DataStatus) => void;
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  lastUpdated: string;
  currentTimeString: string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedStationId, setSelectedStationId] = useState<string>('alipur');
  const [selectedRegion, setSelectedRegion] = useState<string>('Delhi NCR');
  const [dataStatus, setDataStatus] = useState<DataStatus>('demo');
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [currentTimeString, setCurrentTimeString] = useState<string>('');

  const selectedStation = DELHI_NCR_STATIONS.find(s => s.id === selectedStationId) || DELHI_NCR_STATIONS[0];

  // Update clock every second in IST
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeString(
        now.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }) + ' IST'
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleDemoMode = () => {
    const nextVal = !isDemoMode;
    setIsDemoMode(nextVal);
    apiConfig.setDemoMode(nextVal);
    setDataStatus(nextVal ? 'demo' : 'live');
  };

  return (
    <AppContext.Provider
      value={{
        selectedStationId,
        setSelectedStationId,
        selectedStation,
        selectedRegion,
        setSelectedRegion,
        stations: DELHI_NCR_STATIONS,
        dataStatus,
        setDataStatus,
        isDemoMode,
        toggleDemoMode,
        lastUpdated: 'Today at 18:00 IST',
        currentTimeString,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
