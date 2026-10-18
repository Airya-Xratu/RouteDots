/**
 * RouteLayer — renders the flight route on top of the globe:
 *
 * - one tube per arc. One-way routes use a single outbound tube; round
 *   trips share **one edge** (single tube) by default, with the dashes
 *   reversing direction as the plane flies back, and a growing trail
 *   behind the plane. Pass `dualEdge: true` in `route` to get the
 *   historical two-tube look with different lifts per leg.
 * - a draw-on animation (origin → destination) with a stagger for dual-edge
 *   returns,
 * - flowing dashes whose direction matches the plane's heading, fully
 *   customisable per path (colour, length, gap, width, speed),
 * - endpoint markers with a one-shot pulse ring when a route is set.
 *
 * The layer is driven by the renderer's frame loop via `update(time)`,
 * and by the plane layer via `setFlightState(...)` so the dash direction
 * and trail mask track the plane's position.
 */
import * as THREE from 'three';
import { latLngToVec } from '../core/greatCircle.js';
import { LAYER_RADIUS } from '../globe/layerRadii.js';
import { PALETTES, paletteToRouteTheme, resolvePalette, type RouteDotsColors } from '../theme.js';
import type { LatLon } from '../types.js';
import { buildRoute, type RouteArcSpec, type RouteSpec } from './RouteModel.js';
import { GreatCircleCurve } from './GreatCircleCurve.js';
import { ROUTE_FRAGMENT, ROUTE_VERTEX } from './routeShader.js';
import {
  resolveAirportsStyle,
  type AirportsStyleOptions,
  type ResolvedAirportEndpoint,
  type ResolvedAirportsStyle,
} from './airportStyle.js';
import {
  dashUniforms,
  globeTubeRadius,
  resolveRouteStyle,
  type ResolvedPathStyle,
  type ResolvedRouteStyle,
  type RouteStyleOptions,
} from './routeStyle.js';
import type { FlightLeg } from './PlaneScheduler.js';

export interface RouteLayerTheme {
  outbound: { color: string; opacity: number };
  return: { color: string; opacity: number };
  marker: string;
  ring: string;
}

/** Theme tables, derived from the RouteDots palette. */
export const ROUTE_THEMES: Record<'light' | 'dark', RouteLayerTheme> = {
  light: paletteToRouteTheme(PALETTES.light),
  dark: paletteToRouteTheme(PALETTES.dark),
};

/** Everything the route layer needs: styling plus theme/colour overrides. */
export interface RouteLayerOptions extends RouteStyleOptions {
  theme?: 'light' | 'dark';
  /** Palette overrides — the same object as the `colors` option. */
  colors?: RouteDotsColors;
  /** Source / destination airport styling (markers, pulse rings). */
  airports?: AirportsStyleOptions;
  /** Pre-resolved styles (skips resolving `route` options again). */
  style?: ResolvedRouteStyle;
  /**
   * Use two separate tubes (outbound + return) for round trips instead of
   * the default single shared edge. Mirrors {@link BuildRouteOptions.dualEdge}.
   */
  dualEdge?: boolean;
}

interface ArcObject {
  spec: RouteArcSpec;
  style: ResolvedPathStyle;
  mesh: THREE.Mesh<THREE.TubeGeometry, THREE.ShaderMaterial>;
}

interface Pulse {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  start: number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class RouteLayer {
  readonly group: THREE.Group;

  private options: RouteLayerOptions;
  private style: ResolvedRouteStyle;
  private theme: RouteLayerTheme;
  private airports: ResolvedAirportsStyle;

  private arcs: ArcObject[] = [];
  private markers: THREE.Object3D[] = [];
  private pulses: Pulse[] = [];
  private drawStart: number | null = null;
  private route: RouteSpec | null = null;
  private lastRoute: { origin: LatLon; dest: LatLon; roundTrip: boolean; dualEdge?: boolean } | null =
    null;
  private lastTime: number | null = null;
  private onDrawnCallback: (() => void) | null = null;
  /** Plane state for trail/direction (single-edge round trips). */
  private flightLeg: FlightLeg = 'outbound';
  private flightT: number = 1;

  constructor(parent: THREE.Object3D, options: RouteLayerOptions = {}) {
    const theme = options.theme ?? 'light';
    this.theme = ROUTE_THEMES[theme];
    this.options = { ...options, theme };
    const palette = resolvePalette(theme, options.colors);
    this.style = options.style ?? resolveRouteStyle(theme, options, options.colors);
    this.airports = resolveAirportsStyle(palette, options.airports);
    this.group = new THREE.Group();
    parent.add(this.group);
  }

  get currentRoute(): RouteSpec | null {
    return this.route ? { ...this.route } : null;
  }

  /** The resolved style currently in use (colours, lifts, angles, dashes). */
  get resolvedStyle(): ResolvedRouteStyle {
    return this.style;
  }

