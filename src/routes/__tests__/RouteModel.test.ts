import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ARC_RADIUS,
  DEFAULT_OUTBOUND_LIFT,
  DEFAULT_RETURN_LIFT,
  buildRoute,
} from '../RouteModel.js';
import type { LatLon } from '../../types.js';

describe('defaults', () => {
  it('use the thinner route tube', () => {
    expect(DEFAULT_ARC_RADIUS).toBe(0.0015);
  });
});

const LHR: LatLon = { lat: 51.507, lng: -0.128 };
const DXB: LatLon = { lat: 25.204, lng: 55.271 };

describe('buildRoute', () => {
  it('one-way: a single outbound arc', () => {
    const route = buildRoute(LHR, DXB, { roundTrip: false });
    expect(route.roundTrip).toBe(false);
    expect(route.singleEdge).toBe(false);
    expect(route.arcs).toHaveLength(1);
    expect(route.arcs[0]).toMatchObject({
      id: 'outbound',
      from: LHR,
      to: DXB,
      order: 0,
      lift: DEFAULT_OUTBOUND_LIFT,
    });
  });

  it('round trip (default): single shared edge', () => {
    const route = buildRoute(LHR, DXB, { roundTrip: true });
    expect(route.roundTrip).toBe(true);
    expect(route.singleEdge).toBe(true);
    expect(route.arcs).toHaveLength(1);
    const arc = route.arcs[0]!;
    expect(arc.id).toBe('roundtrip');
    expect(arc.from).toEqual(LHR);
    expect(arc.to).toEqual(DXB);
    expect(arc.order).toBe(0);
    expect(arc.lift).toBe(DEFAULT_OUTBOUND_LIFT);
  });

  it('round trip with dualEdge: two arcs with separated lifts and reversed endpoints', () => {
    const route = buildRoute(LHR, DXB, { roundTrip: true, dualEdge: true });
    expect(route.singleEdge).toBe(false);
    expect(route.arcs).toHaveLength(2);
    const [out, back] = route.arcs;
    expect(out?.id).toBe('outbound');
    expect(back?.id).toBe('return');
    expect(back?.from).toEqual(DXB);
    expect(back?.to).toEqual(LHR);
    expect(out?.order).toBe(0);
    expect(back?.order).toBe(1);
    // The two arcs must not conflict: visibly different lifts
    expect(back?.lift).not.toBe(out?.lift);
    expect(back?.lift ?? 0).toBeGreaterThan(out?.lift ?? 0);
    expect(DEFAULT_RETURN_LIFT).toBeGreaterThan(DEFAULT_OUTBOUND_LIFT);
  });

  it('honours custom lifts (dualEdge mode)', () => {
    const route = buildRoute(LHR, DXB, {
      roundTrip: true,
      dualEdge: true,
      outboundLift: 0.1,
      returnLift: 0.5,
    });
    expect(route.arcs[0]?.lift).toBe(0.1);
    expect(route.arcs[1]?.lift).toBe(0.5);
  });

  it('single-edge round trip uses outbound lift/angle', () => {
    const route = buildRoute(LHR, DXB, { roundTrip: true, outboundLift: 0.22 });
    expect(route.arcs).toHaveLength(1);
    expect(route.arcs[0]?.lift).toBe(0.22);
  });

  it('rejects (nearly) identical endpoints, including across the antimeridian', () => {
    expect(() => buildRoute(LHR, { lat: LHR.lat + 0.0001, lng: LHR.lng }, {})).toThrow(RangeError);
    expect(() => buildRoute({ lat: 0, lng: 179.999 }, { lat: 0, lng: -179.999 }, {})).toThrow(
      RangeError,
    );
  });
});
