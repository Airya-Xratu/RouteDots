/**
 * RouteDots — the public entry point.
 *
 * Renders an interactive dot globe with curved flight routes in a container:
 *
 * ```ts
 * import { RouteDots } from 'routedots';
 *
 * const rd = new RouteDots(document.getElementById('hero')!);
 * rd.setRoute('LHR', 'DXB', { roundTrip: true });
 * ```
 *
 * Falls back to a flat 2D dot map (`FlatRouteMap`) when WebGL is unavailable,
 * so heroes degrade gracefully instead of breaking.
 */
import {
  GlobeRenderer,
  GLOBE_THEMES,
  supportsWebGL,
  type GlobeRendererOptions,
  type GlobeThemeColors,
} from './globe/GlobeRenderer.js';
import type { ViewState } from './globe/cameraRig.js';
import { RouteLayer, type RouteLayerOptions } from './routes/RouteLayer.js';
import { PlaneLayer, type PlaneLayerOptions } from './routes/PlaneLayer.js';
import { trackCamera } from './routes/cameraTracking.js';
import { EndpointLabels } from './routes/EndpointLabels.js';
import { CityMarkersLayer } from './globe/CityMarkersLayer.js';
import { FlatRouteMap, type FlatRouteMapOptions } from './flat/FlatRouteMap.js';
import { angularDistance, DEG, greatCircleMidpoint } from './core/greatCircle.js';
import type { TopoLand } from './core/topojson.js';
import { CITIES, resolveCity, type CityRef } from './cities.js';
import type { City, LatLon, MapSurface } from './types.js';

export type RouteDotsMode = 'webgl' | 'flat';

export interface RouteDotsOptions {
  theme?: 'light' | 'dark';
  /**
   * Map surface: grey country shapes with white borders (`countries`, the
   * default) or the classic dot lattice (`dots`).
   */
  surface?: MapSurface;
  /** Override individual globe colours (WebGL mode). */
  colors?: Partial<GlobeThemeColors>;
  /** Initial camera view (WebGL mode). */
  view?: ViewState;
  autoRotate?: { enabled?: boolean; speed?: number };
  interactive?: boolean;
  texture?: { stepDeg?: number; resDeg?: number; dotSizeDeg?: number; width?: number };
  route?: {
    outboundLift?: number;
    returnLift?: number;
    arcRadius?: number;
    drawDurationMs?: number;
    staggerMs?: number;
    pulse?: boolean;
  };
  plane?: PlaneLayerOptions & { enabled?: boolean };
  /**
   * Blinking circles at every airport city (WebGL + flat fallback).
   * `list` replaces the bundled city dataset.
   */
  cities?: {
    enabled?: boolean;
    color?: string;
    periodMs?: number;
    list?: readonly City[];
  };
  /** Camera pan/zoom when a route is set (default true). */
  frameRoute?: boolean;
  /** Enable the flat no-WebGL fallback (default true). */
  fallback?: { enabled?: boolean };
  flat?: FlatRouteMapOptions;
  /** Replace the bundled land mask. */
  land?: TopoLand;
  /**
   * Country border lines (default enabled, white).
   * `color` applies to both modes; `opacity` is the globe line opacity,
   * `width` the flat-map stroke width in px.
   */
  borders?: {
    enabled?: boolean;
    color?: string;
    /** Globe line opacity, 0..1 (default 0.55). */
    opacity?: number;
    /** Flat stroke width in px (default 1). */
    width?: number;
  };
}

export interface RouteDotsRouteOptions {
  roundTrip?: boolean;
}

export interface RouteDotsRouteInfo {
  from: City;
  to: City;
  roundTrip: boolean;
}

type EventHandler = (payload?: unknown) => void;

export class RouteDots {
  /** Default city dataset. */
  static readonly CITIES: readonly City[] = CITIES;

  private _mode: RouteDotsMode | null = null;
  private globe: GlobeRenderer | null = null;
  private layer: RouteLayer | null = null;
  private plane: PlaneLayer | null = null;
  private pins: EndpointLabels | null = null;
  private cityMarkers: CityMarkersLayer | null = null;
  private flat: FlatRouteMap | null = null;

  private readonly options: Required<Pick<RouteDotsOptions, 'theme'>> & RouteDotsOptions;
  private readonly container: HTMLElement;
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private route: RouteDotsRouteInfo | null = null;
  private disposed = false;

  constructor(container: HTMLElement, options: RouteDotsOptions = {}) {
    this.container = container;
    this.options = { theme: 'light', ...options };

    if (supportsWebGL()) {
      this.mountWebGL();
    } else if (this.options.fallback?.enabled !== false) {
      this.mountFlat();
    } else {
      this.emit('error', new Error('RouteDots: WebGL unavailable and fallback disabled'));
      return;
    }
    this.emit('ready', { mode: this._mode });
  }

