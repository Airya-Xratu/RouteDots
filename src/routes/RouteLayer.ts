/**
 * RouteLayer — renders the flight route on top of the globe:
 *
 * - one tube per arc (outbound + optional return) with distinct lifts (and
 *   optional curve angles) so the two curves never conflict,
 * - a draw-on animation (origin → destination) with a stagger for the return,
 * - flowing dashes whose direction matches the arc's travel direction, fully
 *   customisable per path (colour, length, gap, width, speed),
 * - endpoint markers with a one-shot pulse ring when a route is set.
 *
 * The layer is driven by the renderer's frame loop via `update(time)`.
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
  dashUniforms,
  globeTubeRadius,
  resolveRouteStyle,
  type ResolvedPathStyle,
  type ResolvedRouteStyle,
  type RouteStyleOptions,
} from './routeStyle.js';

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
  /** Pre-resolved styles (skips resolving `route` options again). */
  style?: ResolvedRouteStyle;
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

  private arcs: ArcObject[] = [];
  private markers: THREE.Object3D[] = [];
  private pulses: Pulse[] = [];
  private drawStart: number | null = null;
  private route: RouteSpec | null = null;
  private lastRoute: { origin: LatLon; dest: LatLon; roundTrip: boolean } | null = null;
  private lastTime: number | null = null;
  private onDrawnCallback: (() => void) | null = null;

  constructor(parent: THREE.Object3D, options: RouteLayerOptions = {}) {
    const theme = options.theme ?? 'light';
    this.theme = ROUTE_THEMES[theme];
    this.options = { ...options, theme };
    this.style = options.style ?? resolveRouteStyle(theme, options, options.colors);
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

  /** Called once the route has fully drawn (both arcs). */
  onDrawn(callback: () => void): void {
    this.onDrawnCallback = callback;
  }

  /** Sets a new route, replacing the previous one. */
  setRoute(origin: LatLon, dest: LatLon, roundTrip = false): RouteSpec {
    const spec = buildRoute(origin, dest, {
      roundTrip,
      outboundLift: this.style.outbound.lift,
      returnLift: this.style.return.lift,
      outboundAngle: this.style.outbound.angle,
      returnAngle: this.style.return.angle,
    });
    this.clearArcs();
    this.route = spec;
    this.lastRoute = { origin, dest, roundTrip };
    this.drawStart = null;
    this.lastTime = null;

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

    if (this.lastRoute) {
      const progress = this.arcs.map((arc) => arcProgress(arc));
      const pulses = this.pulses.length > 0 && this.style.pulse;
      const spec = buildRoute(this.lastRoute.origin, this.lastRoute.dest, {
        roundTrip: this.lastRoute.roundTrip,
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
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }

  private styleFor(spec: RouteArcSpec): ResolvedPathStyle {
    return spec.id === 'outbound' ? this.style.outbound : this.style.return;
  }

  private buildArc(spec: RouteArcSpec, style: ResolvedPathStyle, progress = 0): ArcObject {
    const curve = new GreatCircleCurve(spec.from, spec.to, spec.lift, spec.angle);
    // `width` may be authored in px (docs / studio) — convert it to a sane
    // tube radius (a raw px value built a planet-sized tube: globeTubeRadius).
    const geometry = new THREE.TubeGeometry(curve, 128, globeTubeRadius(style.width), 8, false);
    const dash = style.dash ? dashUniforms(style.dash) : null;
    const material = new THREE.ShaderMaterial({
      vertexShader: ROUTE_VERTEX,
      fragmentShader: ROUTE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(style.dash?.color ?? style.color) },
        uOpacity: { value: style.opacity },
        uProgress: { value: progress },
        uTime: { value: 0 },
        uDashCount: { value: dash?.dashCount ?? 1 },
        uDashSolid: { value: dash?.dashSolid ?? 1 },
        uFlow: { value: dash?.flow ?? 0 },
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = progress > 0;
    // Depth-independent painter layering: the return arc always draws above
    // the outbound (order 1 / 2), pulses (3) and the plane (4) above both —
    // "there and back" stays readable even where the arcs overlap.
    mesh.renderOrder = 1 + spec.order;
    this.group.add(mesh);
    return { spec, style, mesh };
  }

  private buildMarkers(origin: LatLon, dest: LatLon): void {
    const geometry = new THREE.SphereGeometry(0.0075, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: this.theme.marker });
    for (const point of [origin, dest]) {
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
    for (const [i, point] of [origin, dest].entries()) {
      for (let k = 0; k < 2; k++) {
        const material = new THREE.MeshBasicMaterial({
          color: this.theme.ring,
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
