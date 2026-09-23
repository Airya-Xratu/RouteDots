import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PALETTES } from '../../theme.js';
import { AIRPORT_DOT_RADIUS_GLOBE, resolveAirportsStyle } from '../airportStyle.js';
import { RouteLayer } from '../RouteLayer.js';

const LHR = { lat: 51.507, lng: -0.128 };
const DXB = { lat: 25.204, lng: 55.271 };

describe('resolveAirportsStyle — defaults keep the historical look', () => {
  const style = resolveAirportsStyle(PALETTES.light);

  it('uses the palette marker / ring colours at the historical size', () => {
    expect(style.source.color).toBe(PALETTES.light.marker);
    expect(style.destination.color).toBe(PALETTES.light.marker);
    expect(style.source.size).toBe(AIRPORT_DOT_RADIUS_GLOBE);
    expect(style.source.ringColor).toBe(PALETTES.light.ring);
    expect(style.source.ring).toBe(true);
    expect(style.destination.ring).toBe(true);
  });

  it('both endpoints read identically when nothing is set', () => {
    expect(style.source).toEqual(style.destination);
  });
});

describe('resolveAirportsStyle — shared + per-endpoint overrides', () => {
  it('shared keys apply to both endpoints', () => {
    const style = resolveAirportsStyle(PALETTES.light, {
      color: '#ffaa00',
      size: 0.01,
      ringColor: '#33ccff',
      ring: false,
    });
    for (const end of [style.source, style.destination]) {
      expect(end.color).toBe('#ffaa00');
      expect(end.size).toBe(0.01);
      expect(end.ringColor).toBe('#33ccff');
      expect(end.ring).toBe(false);
    }
  });

  it('per-endpoint keys win over the shared defaults', () => {
    const style = resolveAirportsStyle(PALETTES.light, {
      color: '#ffaa00',
      size: 0.01,
      source: { color: '#00cc88' },
      destination: { ring: false, size: 0.015 },
    });
    expect(style.source.color).toBe('#00cc88');
    expect(style.source.size).toBe(0.01); // inherited from the shared level
    expect(style.source.ring).toBe(true);
    expect(style.destination.color).toBe('#ffaa00'); // inherited
    expect(style.destination.size).toBe(0.015);
    expect(style.destination.ring).toBe(false);
  });

  it('can size for the flat world (map px) via defaultSize', () => {
    const style = resolveAirportsStyle(PALETTES.light, { size: 7 }, 5);
    expect(style.source.size).toBe(7);
    expect(resolveAirportsStyle(PALETTES.light, undefined, 5).source.size).toBe(5);
  });
});

describe('RouteLayer airports', () => {
  it('builds one marker per endpoint in the endpoint colours and sizes', () => {
    const layer = new RouteLayer(new THREE.Group(), {
      theme: 'light',
      pulse: false,
      airports: {
        source: { color: '#00cc88', size: 0.012 },
        destination: { color: '#ff0066' },
      },
    });
    layer.setRoute(LHR, DXB, false);

    const markers = layer.group.children.filter(
      (c): c is THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> =>
        c instanceof THREE.Mesh && c.geometry instanceof THREE.SphereGeometry,
    );
    expect(markers).toHaveLength(2);
    expect(markers[0]!.material.color.getHexString()).toBe('00cc88');
    expect(markers[0]!.geometry.parameters.radius).toBe(0.012);
    expect(markers[1]!.material.color.getHexString()).toBe('ff0066');
    expect(markers[1]!.geometry.parameters.radius).toBe(AIRPORT_DOT_RADIUS_GLOBE);
  });

  it('skips the pulse ring of an endpoint with ring: false', () => {
    const layer = new RouteLayer(new THREE.Group(), {
      theme: 'light',
      pulse: true,
      airports: { destination: { ring: false, ringColor: '#ff0066' } },
    });
    layer.setRoute(LHR, DXB, true);

    const rings = layer.group.children.filter(
      (c): c is THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> =>
        c instanceof THREE.Mesh && c.geometry instanceof THREE.RingGeometry,
    );
    // Two pulses per endpoint with a ring, none for the destination.
    expect(rings).toHaveLength(2);
    expect(rings.every((r) => r.material.color.getHexString() === '00a0ff')).toBe(false);
    expect(rings[0]!.material.color.getHexString()).toBe(PALETTES.light.ring.replace('#', ''));
  });

  it('re-resolves on applyStyle and rebuilds the markers', () => {
    const layer = new RouteLayer(new THREE.Group(), { theme: 'light' });
    layer.setRoute(LHR, DXB, false);
    layer.applyStyle({ airports: { source: { color: '#123456' } } });

    expect(layer.resolvedAirports.source.color).toBe('#123456');
    const markers = layer.group.children.filter(
      (c): c is THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> =>
        c instanceof THREE.Mesh && c.geometry instanceof THREE.SphereGeometry,
    );
    expect(markers[0]!.material.color.getHexString()).toBe('123456');
  });
});
