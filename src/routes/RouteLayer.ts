/**
 * RouteLayer — renders the flight route on top of the globe:
 *
 * - one tube per arc (outbound + optional return) with distinct lifts so the
 *   two curves never conflict,
 * - a draw-on animation (origin → destination) with a stagger for the return,
 * - flowing dashes whose direction matches the arc's travel direction,
 * - endpoint markers with a one-shot pulse ring when a route is set.
 *
 * The layer is driven by the renderer's frame loop via `update(time)`.
 */
import * as THREE from 'three';
import { latLngToVec } from '../core/greatCircle.js';
import type { LatLon } from '../types.js';
import {
  DEFAULT_ARC_RADIUS,
  DEFAULT_OUTBOUND_LIFT,
  DEFAULT_RETURN_LIFT,
  buildRoute,
  type RouteArcSpec,
  type RouteSpec,
} from './RouteModel.js';
import { GreatCircleCurve } from './GreatCircleCurve.js';
import { ROUTE_FRAGMENT, ROUTE_VERTEX } from './routeShader.js';

export interface RouteLayerTheme {
  outbound: { color: string; opacity: number };
  return: { color: string; opacity: number };
  marker: string;
  ring: string;
}

export const ROUTE_THEMES: Record<'light' | 'dark', RouteLayerTheme> = {
  light: {
    outbound: { color: '#23262e', opacity: 0.95 },
    return: { color: '#6b7280', opacity: 0.8 },
    marker: '#23262e',
    ring: '#23262e',
  },
  dark: {
    outbound: { color: '#cfd8e6', opacity: 0.95 },
    return: { color: '#7c8798', opacity: 0.75 },
    marker: '#e2e8f0',
    ring: '#e2e8f0',
  },
};

export interface RouteLayerOptions {
  theme?: 'light' | 'dark';
  /** Outbound lift (default 0.10). */
  outboundLift?: number;
  /** Return lift (default 0.20). */
  returnLift?: number;
  /** Arc tube radius in globe units (default 0.0022). */
  arcRadius?: number;
  /** Duration of the draw-on animation per arc (ms, default 1100). */
  drawDurationMs?: number;
  /** Delay between starting the outbound and the return draw (ms, default 350). */
  staggerMs?: number;
  /** Pulse rings on route change (default true). */
  pulse?: boolean;
}

interface ArcObject {
  spec: RouteArcSpec;
  mesh: THREE.Mesh<THREE.TubeGeometry, THREE.ShaderMaterial>;
}

interface Pulse {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  start: number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class RouteLayer {
  readonly group: THREE.Group;

  private readonly theme: RouteLayerTheme;
  private readonly options: Required<Omit<RouteLayerOptions, 'theme'>> & {
    theme: 'light' | 'dark';
  };

  private arcs: ArcObject[] = [];
  private markers: THREE.Object3D[] = [];
  private pulses: Pulse[] = [];
  private drawStart: number | null = null;
  private route: RouteSpec | null = null;
  private lastTime: number | null = null;
  private onDrawnCallback: (() => void) | null = null;

  constructor(parent: THREE.Object3D, options: RouteLayerOptions = {}) {
    const theme = options.theme ?? 'light';
    this.theme = ROUTE_THEMES[theme];
    this.options = {
      theme,
      outboundLift: options.outboundLift ?? DEFAULT_OUTBOUND_LIFT,
      returnLift: options.returnLift ?? DEFAULT_RETURN_LIFT,
      arcRadius: options.arcRadius ?? DEFAULT_ARC_RADIUS,
      drawDurationMs: options.drawDurationMs ?? 1100,
      staggerMs: options.staggerMs ?? 350,
      pulse: options.pulse ?? true,
    };
    this.group = new THREE.Group();
    parent.add(this.group);
  }

  get currentRoute(): RouteSpec | null {
    return this.route ? { ...this.route } : null;
  }

  /** Called once the route has fully drawn (both arcs). */
  onDrawn(callback: () => void): void {
    this.onDrawnCallback = callback;
  }

  /** Sets a new route, replacing the previous one. */
  setRoute(origin: LatLon, dest: LatLon, roundTrip = false): RouteSpec {
    const spec = buildRoute(origin, dest, {
      roundTrip,
      outboundLift: this.options.outboundLift,
      returnLift: this.options.returnLift,
    });
    this.clearArcs();
    this.route = spec;
    this.drawStart = null;
    this.lastTime = null;

    for (const arcSpec of spec.arcs) {
      this.arcs.push(this.buildArc(arcSpec));
    }
    this.buildMarkers(origin, dest);
    if (this.options.pulse) this.spawnPulses(origin, dest);
    return spec;
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
      const delay = arc.spec.order * this.options.staggerMs;
      const local = elapsed - delay;
      const t = local <= 0 ? 0 : Math.min(1, local / this.options.drawDurationMs);
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
    this.onDrawnCallback = null;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }

  private buildArc(spec: RouteArcSpec): ArcObject {
    const curve = new GreatCircleCurve(spec.from, spec.to, spec.lift);
    const radius = spec.id === 'outbound' ? this.options.arcRadius : this.options.arcRadius * 0.8;
    const geometry = new THREE.TubeGeometry(curve, 128, radius, 8, false);
    const colors = spec.id === 'outbound' ? this.theme.outbound : this.theme.return;
    const material = new THREE.ShaderMaterial({
      vertexShader: ROUTE_VERTEX,
      fragmentShader: ROUTE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(colors.color) },
        uOpacity: { value: colors.opacity },
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uDashCount: { value: spec.id === 'outbound' ? 14 : 18 },
        uDashSolid: { value: spec.id === 'outbound' ? 0.55 : 0.45 },
        uFlow: { value: spec.id === 'outbound' ? 0.35 : 0.22 },
      },
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.renderOrder = 1;
    this.group.add(mesh);
    return { spec, mesh };
  }

  private buildMarkers(origin: LatLon, dest: LatLon): void {
    const geometry = new THREE.SphereGeometry(0.0075, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: this.theme.marker });
    for (const point of [origin, dest]) {
      const marker = new THREE.Mesh(geometry, material);
      const v = latLngToVec(point.lat, point.lng, 1.001);
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
        const v = latLngToVec(point.lat, point.lng, 1.002);
        ring.position.set(v[0], v[1], v[2]);
        ring.lookAt(v[0] * 2, v[1] * 2, v[2] * 2);
        ring.renderOrder = 2;
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
