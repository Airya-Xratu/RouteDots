import { describe, expect, it } from 'vitest';
import { CITIES, resolveCity } from '../cities.js';

describe('CITIES dataset', () => {
  it('has unique IATA codes and valid coordinates', () => {
    const codes = new Set(CITIES.map((c) => c.code));
    expect(codes.size).toBe(CITIES.length);
    expect(CITIES.length).toBeGreaterThanOrEqual(30);
    for (const city of CITIES) {
      expect(Math.abs(city.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(city.lng)).toBeLessThanOrEqual(180);
      expect(city.name.length).toBeGreaterThan(0);
      expect(city.country.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveCity', () => {
  it('resolves IATA codes case-insensitively', () => {
    expect(resolveCity('DXB')?.name).toBe('Dubai');
    expect(resolveCity('  lhr ')?.name).toBe('London');
    expect(resolveCity('tHr')?.name).toBe('Tehran');
  });

  it('returns null for unknown codes', () => {
    expect(resolveCity('XXX')).toBeNull();
    expect(resolveCity('')).toBeNull();
  });

  it('passes bare lat/lng through as a custom point', () => {
    const p = resolveCity({ lat: 10, lng: 20 })!;
    expect(p.code).toBe('CUSTOM');
    expect(p.lat).toBe(10);
    expect(p.lng).toBe(20);
  });

  it('snaps near-matching coordinates to the known city', () => {
    expect(resolveCity({ lat: 51.51, lng: -0.13 })?.code).toBe('LHR');
  });
});