  /** Active render mode ('webgl' | 'flat'), or null when mounting failed. */
  get mode(): RouteDotsMode | null {
    return this._mode;
  }

  /** Blinking airport-city markers (WebGL mode; null in flat mode). */
  getCityMarkers(): CityMarkersLayer | null {
    return this.cityMarkers;
  }

  /** Current route (resolved cities + trip type), if any. */
  getRoute(): RouteDotsRouteInfo | null {
    return this.route ? { ...this.route } : null;
  }

  /**
   * Draws the route from `from` to `to` (IATA code, City, or bare lat/lng).
   * Returns false when a city cannot be resolved or both are the same point.
   */
  setRoute(from: CityRef, to: CityRef, routeOptions: RouteDotsRouteOptions = {}): boolean {
    if (this.disposed || this._mode === null) return false;
    const a = resolveCity(from);
    const b = resolveCity(to);
    if (!a || !b) {
      this.emit('route:invalid', { from, to });
      return false;
    }
    const dLat = a.lat - b.lat;
    const dLng = ((a.lng - b.lng + 540) % 360) - 180;
    if (Math.hypot(dLat, dLng) < 0.01) {
      this.emit('route:invalid', { from, to });
      return false;
    }

    const roundTrip = routeOptions.roundTrip ?? false;
    this.route = { from: a, to: b, roundTrip };
    this.emit('route:updated', this.getRoute());

    if (this._mode === 'webgl' && this.globe && this.layer) {
      const spec = this.layer.setRoute(a, b, roundTrip);
      if (this.plane && this.options.plane?.enabled !== false) {
        const outbound = spec.arcs[0]!;
        this.plane.setArc(outbound.from, outbound.to, outbound.lift, performance.now());
      }
      this.pins?.setPoints([
        { name: a.name, lat: a.lat, lng: a.lng },
        { name: b.name, lat: b.lat, lng: b.lng },
      ]);
      // Camera tracking takes over while a route is set: idle rotation pauses.
      this.globe.setAutoRotate(false);
      if (this.options.frameRoute !== false) this.frameRoute(a, b);
    } else if (this._mode === 'flat' && this.flat) {
      this.flat.setRoute(a, b, { roundTrip });
    }
    return true;
  }

  /** Clears the current route. */
  clearRoute(): void {
    if (this.disposed || this._mode === null) return;
    this.route = null;
    if (this._mode === 'webgl' && this.layer) this.layer.clear();
    this.plane?.clear();
    this.pins?.clear();
    // Camera tracking disengages with the route; idle rotation resumes.
    if (this._mode === 'webgl' && this.globe) {
      this.globe.setAutoRotate(this.options.autoRotate?.enabled !== false);
    }
    this.emit('route:cleared');
  }

  /** Current camera view (WebGL mode only; null in flat mode). */
  getCameraState(): ViewState | null {
    if (this._mode !== 'webgl') return null;
    return this.globe?.getCameraState() ?? null;
  }

  /** Animates the camera to a new view (WebGL mode only; a no-op in flat mode). */
  setView(view: ViewState, durationMs?: number): void {
    if (this._mode === 'webgl' && this.globe) {
      this.globe.setView(view, durationMs ?? 1200);
    }
  }

  /** Switches the colour theme at runtime. */
  setTheme(theme: 'light' | 'dark'): void {
    this.options.theme = theme;
    if (this._mode === 'webgl' && this.globe) {
      // Rebuilding the texture + materials is cheap enough for a theme switch.
      this.unmountWebGL();
      this.mountWebGL();
      if (this.route)
        this.setRoute(this.route.from, this.route.to, { roundTrip: this.route.roundTrip });
    } else if (this._mode === 'flat' && this.flat) {
      this.unmountFlat();
      this.mountFlat();
      if (this.route)
        this.setRoute(this.route.from, this.route.to, { roundTrip: this.route.roundTrip });
    }
  }