  /** The resolved source / destination airport styles in use. */
  get resolvedAirports(): ResolvedAirportsStyle {
    return this.airports;
  }

  /** Called once the route has fully drawn (both arcs). */
  onDrawn(callback: () => void): void {
    this.onDrawnCallback = callback;
  }

  /**
   * Notifies the layer about the plane's current leg/progress so the trail
   * visibility and dash direction stay in sync. No-op for dual-edge round
   * trips (each tube carries its own constant direction).
   */
  setFlightState(leg: FlightLeg, t: number): void {
    this.flightLeg = leg;
    this.flightT = Math.min(1, Math.max(0, t));
  }

  /** Sets a new route, replacing the previous one. */
  setRoute(origin: LatLon, dest: LatLon, roundTrip = false): RouteSpec {
    const dualEdge = this.options.dualEdge === true;
    const spec = buildRoute(origin, dest, {
      roundTrip,
      dualEdge,
      outboundLift: this.style.outbound.lift,
      returnLift: this.style.return.lift,
      outboundAngle: this.style.outbound.angle,
      returnAngle: this.style.return.angle,
    });
    this.clearArcs();
    this.route = spec;
    this.lastRoute = { origin, dest, roundTrip, dualEdge };
    this.drawStart = null;
    this.lastTime = null;
    this.flightLeg = 'outbound';
    this.flightT = 0;

    for (const arcSpec of spec.arcs) {
      this.arcs.push(this.buildArc(arcSpec, this.styleFor(arcSpec), 0));
    }
    this.buildMarkers(origin, dest);
    if (this.style.pulse) this.spawnPulses(origin, dest);
    return spec;
  }

  /**
   * Restyles the layer in place (theme switch, colour pickers, dash sliders…).
   *
   * The current route is rebuilt with the new geometry, and every arc keeps
   * the draw-on progress it had, so live styling never re-plays the animation.
   */
  applyStyle(options: Partial<RouteLayerOptions>): ResolvedRouteStyle {
    const theme = options.theme ?? this.options.theme ?? 'light';
    const merged: RouteLayerOptions = { ...this.options, ...options, theme };
    this.options = merged;
    this.theme = paletteToRouteTheme(resolvePalette(theme, merged.colors));
    this.style = merged.style ?? resolveRouteStyle(theme, merged, merged.colors);
    this.airports = resolveAirportsStyle(resolvePalette(theme, merged.colors), merged.airports);

    if (this.lastRoute) {
      const progress = this.arcs.map((arc) => arcProgress(arc));
      const pulses = this.pulses.length > 0 && this.style.pulse;
      const dualEdge = merged.dualEdge === true;
      const spec = buildRoute(this.lastRoute.origin, this.lastRoute.dest, {
        roundTrip: this.lastRoute.roundTrip,
        dualEdge,
        outboundLift: this.style.outbound.lift,
        returnLift: this.style.return.lift,
        outboundAngle: this.style.outbound.angle,
        returnAngle: this.style.return.angle,
      });
      this.clearArcs();
      this.route = spec;
      for (const [index, arcSpec] of spec.arcs.entries()) {
        this.arcs.push(this.buildArc(arcSpec, this.styleFor(arcSpec), progress[index] ?? 0));
      }
      this.buildMarkers(this.lastRoute.origin, this.lastRoute.dest);
      if (pulses) this.spawnPulses(this.lastRoute.origin, this.lastRoute.dest);
    }
    return this.style;
  }

