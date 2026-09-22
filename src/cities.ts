/**
 * Default city dataset for route endpoints.
 *
 * Coordinates are city centres in decimal degrees. Add your own cities by
 * passing `{ code, name, country, lat, lng }` objects (or plain lat/lng) to
 * `RouteDots.setRoute` — or supply your own list via `RouteDots.CITIES`.
 */
import type { City } from './types.js';

export const CITIES: City[] = [
  // Iran
  { code: 'THR', name: 'Tehran', country: 'Iran', lat: 35.689, lng: 51.389 },
  { code: 'MHD', name: 'Mashhad', country: 'Iran', lat: 36.297, lng: 59.613 },
  { code: 'IFN', name: 'Isfahan', country: 'Iran', lat: 32.654, lng: 51.668 },
  { code: 'SYZ', name: 'Shiraz', country: 'Iran', lat: 29.592, lng: 52.584 },
  { code: 'TBZ', name: 'Tabriz', country: 'Iran', lat: 38.096, lng: 46.273 },
  // Middle East
  { code: 'DXB', name: 'Dubai', country: 'United Arab Emirates', lat: 25.204, lng: 55.271 },
  { code: 'AUH', name: 'Abu Dhabi', country: 'United Arab Emirates', lat: 24.454, lng: 54.377 },
  { code: 'DOH', name: 'Doha', country: 'Qatar', lat: 25.285, lng: 51.531 },
  { code: 'MCT', name: 'Muscat', country: 'Oman', lat: 23.588, lng: 58.383 },
  { code: 'IST', name: 'Istanbul', country: 'Türkiye', lat: 41.008, lng: 28.978 },
  { code: 'CAI', name: 'Cairo', country: 'Egypt', lat: 30.044, lng: 31.236 },
  // Europe
  { code: 'LHR', name: 'London', country: 'United Kingdom', lat: 51.507, lng: -0.128 },
  { code: 'CDG', name: 'Paris', country: 'France', lat: 48.857, lng: 2.352 },
  { code: 'FCO', name: 'Rome', country: 'Italy', lat: 41.902, lng: 12.496 },
  { code: 'BER', name: 'Berlin', country: 'Germany', lat: 52.52, lng: 13.405 },
  { code: 'AMS', name: 'Amsterdam', country: 'Netherlands', lat: 52.368, lng: 4.904 },
  { code: 'FRA', name: 'Frankfurt', country: 'Germany', lat: 50.11, lng: 8.682 },
  // Asia
  { code: 'BKK', name: 'Bangkok', country: 'Thailand', lat: 13.756, lng: 100.502 },
  { code: 'SIN', name: 'Singapore', country: 'Singapore', lat: 1.352, lng: 103.82 },
  { code: 'KUL', name: 'Kuala Lumpur', country: 'Malaysia', lat: 3.139, lng: 101.687 },
  { code: 'DEL', name: 'Delhi', country: 'India', lat: 28.613, lng: 77.209 },
  { code: 'HND', name: 'Tokyo', country: 'Japan', lat: 35.676, lng: 139.65 },
  { code: 'ICN', name: 'Seoul', country: 'South Korea', lat: 37.566, lng: 126.978 },
  { code: 'PEK', name: 'Beijing', country: 'China', lat: 39.904, lng: 116.407 },
  // Americas
  { code: 'JFK', name: 'New York', country: 'United States', lat: 40.713, lng: -74.006 },
  { code: 'LAX', name: 'Los Angeles', country: 'United States', lat: 34.052, lng: -118.244 },
  { code: 'MEX', name: 'Mexico City', country: 'Mexico', lat: 19.433, lng: -99.133 },
  { code: 'YYZ', name: 'Toronto', country: 'Canada', lat: 43.653, lng: -79.383 },
  { code: 'GRU', name: 'São Paulo', country: 'Brazil', lat: -23.55, lng: -46.633 },
  // Oceania
  { code: 'SYD', name: 'Sydney', country: 'Australia', lat: -33.869, lng: 151.209 },
  { code: 'AKL', name: 'Auckland', country: 'New Zealand', lat: -36.848, lng: 174.764 },
];

export type CityRef = string | City | { lat: number; lng: number };

/** Resolves a `CityRef` (IATA code, City, or bare lat/lng) to a City. */
export function resolveCity(ref: CityRef, cities: City[] = CITIES): City | null {
  if (typeof ref === 'string') {
    const code = ref.trim().toUpperCase();
    return cities.find((c) => c.code === code) ?? null;
  }
  if (Number.isFinite(ref.lat) && Number.isFinite(ref.lng) && Math.abs(ref.lat) <= 90) {
    const found = cities.find(
      (c) => Math.abs(c.lat - ref.lat) < 0.05 && Math.abs(c.lng - ref.lng) < 0.05,
    );
    return (
      found ?? {
        code: 'CUSTOM',
        name: 'Custom point',
        country: '',
        lat: ref.lat,
        lng: ref.lng,
      }
    );
  }
  return null;
}
