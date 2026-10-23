import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AppLayout } from './components/layout/AppLayout';

// 7 Application Pages
import { OverviewPage } from './pages/OverviewPage';
import { ForecastPage } from './pages/ForecastPage';
import { PollutionMapPage } from './pages/PollutionMapPage';
import { WeatherAtmospherePage } from './pages/WeatherAtmospherePage';
import { StubbleBurningTrackerPage } from './pages/StubbleBurningTrackerPage';
import { ModelInsightsPage } from './pages/ModelInsightsPage';
import { HistoricalReportsPage } from './pages/HistoricalReportsPage';

export const App: React.FC = () => {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="forecast" element={<ForecastPage />} />
            <Route path="map" element={<PollutionMapPage />} />
            <Route path="weather" element={<WeatherAtmospherePage />} />
            <Route path="fires" element={<StubbleBurningTrackerPage />} />
            <Route path="models" element={<ModelInsightsPage />} />
            <Route path="reports" element={<HistoricalReportsPage />} />
            {/* Catch-all route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
};

export default App;
