import type { AQICategory, AQICategoryInfo } from '../types';

export const CPCB_AQI_CATEGORIES: Record<AQICategory, AQICategoryInfo> = {
  'Good': {
    label: 'Good',
    min: 0,
    max: 50,
    color: '#16a34a', // green-600
    bgColor: '#f0fdf4', // green-50
    borderColor: '#bbf7d0', // green-200
    textColor: '#15803d',
    description: 'Minimal health impact',
    healthAdvisory: 'Air quality is considered satisfactory, and air pollution poses little or no risk.',
  },
  'Satisfactory': {
    label: 'Satisfactory',
    min: 51,
    max: 100,
    color: '#65a30d', // lime-600
    bgColor: '#f7fee7', // lime-50
    borderColor: '#d9f99d', // lime-200
    textColor: '#4d7c0f',
    description: 'Minor breathing discomfort to sensitive people',
    healthAdvisory: 'Acceptable air quality; moderate health concern for a very small number of individuals unusually sensitive to air pollution.',
  },
  'Moderate': {
    label: 'Moderate',
    min: 101,
    max: 200,
    color: '#eab308', // yellow-500
    bgColor: '#fefce8', // yellow-50
    borderColor: '#fef08a', // yellow-200
    textColor: '#a16207',
    description: 'Breathing discomfort to sensitive groups',
    healthAdvisory: 'People with respiratory or cardiac diseases, children and older adults should reduce prolonged outdoor exertion.',
  },
  'Poor': {
    label: 'Poor',
    min: 201,
    max: 300,
    color: '#f97316', // orange-500
    bgColor: '#fff7ed', // orange-50
    borderColor: '#fed7aa', // orange-200
    textColor: '#c2410c',
    description: 'Breathing discomfort to most people on prolonged exposure',
    healthAdvisory: 'Everyone may begin to experience health effects; members of sensitive groups may experience more serious health effects.',
  },
  'Very Poor': {
    label: 'Very Poor',
    min: 301,
    max: 400,
    color: '#ef4444', // red-500
    bgColor: '#fef2f2', // red-50
    borderColor: '#fecaca', // red-200
    textColor: '#b91c1c',
    description: 'Respiratory illness on prolonged exposure',
    healthAdvisory: 'Health alert: The risk of health effects is increased for everyone. Avoid strenuous outdoor activities.',
  },
  'Severe': {
    label: 'Severe',
    min: 401,
    max: 500,
    color: '#7f1d1d', // red-900 / maroon
    bgColor: '#fff1f2', // rose-50
    borderColor: '#fecdd3', // rose-200
    textColor: '#881337',
    description: 'Seriously impacts healthy individuals and those with existing conditions',
    healthAdvisory: 'Health warning of emergency conditions: Everyone is more likely to be affected. Keep indoor air clean and stay indoors.',
  },
};

export function getAQICategory(aqi: number): AQICategory {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Satisfactory';
  if (aqi <= 200) return 'Moderate';
  if (aqi <= 300) return 'Poor';
  if (aqi <= 400) return 'Very Poor';
  return 'Severe';
}

export function getAQICategoryInfo(categoryOrAQI: AQICategory | number): AQICategoryInfo {
  const category = typeof categoryOrAQI === 'number' 
    ? getAQICategory(categoryOrAQI) 
    : categoryOrAQI;
  return CPCB_AQI_CATEGORIES[category] || CPCB_AQI_CATEGORIES['Moderate'];
}

export function getWindDirectionText(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(((degrees % 360) / 22.5)) % 16;
  return directions[index];
}

export function formatISTDateTime(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }) + ' IST';
}

export function formatISTTimeOnly(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatISTDateOnly(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function exportToCSV(rows: Record<string, any>[], filename: string): void {
  if (!rows || rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(','),
    ...rows.map(row => 
      headers.map(header => {
        let val = row[header];
        if (val === null || val === undefined) val = '';
        const stringVal = String(val);
        if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
          return `"${stringVal.replace(/"/g, '""')}"`;
        }
        return stringVal;
      }).join(',')
    )
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