  /** Advances all animations. `time` is the frame timestamp (ms). */
  update(time: number): void {
    if (this.drawStart === null) {
      if (this.lastTime === null) this.drawStart = time;
      this.lastTime = time;
      return;
    }
    this.lastTime = time;
    const elapsed = time - this.drawStart;
    let allDone = true;

    for (const arc of this.arcs) {
      const delay = arc.spec.order * this.style.staggerMs;
      const local = elapsed - delay;
      const t = local <= 0 ? 0 : Math.min(1, local / this.style.drawDurationMs);
      const uniforms = arc.mesh.material.uniforms;
      if (uniforms.uProgress && uniforms.uTime) {
        uniforms.uProgress.value = easeOutCubic(t);
        uniforms.uTime.value = time / 1000;
      }
      // Single-edge round trip: push flight direction/trail into the shader.
      if (arc.spec.id === 'roundtrip' && uniforms.uDirection && uniforms.uTrail) {
        const dir = this.flightLeg === 'return' ? -1 : 1;
        // Don't apply the trail mask until after the initial draw-on finishes
        // (the draw edge handles reveal while the line is being drawn).
        const trail = t < 1 ? 1 : this.flightT;
        uniforms.uDirection.value = dir;
        uniforms.uTrail.value = trail;
      }
      if (t < 1) allDone = false;
      arc.mesh.visible = t > 0;
    }

    for (const pulse of this.pulses) {
      const t = (time - pulse.start) / 1500;
      if (t >= 1) {
        pulse.mesh.visible = false;
        continue;
      }
      const s = 1 + t * 4.5;
      pulse.mesh.scale.setScalar(s);
      (pulse.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
    }

    if (allDone && this.arcs.length > 0) {
      const cb = this.onDrawnCallback;
      this.onDrawnCallback = null;
      cb?.();
    }
  }

  /** Removes the current route (arcs, markers, pulses). */
  clear(): void {
    this.clearArcs();
    this.route = null;
    this.lastRoute = null;
    this.onDrawnCallback = null;
    this.flightLeg = 'outbound';
    this.flightT = 1;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }

  private styleFor(spec: RouteArcSpec): ResolvedPathStyle {
    // Roundtrip arc shares the outbound style; dual-edge return arcs use
    // the return style.
    return spec.id === 'return' ? this.style.return : this.style.outbound;
  }

  private buildArc(spec: RouteArcSpec, style: ResolvedPathStyle, progress = 0): ArcObject {
    const curve = new GreatCircleCurve(spec.from, spec.to, spec.lift, spec.angle);
    const geometry = new THREE.TubeGeometry(curve, 128, globeTubeRadius(style.width), 8, false);
    // Arc length in globe radii: a world-unit dash pattern is measured
    // against it, so a long haul and a short hop carry the same dashes.
    const arcLength = curve.getLength();
    const dash = style.dash ? dashUniforms(style.dash, arcLength) : null;
    const uniforms: Record<string, THREE.IUniform> = {
      uColor: { value: new THREE.Color(style.dash?.color ?? style.color) },
      uOpacity: { value: style.opacity },
      uProgress: { value: progress },
      uTime: { value: 0 },
      uDashCount: { value: dash?.dashCount ?? 1 },
      uDashSolid: { value: dash?.dashSolid ?? 1 },
      uFlow: { value: dash?.flow ?? 0 },
      uDirection: { value: 1 },
      uTrail: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader: ROUTE_VERTEX,
      fragmentShader: ROUTE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = progress > 0;
    // Depth-independent painter layering: roundtrip/outbound at order 1,
    // dual-edge return draws above at 2, pulses (3), plane (4).
    mesh.renderOrder = 1 + (spec.id === 'return' ? 1 : 0);
    this.group.add(mesh);
    return { spec, style, mesh };
  }

  private buildMarkers(origin: LatLon, dest: LatLon): void {
    const endpoints: { point: LatLon; style: ResolvedAirportEndpoint }[] = [
      { point: origin, style: this.airports.source },
      { point: dest, style: this.airports.destination },
    ];
    for (const { point, style } of endpoints) {
      const geometry = new THREE.SphereGeometry(style.size, 16, 16);
      const material = new THREE.MeshBasicMaterial({ color: style.color });
      const marker = new THREE.Mesh(geometry, material);
      const v = latLngToVec(point.lat, point.lng, LAYER_RADIUS.markers);
      marker.position.set(v[0], v[1], v[2]);
      this.group.add(marker);
      this.markers.push(marker);
    }
  }

  private spawnPulses(origin: LatLon, dest: LatLon): void {
    const now = this.lastTime ?? performance.now();
    const geometry = new THREE.RingGeometry(0.008, 0.0105, 32);
    const endpoints: { point: LatLon; style: ResolvedAirportEndpoint }[] = [
      { point: origin, style: this.airports.source },
      { point: dest, style: this.airports.destination },
    ];
    for (const [i, { point, style }] of endpoints.entries()) {
      if (!style.ring) continue;
      for (let k = 0; k < 2; k++) {
        const material = new THREE.MeshBasicMaterial({
          color: style.ringColor,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(geometry, material);
        const v = latLngToVec(point.lat, point.lng, LAYER_RADIUS.pulses);
        ring.position.set(v[0], v[1], v[2]);
        ring.lookAt(v[0] * 2, v[1] * 2, v[2] * 2);
        ring.renderOrder = 3;
        this.group.add(ring);
        this.pulses.push({ mesh: ring, start: now + i * 150 + k * 750 });
      }
    }
  }

  private clearArcs(): void {
    for (const arc of this.arcs) {
      this.group.remove(arc.mesh);
      arc.mesh.geometry.dispose();
      arc.mesh.material.dispose();
    }
    this.arcs = [];
    for (const marker of this.markers) {
      this.group.remove(marker);
    }
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    for (const marker of this.markers) {
      if (marker instanceof THREE.Mesh) {
        geometries.add(marker.geometry);
        materials.add(marker.material);
      }
    }
    for (const pulse of this.pulses) {
      this.group.remove(pulse.mesh);
      geometries.add(pulse.mesh.geometry);
      materials.add(pulse.mesh.material);
    }
    this.markers = [];
    this.pulses = [];
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  }
}

/** Current draw-on progress of an arc (0 when it has not started). */
function arcProgress(arc: ArcObject): number {
  const value = arc.mesh.material.uniforms.uProgress?.value;
  return typeof value === 'number' ? value : 0;
}
