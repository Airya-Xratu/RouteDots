import { describe, expect, it } from 'vitest';
import {
  ROUTEDOTS_CONFIG_VERSION,
  RouteDotsConfigError,
  createRouteDotsConfig,
  parseRouteDotsConfig,
  stringifyRouteDotsConfig,
} from '../config.js';
import type { City } from '../types.js';

const LHR: City = {
  code: 'LHR',
  name: 'London',
  country: 'United Kingdom',
  lat: 51.507,
  lng: -0.128,
};
const DXB: City = {
  code: 'DXB',
  name: 'Dubai',
  country: 'United Arab Emirates',
  lat: 25.204,
  lng: 55.271,
};

const scene = {
  version: ROUTEDOTS_CONFIG_VERSION,
  name: 'showcase',
  route: { from: 'LHR', to: 'DXB', roundTrip: true },
  options: {
    theme: 'dark',
    world: 'flat',
    surface: 'dots',
    colors: { outbound: '#ff0066', globe: '#06121f' },
    view: { lat: 40, lng: 25, altitude: 1.9 },
    autoRotate: { enabled: false, speed: 0.2 },
    interactive: true,
    frameRoute: false,
    texture: { stepDeg: 3, dotSizeDeg: 0.5 },
    borders: { enabled: true, color: '#ffffff', opacity: 0.4, width: 1.5 },
    route: {
      outbound: { angle: 22, lift: 0.18, dash: { length: 0.04, gap: 0.02, speed: 2, width: 2.4 } },
      return: { angle: -30, dash: false },
      drawDurationMs: 800,
      pulse: false,
    },
    plane: {
      icon: { path: 'M0,-40 L18,26 L-18,26 Z', viewBox: 100 },
      size: 0.03,
      flightMs: 3200,
      pauseMs: 400,
      enabled: true,
    },
    cities: {
      enabled: true,
      periodMs: 1200,
      dot: { size: 0.008, dim: 0.2 },
      ripple: { size: 0.02, grow: 4, opacity: 0.8 },
      list: [LHR, DXB],
    },
    labels: {
      fontSize: 16,
      fontWeight: 500,
      letterSpacing: '0.08em',
      background: false,
      halo: false,
      fontFamily: 'ui-monospace, monospace',
    },
    airports: {
      size: 6,
      ring: false,
      source: { color: '#22c55e' },
      destination: { color: '#f97316', ringColor: '#f97316' },
    },
    camera3d: { enabled: true, tilt: 40, yaw: -12, depth: 90, perspective: 900, follow: true },
    fallback: { enabled: true },
  },
} as const;