  resize(): void {
    if (this._mode === 'webgl' && this.globe) this.globe.resize();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this._mode === 'webgl') this.unmountWebGL();
    if (this._mode === 'flat') this.unmountFlat();
    this._mode = null;
    this.handlers.clear();
  }

  on(event: string, handler: EventHandler): () => void {
    const set = this.handlers.get(event) ?? new Set<EventHandler>();
    set.add(handler);
    this.handlers.set(event, set);
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  private emit(event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      try {
        handler(payload);
      } catch {
        // listener errors must not break the render loop
      }
    }
  }

  /**
   * Pans the camera so the route is framed: centred on the great-circle
   * midpoint, with the altitude growing with the route length — this is what
   * simulates "the globe moving toward the destination" when it is off screen.
   */
  private frameRoute(a: LatLon, b: LatLon): void {
    if (!this.globe) return;
    const mid = greatCircleMidpoint(a, b);
    const distDeg = angularDistance(a, b) / DEG;
    const altitude = Math.min(2.4, Math.max(1.4, 1.35 + distDeg / 90));
    this.globe.setView({ lat: mid.lat, lng: mid.lng, altitude }, 1400);
  }

  private mountWebGL(): void {
    const o = this.options;
    const globeOptions: GlobeRendererOptions = {
      theme: o.theme,
      surface: o.surface,
      colors: o.colors,
      view: o.view,
      autoRotate: o.autoRotate,
      interactive: o.interactive,
      texture: o.texture,
      land: o.land,
      borders:
        o.borders === undefined
          ? undefined
          : {
              enabled: o.borders.enabled,
              color: o.borders.color,
              opacity: o.borders.opacity,
            },
    };
    try {
      this.globe = new GlobeRenderer(this.container, globeOptions);
    } catch (err) {
      this.globe = null;
      if (o.fallback?.enabled !== false) {
        this.mountFlat();
        this.emit('mode:changed', { from: null, to: this._mode });
        return;
      }
      throw err;
    }
    this._mode = 'webgl';

    const layerOptions: RouteLayerOptions = {
      theme: o.theme,
      outboundLift: o.route?.outboundLift,
      returnLift: o.route?.returnLift,
      arcRadius: o.route?.arcRadius,
      drawDurationMs: o.route?.drawDurationMs,
      staggerMs: o.route?.staggerMs,
      pulse: o.route?.pulse,
    };
    this.layer = new RouteLayer(this.globe.globeGroup, layerOptions);
    this.layer.onDrawn(() => this.emit('route:drawn', this.getRoute()));

    if (o.plane?.enabled !== false) {
      this.plane = new PlaneLayer(this.globe.globeGroup, {
        size: o.plane?.size,
        color: o.plane?.color,
        clearance: o.plane?.clearance,
        flightMs: o.plane?.flightMs,
        pauseMs: o.plane?.pauseMs,
        startDelayMs: o.plane?.startDelayMs,
      });
    }

    this.pins = new EndpointLabels(
      this.container,
      this.globe.camera,
      () => [
        this.globe!.renderer.domElement.clientWidth,
        this.globe!.renderer.domElement.clientHeight,
      ],
      o.theme,
    );

    if (o.cities?.enabled !== false) {
      this.cityMarkers = new CityMarkersLayer(this.globe.globeGroup, {
        cities: o.cities?.list,
        color: o.cities?.color ?? { ...GLOBE_THEMES[o.theme], ...o.colors }.cities,
        periodMs: o.cities?.periodMs,
      });
    }

    this.globe.onFrame((time, dtSec) => {
      this.layer?.update(time);
      if (this.plane) this.plane.update(time, this.globe!.camera);
      this.cityMarkers?.update(time);
      this.updateCameraTracking(dtSec);
      this.pins?.update();
    });
  }

  /**
   * Camera tracking (WebGL): while a route is set and neither the user nor a
   * view tween is in control, ease the camera back toward the plane whenever
   * it leaves the visible disc. Pure policy lives in `cameraTracking.ts`.
   */
  private updateCameraTracking(dtSec: number): void {
    if (!this.globe || !this.plane || !this.route) return;
    const ground = this.plane.getGroundPosition();
    if (!ground) return;
    const step = trackCamera({
      camera: this.globe.rig.state,
      plane: ground,
      dtSec,
      routeActive: true,
      userControlled: this.globe.isDragging || this.globe.rig.tweenActive,
    });
    if (step.adjusted) this.globe.rig.snapTo(step.camera);
  }

  private unmountWebGL(): void {
    this.cityMarkers?.dispose();
    this.cityMarkers = null;
    this.plane?.dispose();
    this.plane = null;
    this.pins?.dispose();
    this.pins = null;
    this.layer?.dispose();
    this.layer = null;
    this.globe?.dispose();
    this.globe = null;
  }

  private mountFlat(): void {
    const o = this.options;
    const flatOptions: FlatRouteMapOptions = {
      theme: o.theme,
      surface: o.flat?.surface ?? o.surface,
      stepDeg: o.flat?.stepDeg ?? o.texture?.stepDeg,
      width: o.flat?.width ?? 1600,
      flightMs: o.flat?.flightMs ?? o.plane?.flightMs,
      pauseMs: o.flat?.pauseMs ?? o.plane?.pauseMs,
      land: o.land,
      cities:
        o.cities === undefined
          ? undefined
          : {
              enabled: o.cities.enabled,
              periodMs: o.cities.periodMs,
              list: o.cities.list,
            },
      borders:
        o.borders === undefined
          ? undefined
          : {
              enabled: o.borders.enabled,
              color: o.borders.color,
              width: o.borders.width,
            },
    };
    this.flat = new FlatRouteMap(this.container, flatOptions);
    this._mode = 'flat';
  }

  private unmountFlat(): void {
    this.flat?.dispose();
    this.flat = null;
  }
}

// Re-export convenience theme tables
export { GLOBE_THEMES };
