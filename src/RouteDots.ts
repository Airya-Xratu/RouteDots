/**
 * RouteDots — the public entry point.
 *
 * Renders an interactive dot globe with curved flight routes in a container:
 *
 * ```ts
 * import { RouteDots } from 'routedots';
 *
 * const rd = new RouteDots(document.getElementById('hero')!, {
 *   colors: { outbound: '#0ea5e9', plane: '#0f172a' },
 *   route: { outbound: { angle: 18, dash: { length: 0.03, gap: 0.02 } } },
 * });
 * rd.setRoute('LHR', 'DXB', { roundTrip: true });
 * ```
 *
 * Two worlds are available (option `world`): the 3D globe (`globe`, WebGL)
 * and the flat map (`flat`) — the latter with an optional 3D camera effect
 * (`camera3d`). `world: 'auto'` (the default) picks the globe when WebGL is
 * available and the flat world otherwise, so heroes degrade gracefully.
 *
 * Every colour, dash, curve angle, city ripple and the plane icon are the
 * developer's to set — at construction (`options`) or live (`setColors`,
 * `setOptions`).
 */
import { GlobeRenderer, supportsWebGL, type GlobeRendererOptions } from './globe/GlobeRenderer.js';
import type { ViewState } from './globe/cameraRig.js';
import { RouteLayer, type RouteLayerOptions } from './routes/RouteLayer.js';
import { PlaneLayer, type PlaneLayerOptions } from './routes/PlaneLayer.js';
import { trackCamera } from './routes/cameraTracking.js';
import { EndpointLabels } from './routes/EndpointLabels.js';
import { CityMarkersLayer } from './globe/CityMarkersLayer.js';
import type { ResolvedRouteStyle, RouteStyleOptions } from './routes/routeStyle.js';
import { FlatRouteMap, type FlatRouteMapOptions } from './flat/FlatRouteMap.js';
import type { FlatCamera3DOptions, ResolvedFlatCamera3D } from './flat/camera3d.js';
import type { CityMarkersOptions, ResolvedCityMarkers } from './markers/rippleStyle.js';
import {
  resolveCityLabelStyle,
  type CityLabelTextStyle,
  type ResolvedCityLabelStyle,
} from './labels/textStyle.js';
import {
  resolveAirportsStyle,
  type AirportsStyleOptions,
  type ResolvedAirportsStyle,
} from './routes/airportStyle.js';
import { angularDistance, DEG, greatCircleMidpoint } from './core/greatCircle.js';
import type { TopoLand } from './core/topojson.js';
import { resolvePalette, type RouteDotsColors, type RouteDotsPalette } from './theme.js';
import { CITIES, resolveCity, type CityRef } from './cities.js';
import type { City, LatLon, MapSurface, WorldMode } from './types.js';

export type RouteDotsMode = 'webgl' | 'flat';