describe('parseRouteDotsConfig', () => {
  it('reads a versioned document and keeps every portable option', () => {
    const parsed = parseRouteDotsConfig(JSON.stringify(scene));
    expect(parsed.kind).toBe('document');
    expect(parsed.version).toBe(1);
    expect(parsed.name).toBe('showcase');
    expect(parsed.routeSpecified).toBe(true);
    expect(parsed.route).toEqual({ from: 'LHR', to: 'DXB', roundTrip: true });
    expect(parsed.warnings).toEqual([]);
    expect(parsed.options).toEqual(scene.options);
  });

  it('round-trips through stringify with stable key order', () => {
    const parsed = parseRouteDotsConfig(scene);
    const text = stringifyRouteDotsConfig({
      version: 1,
      name: parsed.name,
      route: parsed.route,
      options: parsed.options,
    });
    expect(text.endsWith('\n')).toBe(true);
    expect(text.indexOf('"version"')).toBeLessThan(text.indexOf('"name"'));
    expect(text.indexOf('"route"')).toBeLessThan(text.indexOf('"options"'));
    expect(text.indexOf('"theme"')).toBeLessThan(text.indexOf('"camera3d"'));
    expect(parseRouteDotsConfig(text).options).toEqual(parsed.options);
  });

  it('accepts a bare options object as a merge payload', () => {
    const parsed = parseRouteDotsConfig({ theme: 'dark', colors: { plane: '#fff' } });
    expect(parsed.kind).toBe('options');
    expect(parsed.routeSpecified).toBe(false);
    expect(parsed.route).toBeNull();
    expect(parsed.options).toEqual({ theme: 'dark', colors: { plane: '#fff' } });
  });

  it('treats a hand-written { route: { from, to }, theme } as a document', () => {
    const parsed = parseRouteDotsConfig({
      theme: 'light',
      route: { from: 'thr', to: { lat: 25.2, lng: 55.3, name: 'Dubai' } },
    });
    expect(parsed.kind).toBe('document');
    expect(parsed.route).toEqual({
      from: 'THR',
      to: { lat: 25.2, lng: 55.3, name: 'Dubai' },
      roundTrip: false,
    });
    expect(parsed.options).toEqual({ theme: 'light' });
    expect(parsed.warnings).toEqual(['config version missing; assumed 1']);
  });

  it('strips a BOM and still parses', () => {
    const parsed = parseRouteDotsConfig(
      `\uFEFF${JSON.stringify({ version: 1, options: { world: 'globe' } })}`,
    );
    expect(parsed.options.world).toBe('globe');
  });

  it('drops unknown keys, functions and the land mask instead of throwing', () => {
    const parsed = parseRouteDotsConfig({
      version: 1,
      options: {
        theme: 'dark',
        land: { type: 'Topology' },
        mystery: true,
        plane: { size: 0.02, icon: { draw: () => undefined } },
        colors: { outbound: '#abc', madeUp: '#000' },
      },
    });
    expect(parsed.options).toEqual({
      theme: 'dark',
      colors: { outbound: '#abc' },
      plane: { size: 0.02 },
    });
    expect(parsed.warnings.join(' ')).toContain('land');
    expect(parsed.warnings.join(' ')).toContain('mystery');
    expect(parsed.warnings.join(' ')).toContain('plane.icon');
    expect(parsed.warnings.join(' ')).toContain('madeUp');
  });

  it('does not let a broken route clear the selection flag', () => {
    const parsed = parseRouteDotsConfig({ version: 1, options: {}, route: { from: 'LHR' } });
    expect(parsed.routeSpecified).toBe(false);
    expect(parsed.route).toBeNull();
    expect(parsed.warnings.join(' ')).toContain('route.to is required');
  });

  it('honours an explicit null route', () => {
    const parsed = parseRouteDotsConfig({ version: 1, route: null, options: {} });
    expect(parsed.routeSpecified).toBe(true);
    expect(parsed.route).toBeNull();
  });

  it('rejects an unsupported version, invalid JSON and non-objects', () => {
    expect(() => parseRouteDotsConfig({ version: 2, options: {} })).toThrow(RouteDotsConfigError);
    expect(() => parseRouteDotsConfig('{')).toThrow(/Invalid RouteDots config JSON/);
    expect(() => parseRouteDotsConfig('')).toThrow(/empty/);
    expect(() => parseRouteDotsConfig([])).toThrow(/JSON object/);
    expect(() => parseRouteDotsConfig(null)).toThrow(RouteDotsConfigError);
  });

  it('ignores prototype-pollution keys', () => {
    const parsed = parseRouteDotsConfig(
      '{"version":1,"options":{"__proto__":{"polluted":true},"theme":"dark"}}',
    );
    expect(parsed.options).toEqual({ theme: 'dark' });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('keeps a preset icon and a false dash / label background', () => {
    const parsed = parseRouteDotsConfig({
      version: 1,
      options: {
        plane: { icon: 'jet' },
        route: { return: { dash: false } },
        labels: { background: false, halo: false },
      },
    });
    expect(parsed.warnings).toEqual([]);
    expect(parsed.options.plane).toEqual({ icon: 'jet' });
    expect(parsed.options.route).toEqual({ return: { dash: false } });
    expect(parsed.options.labels).toEqual({ background: false, halo: false });
  });

  it('drops a bad city and keeps the rest of the marker list', () => {
    const parsed = parseRouteDotsConfig({
      version: 1,
      options: { cities: { list: [LHR, { code: 'NOPE' }, DXB] } },
    });
    expect(parsed.options.cities?.list).toEqual([LHR, DXB]);
    expect(parsed.warnings.join(' ')).toContain('list[1]');
  });
});

describe('createRouteDotsConfig', () => {
  it('exports known cities as IATA codes and omits non-portable values', () => {
    const { config, warnings } = createRouteDotsConfig(
      {
        theme: 'light',
        view: { lat: 40, lng: 25, altitude: 1.9 },
        autoRotate: { enabled: true, speed: 0.4 },
        plane: { icon: { draw: () => undefined } as never, flightMs: 4800 },
        land: { type: 'Topology' } as never,
      },
      { from: LHR, to: DXB, roundTrip: true },
      { name: 'RouteDots showcase' },
    );
    expect(config).toEqual({
      version: 1,
      name: 'RouteDots showcase',
      route: { from: 'LHR', to: 'DXB', roundTrip: true },
      options: {
        theme: 'light',
        view: { lat: 40, lng: 25, altitude: 1.9 },
        autoRotate: { enabled: true, speed: 0.4 },
        plane: { flightMs: 4800 },
      },
    });
    expect(warnings.join(' ')).toContain('plane.icon');
    expect(warnings.join(' ')).toContain('land');
    expect(parseRouteDotsConfig(stringifyRouteDotsConfig(config)).options.plane).toEqual({
      flightMs: 4800,
    });
  });

  it('keeps a custom endpoint as a point so it survives outside the bundled list', () => {
    const custom: City = {
      code: 'CUSTOM',
      name: 'Custom point',
      country: '',
      lat: 12.34,
      lng: 56.78,
    };
    const { config } = createRouteDotsConfig({}, { from: custom, to: DXB, roundTrip: false });
    expect(config.route).toEqual({
      from: { code: 'CUSTOM', name: 'Custom point', country: '', lat: 12.34, lng: 56.78 },
      to: 'DXB',
      roundTrip: false,
    });
    expect(config.route && 'from' in config.route).toBe(true);
  });

  it('writes route: null when the scene has no route', () => {
    const { config } = createRouteDotsConfig({ theme: 'dark' }, null);
    expect(config.route).toBeNull();
    expect(config.name).toBeUndefined();
  });
});