export interface RouteDotsOptions {
  theme?: 'light' | 'dark';
  /**
   * Which world to render:
   *
   * - `'auto'` (default) — the 3D globe when WebGL is available, the flat
   *   world otherwise.
   * - `'globe'` — force the 3D globe (falls back to the flat world when the
   *   browser cannot create a WebGL context).
   * - `'flat'` — force the flat world, with or without WebGL (pair it with
   *   `camera3d` for the 3D camera effect).
   */
  world?: WorldMode;
  /**
   * Map surface: grey country shapes with white borders (`countries`, the
   * default) or the classic dot lattice (`dots`).
   */
  surface?: MapSurface;
  /**
   * Every colour in one place — see {@link RouteDotsPalette}. Unknown keys
   * are ignored; the legacy `globe` / `land` aliases still work. Apply more
   * at runtime with {@link RouteDots.setColors}.
   */
  colors?: RouteDotsColors;
  /** Initial camera view (3D world). */
  view?: ViewState;
  autoRotate?: { enabled?: boolean; speed?: number };
  interactive?: boolean;
  texture?: { stepDeg?: number; resDeg?: number; dotSizeDeg?: number; width?: number };
  /**
   * Route styling. Top-level keys are shared defaults; `outbound` and
   * `return` style each leg — colour, opacity, lift, **curve angle**, width
   * and **dashes** (colour, length, gap, speed, width). The legacy
   * `outboundLift` / `returnLift` / `arcRadius` keys still work.
   */
  route?: RouteStyleOptions;
  /**
   * The plane: timing, colour, size — and the **icon component**
   * (`icon: 'jet'`, SVG path data, or a custom draw function).
   */
  plane?: PlaneLayerOptions & { enabled?: boolean };
  /**
   * Blinking city dots and their **ripple rings**: colour, sizes, grow,
   * opacity and period. `list` replaces the bundled city dataset.
   */
  cities?: CityMarkersOptions & { list?: readonly City[] };
  /**
   * Text style of the **city-name labels** (the globe's pin badges and the
   * flat map's city names): font family / size / weight, letter spacing,
   * text and badge colours, flat-map halo.
   */
  labels?: CityLabelTextStyle;
  /**
   * **Source and destination airports**: the endpoint dots, their pulse
   * rings and the pin dots — shared defaults plus per-endpoint
   * `source` / `destination` overrides (colour, size, ring colour / on-off).
   */
  airports?: AirportsStyleOptions;
  /** 3D camera effect for the flat world (perspective, tilt, depth, orbit). */
  camera3d?: FlatCamera3DOptions;
  /** Camera pan/zoom when a route is set (default true). */
  frameRoute?: boolean;
  /** Enable the flat world fallback (default true). */
  fallback?: { enabled?: boolean };
  /** Flat-world specifics (surface, sizes, plane, camera…). */
  flat?: FlatRouteMapOptions;
  /** Replace the bundled land mask. */
  land?: TopoLand;
  /**
   * Country border lines (default enabled, white).
   * `color` applies to both worlds; `opacity` is the globe line opacity,
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

/** Recursive merge for option objects (arrays and class instances replace). */
function mergeOptions<T extends object>(base: T, patch: Partial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] =
      isPlainObject(value) && isPlainObject(current)
        ? mergeOptions(current, value as Record<string, unknown>)
        : value;
  }
  return out as T;
}

/** Deep clone for option objects (used by `getOptions`). */
function cloneOptions<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => cloneOptions(entry)) as unknown as T;
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) out[key] = cloneOptions(entry);
    return out as T;
  }
  return value;
}

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

  private options: RouteDotsOptions;
  private palette: RouteDotsPalette;
  private readonly container: HTMLElement;
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private route: RouteDotsRouteInfo | null = null;
  private disposed = false;

  constructor(container: HTMLElement, options: RouteDotsOptions = {}) {
    this.container = container;
    this.options = { theme: 'light', ...options };
    this.palette = resolvePalette(this.options.theme ?? 'light', this.options.colors);

    if (this.wantsGlobe()) {
      this.mountWebGL();
    } else if (this.options.fallback?.enabled !== false || this.options.world === 'flat') {
      this.mountFlat();
    } else {
      this.emit('error', new Error('RouteDots: WebGL unavailable and fallback disabled'));
      return;
    }
    if (this._mode !== null) this.emit('ready', { mode: this._mode });
  }

  /** Active render mode ('webgl' | 'flat'), or null when mounting failed. */
  get mode(): RouteDotsMode | null {
    return this._mode;
  }

  /** The palette in use (theme + `colors` merged). */
  get activePalette(): RouteDotsPalette {
    return { ...this.palette };
  }

  /** A deep copy of the merged options in use. */
  getOptions(): RouteDotsOptions {
    return cloneOptions(this.options);
  }

  /**
   * The resolved route style in use — theme colours, lifts, **curve angles**,
   * widths and dash patterns with all defaults applied (null before mount).
   */
  getRouteStyle(): ResolvedRouteStyle | null {
    if (this._mode === 'webgl') return this.layer?.resolvedStyle ?? null;
    if (this._mode === 'flat') return this.flat?.activeRouteStyle ?? null;
    return null;
  }

  /** The resolved city dot + ripple style in use (null before mount). */
  getCityStyle(): ResolvedCityMarkers | null {
    if (this._mode === 'webgl') return this.cityMarkers?.resolvedStyle ?? null;
    if (this._mode === 'flat') return this.flat?.activeCityStyle ?? null;
    return null;
  }

  /** The resolved city-name label text style in use (null before mount). */
  getLabelStyle(): ResolvedCityLabelStyle | null {
    if (this._mode === 'webgl') return this.pins?.labelStyle ?? null;
    if (this._mode === 'flat') return this.flat?.activeLabelStyle ?? null;
    return null;
  }

  /** The resolved source / destination airport styles in use (null before mount). */
  getAirportStyle(): ResolvedAirportsStyle | null {
    if (this._mode === 'webgl') return this.layer?.resolvedAirports ?? null;
    if (this._mode === 'flat') return this.flat?.activeAirports ?? null;
    return null;
  }

  /** The resolved 3D-camera settings of the flat world (null in the 3D globe). */
  getCamera3D(): ResolvedFlatCamera3D | null {
    return this._mode === 'flat' ? (this.flat?.camera3d ?? null) : null;
  }

  /** The flat world instance (null in the 3D globe) — handy for demos/tests. */
  getFlatMap(): FlatRouteMap | null {
    return this.flat;
  }

  /** Blinking airport-city markers (3D world; null in flat mode). */
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
        const style = this.layer.resolvedStyle.outbound;
        this.plane.setArc(
          outbound.from,
          outbound.to,
          { lift: style.lift, angle: style.angle },
          performance.now(),
        );
      }
      const airports = resolveAirportsStyle(this.palette, this.options.airports);
      this.pins?.setPoints([
        { name: a.name, lat: a.lat, lng: a.lng, dotColor: airports.source.color },
        { name: b.name, lat: b.lat, lng: b.lng, dotColor: airports.destination.color },
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
    if (this._mode === 'flat') this.flat?.clearRoute();
    this.emit('route:cleared');
  }

  /** Current camera view (3D world only; null in flat mode). */
  getCameraState(): ViewState | null {
    if (this._mode !== 'webgl') return null;
    return this.globe?.getCameraState() ?? null;
  }

  /** Animates the camera to a new view (3D world only; a no-op in flat mode). */
  setView(view: ViewState, durationMs?: number): void {
    if (this._mode === 'webgl' && this.globe) {
      this.globe.setView(view, durationMs ?? 1200);
    }
  }

  /**
   * Restyles every colour of the scene live — globe or flat world, arcs,
   * plane, city ripple and pins.
   *
   * ```ts
   * rd.setColors({ outbound: '#0ea5e9', plane: '#0ea5e9', ocean: '#0b1220' });
   * ```
   */
  setColors(colors: RouteDotsColors): void {
    this.options.colors = { ...this.options.colors, ...colors };
    this.palette = resolvePalette(this.options.theme ?? 'light', this.options.colors);
    this.applyLive();
  }

  /**
   * Removes every `colors` override, so the scene falls back to the palette of
   * the active theme (`setColors` merges; this un-merges).
   */
  resetColors(): void {
    if (this.disposed) return;
    delete this.options.colors;
    this.palette = resolvePalette(this.options.theme ?? 'light', undefined);
    this.applyLive();
  }

  /**
   * Merges new options into the live instance and applies them: colours,
   * route styling, dashes, curve angles, city ripple, plane icon and the 3D
   * camera all update in place. Structural options (`world`, `surface`,
   * `theme`, `texture`, `land`) remount the renderer and re-draw the route.
   */
  setOptions(options: RouteDotsOptions): void {
    if (this.disposed) return;
    const previous = this.options;
    this.options = mergeOptions(previous, options);
    this.palette = resolvePalette(this.options.theme ?? 'light', this.options.colors);

    const structural =
      options.world !== undefined ||
      options.surface !== undefined ||
      options.theme !== undefined ||
      options.texture !== undefined ||
      options.land !== undefined ||
      options.fallback !== undefined ||
      options.flat?.surface !== undefined;
    if (structural) {
      this.remount();
      return;
    }
    this.applyLive();
  }

  /** Switches the world ('auto' | 'globe' | 'flat') and re-draws the route. */
  setWorld(world: WorldMode): void {
    this.setOptions({ world });
  }

  /** Switches the colour theme at runtime. */
  setTheme(theme: 'light' | 'dark'): void {
    this.setOptions({ theme });
  }

  resize(): void {
    if (this._mode === 'webgl' && this.globe) this.globe.resize();
    if (this._mode === 'flat') this.flat?.reframe();
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

  /** True when the globe should be mounted (world option + WebGL probe). */
  private wantsGlobe(): boolean {
    if ((this.options.world ?? 'auto') === 'flat') return false;
    return supportsWebGL();
  }

  /** Re-mounts the active world, preserving the route. */
  private remount(): void {
    const previousRoute = this.route;
    const previousMode = this._mode;
    if (this._mode === 'webgl') this.unmountWebGL();
    if (this._mode === 'flat') this.unmountFlat();
    this._mode = null;

    if (this.wantsGlobe()) {
      this.mountWebGL();
    } else if (this.options.fallback?.enabled !== false || this.options.world === 'flat') {
      this.mountFlat();
    }
    if (this._mode !== previousMode) {
      this.emit('mode:changed', { from: previousMode, to: this._mode });
    }
    if (previousRoute) {
      this.route = null;
      this.setRoute(previousRoute.from, previousRoute.to, { roundTrip: previousRoute.roundTrip });
    }
  }

  /** Applies the current options to the mounted world, in place. */
  private applyLive(): void {
    const o = this.options;
    const palette = this.palette;

    if (this._mode === 'webgl' && this.globe) {
      this.globe.setColors(o.colors);
      this.globe.setInteractive(o.interactive === true);
      this.globe.setAutoRotate(o.autoRotate?.enabled !== false && this.route === null);
      this.layer?.applyStyle({
        ...o.route,
        theme: o.theme,
        colors: o.colors,
        airports: o.airports,
      });
      // The plane and the city markers can be switched on/off at runtime.
      if (o.plane?.enabled === false) {
        this.plane?.dispose();
        this.plane = null;
      } else if (!this.plane && this.globe) {
        this.plane = this.createPlane();
      }
      this.plane?.applyStyle({
        size: o.plane?.size,
        color: o.plane?.color ?? palette.plane,
        clearance: o.plane?.clearance,
        flightMs: o.plane?.flightMs,
        pauseMs: o.plane?.pauseMs,
        startDelayMs: o.plane?.startDelayMs,
        icon: o.plane?.icon,
      });
      // Keep the plane on the arc it should fly: a live restyle may have
      // changed the curve (angle / lift), and a freshly-enabled plane needs
      // its arc in the first place.
      if (this.plane && this.route && this.layer) {
        const outbound = this.layer.resolvedStyle.outbound;
        this.plane.setArc(
          this.route.from,
          this.route.to,
          { lift: outbound.lift, angle: outbound.angle },
          performance.now(),
        );
      }
      if (o.cities?.enabled === false) {
        this.cityMarkers?.dispose();
        this.cityMarkers = null;
      } else if (!this.cityMarkers && this.globe) {
        this.cityMarkers = this.createCityMarkers();
      } else if (this.cityMarkers) {
        this.cityMarkers.applyStyle({
          enabled: o.cities?.enabled,
          color: o.cities?.color ?? palette.cities,
          periodMs: o.cities?.periodMs,
          dot: o.cities?.dot,
          ripple: o.cities?.ripple,
        });
      }
      this.pins?.setPalette({
        background: palette.labelBackground,
        label: palette.label,
        dot: palette.marker,
      });
      this.pins?.setTextStyle(resolveCityLabelStyle(palette, o.labels));
      return;
    }

    if (this._mode === 'flat' && this.flat) {
      this.flat.applyStyle({
        theme: o.theme ?? 'light',
        colors: o.colors,
        surface: o.flat?.surface ?? o.surface,
        stepDeg: o.flat?.stepDeg ?? o.texture?.stepDeg,
        land: o.land,
        borders:
          o.borders === undefined
            ? undefined
            : { enabled: o.borders.enabled, color: o.borders.color, width: o.borders.width },
        route: o.route,
        labels: o.labels,
        airports: o.airports,
        cities:
          o.cities === undefined
            ? undefined
            : {
                enabled: o.cities.enabled,
                color: o.cities.color,
                periodMs: o.cities.periodMs,
                list: o.cities.list,
                dot: o.cities.dot,
                ripple: o.cities.ripple,
              },
        plane: {
          ...o.flat?.plane,
          ...o.plane,
          color: o.plane?.color ?? o.flat?.plane?.color ?? palette.plane,
        },
        camera3d: { ...o.flat?.camera3d, ...o.camera3d },
      });
    }
  }

  /** Creates the plane layer from the current options. */
  private createPlane(): PlaneLayer | null {
    if (!this.globe) return null;
    const o = this.options;
    return new PlaneLayer(this.globe.globeGroup, {
      size: o.plane?.size,
      color: o.plane?.color ?? this.palette.plane,
      clearance: o.plane?.clearance,
      flightMs: o.plane?.flightMs,
      pauseMs: o.plane?.pauseMs,
      startDelayMs: o.plane?.startDelayMs,
      icon: o.plane?.icon,
    });
  }

  /** Creates the city marker layer from the current options. */
  private createCityMarkers(): CityMarkersLayer | null {
    if (!this.globe) return null;
    const o = this.options;
    return new CityMarkersLayer(this.globe.globeGroup, {
      cities: o.cities?.list,
      color: o.cities?.color ?? this.palette.cities,
      periodMs: o.cities?.periodMs,
      radius: o.cities?.radius,
      dot: o.cities?.dot,
      ripple: o.cities?.ripple,
    });
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
    this.palette = this.globe.palette;

    const layerOptions: RouteLayerOptions = {
      ...o.route,
      theme: o.theme,
      colors: o.colors,
      airports: o.airports,
    };
    this.layer = new RouteLayer(this.globe.globeGroup, layerOptions);
    this.layer.onDrawn(() => this.emit('route:drawn', this.getRoute()));

    if (o.plane?.enabled !== false) {
      this.plane = new PlaneLayer(this.globe.globeGroup, {
        size: o.plane?.size,
        color: o.plane?.color ?? this.palette.plane,
        clearance: o.plane?.clearance,
        flightMs: o.plane?.flightMs,
        pauseMs: o.plane?.pauseMs,
        startDelayMs: o.plane?.startDelayMs,
        icon: o.plane?.icon,
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
      {
        background: this.palette.labelBackground,
        label: this.palette.label,
        dot: this.palette.marker,
      },
    );
    this.pins.setTextStyle(resolveCityLabelStyle(this.palette, o.labels));

    if (o.cities?.enabled !== false) {
      this.cityMarkers = this.createCityMarkers();
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
      colors: o.colors,
      surface: o.flat?.surface ?? o.surface,
      stepDeg: o.flat?.stepDeg ?? o.texture?.stepDeg,
      width: o.flat?.width ?? 1600,
      route: o.route,
      labels: o.labels,
      airports: o.airports,
      plane: {
        ...o.flat?.plane,
        ...o.plane,
        color: o.plane?.color ?? o.flat?.plane?.color ?? this.palette.plane,
      },
      flightMs: o.flat?.flightMs ?? o.plane?.flightMs,
      pauseMs: o.flat?.pauseMs ?? o.plane?.pauseMs,
      camera3d: { ...o.flat?.camera3d, ...o.camera3d },
      land: o.land,
      cities:
        o.cities === undefined
          ? undefined
          : {
              enabled: o.cities.enabled,
              color: o.cities.color,
              periodMs: o.cities.periodMs,
              list: o.cities.list,
              dot: o.cities.dot,
              ripple: o.cities.ripple,
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
    this.palette = this.flat.activePalette;
    this._mode = 'flat';
  }

  private unmountFlat(): void {
    this.flat?.dispose();
    this.flat = null;
  }
}

// Re-export convenience theme tables and palette helpers
export { GLOBE_THEMES } from './globe/GlobeRenderer.js';
export type { GlobeThemeColors } from './globe/GlobeRenderer.js';
export {
  PALETTES,
  PALETTE_KEYS,
  resolvePalette,
  paletteToGlobeTheme,
  paletteToRouteTheme,
  paletteToFlatTheme,
} from './theme.js';
export type { RouteDotsPalette, RouteDotsColors, FlatTheme } from './theme.js';
