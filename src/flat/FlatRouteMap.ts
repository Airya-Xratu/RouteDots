/**
 * FlatRouteMap — the flat world: the no-WebGL fallback, and a first-class
 * mode of its own.
 *
 * A flat equirectangular map (country fills with hairline borders, or the dot
 * lattice of the 3D globe) with an SVG overlay:
 *
 * - **The whole world at rest.** Before a route exists the map is letterboxed
 *   to fit the container, so the visitor sees the entire planet in the
 *   configured style — never a cropped corner of it.
 * - **A route is flown to, not just drawn.** Setting a route eases the camera
 *   from the world view to a frame that holds both airports (and the arc
 *   between them), and only then draws the arcs, the airports and the city
 *   names. Clearing the route zooms back out.
 * - two curved dashed routes (the outbound leg bulging one way, the return
 *   the other), each with its own colour, dash pattern and curve angle,
 * - a small plane that repeatedly flies the outbound path — any icon the
 *   developer wants (`PlaneIcon`),
 * - city dots with a fully tunable ripple ring,
 * - **screen-space typography**: the city names keep the configured
 *   `labels.fontSize` on screen at every zoom level (`labels.scaleWithZoom`
 *   opts out),
 * - and an optional **3D camera effect** (`camera3d`): a CSS perspective
 *   viewport with a tiltable/yawable world, where the routes and the plane
 *   float above the map on their own depth layers, drag orbits the camera,
 *   scroll zooms, and the framing eases to follow the plane.
 *
 * Everything is local DOM — no WebGL, no network.
 */
import landTopo from '../data/land-110m.js';
import countriesTopo from '../data/countries-110m.js';
import { buildDotGrid } from '../core/dotPattern.js';
import { buildHexGrid } from '../core/hexPattern.js';
import {
  decodeBorderArcs,
  decodeCountryPolygonsCached,
  decodeRings,
  type TopoLand,
} from '../core/topojson.js';
import { FLAT_LAYER_ATTR, FLAT_LAYER_NAME } from './layers.js';
import { flatBorderPoints, roundPixel } from './borderPolylines.js';
import { flatCountryPaths } from './countryPaths.js';
import { flatArcGeometry, type FlatArcGeometry } from './routePath.js';
import {
  DEFAULT_MAX_ROUTE_ZOOM,
  DEFAULT_MIN_ROUTE_ZOOM,
  DEFAULT_ZOOM_DURATION_MS,
  MULTI_LEG_DURATION_FACTOR,
  buildViewPath,
  fitPointsView,
  fitWorldView,
  isWorldFraming,
  pathProgress,
  screenSpaceScale,
  viewAlongPath,
  type FlatPoint,
  type FlatView,
  type FlatViewport,
  type ViewPath,
} from './framing.js';
import {
  easeFactor,
  flatCamera3DTransforms,
  followCentre,
  resolveFlatCamera3D,
  zoomStep,
  type FlatCamera3DOptions,
  type ResolvedFlatCamera3D,
} from './camera3d.js';
import { PlaneIcon, type PlaneIconSource } from '../routes/PlaneIcon.js';
import { PlaneScheduler, type FlightLeg } from '../routes/PlaneScheduler.js';
import { easeInOutCubic } from '../routes/easing.js';
import type { ResolvedPathStyle, RouteStyleOptions } from '../routes/routeStyle.js';
import {
  dashArrayPx,
  dashFlowPerSecond,
  resolveRouteStyle,
  type ResolvedRouteStyle,
} from '../routes/routeStyle.js';
import {
  flatLabelPlacement,
  resolveCityLabelStyle,
  svgLabelAttrs,
  type CityLabelTextStyle,
  type ResolvedCityLabelStyle,
} from '../labels/textStyle.js';
import {
  resolveAirportsStyle,
  AIRPORT_DOT_RADIUS_FLAT,
  type AirportsStyleOptions,
  type ResolvedAirportEndpoint,
  type ResolvedAirportsStyle,
} from '../routes/airportStyle.js';
import { CITIES } from '../cities.js';
import { blinkPhase } from '../markers/blinkPattern.js';
import {
  flatCityMarkerCssVars,
  flatCityMarkerSizes,
  resolveCityMarkers,
  type CityMarkersOptions,
  type ResolvedCityMarkers,
} from '../markers/rippleStyle.js';
import {
  PALETTES,
  paletteToFlatTheme,
  resolvePalette,
  type FlatTheme,
  type RouteDotsColors,
  type RouteDotsPalette,
} from '../theme.js';
import type { City, HexTilesOptions, LatLon, MapSurface } from '../types.js';

export type { FlatTheme } from '../theme.js';

/** Theme tables, derived from the RouteDots palette. */
export const FLAT_THEMES: Record<'light' | 'dark', FlatTheme> = {
  light: paletteToFlatTheme(PALETTES.light),
  dark: paletteToFlatTheme(PALETTES.dark),
};

/** The flat world's plane: same icon component as the globe, in SVG. */
export interface FlatPlaneOptions {
  /** Fly the plane at all (default true). */
  enabled?: boolean;
  /** Icon component: preset name, SVG path data, `PlaneIcon`, or a draw fn. */
  icon?: PlaneIconSource;
  /** Icon colour (defaults to the palette's plane colour). */
  color?: string;
  /** Icon size in map px, tip to tail (default 30). */
  size?: number;
  flightMs?: number;
  pauseMs?: number;
}

export interface FlatRouteMapOptions {
  theme?: 'light' | 'dark';
  /**
   * Map surface: grey country fills with white borders (`countries`, the
   * default) or the dot lattice (`dots`).
   */
  surface?: MapSurface;
  /** Dot spacing in degrees (`dots` surface, default 2). */
  stepDeg?: number;
  /** Replace the bundled land mask. */
  land?: TopoLand;
  /** Country border lines (default enabled). */
  borders?: {
    enabled?: boolean;
    /** Line colour (default: the palette's border colour). */
    color?: string;
    /** Stroke width in px (default 1). */
    width?: number;
  };
  /** Hexagon tile overlay inside country borders. */
  hexTiles?: HexTilesOptions;
  /** Map canvas width in CSS px (default 1600). */
  width?: number;
  /** Palette overrides — the same object as the `colors` option. */
  colors?: RouteDotsColors;
  /** Route styling; the same shape as the globe's `route` option. */
  route?: RouteStyleOptions;
  /** City-name label text style (font, size, weight, colours, halo). */
  labels?: CityLabelTextStyle;
  /** Source / destination airport styling (endpoint dot, pulse ring). */
  airports?: AirportsStyleOptions;
  /** Blinking city dots + ripple rings (default enabled). */
  cities?: CityMarkersOptions & { list?: readonly City[] };
  /** The plane and its icon component. */
  plane?: FlatPlaneOptions;
  /** Flight time / pause for the plane (ms) — legacy aliases of `plane.*`. */
  flightMs?: number;
  pauseMs?: number;
  /** 3D camera effect: perspective, tilt, depth layers, orbit, follow. */
  camera3d?: FlatCamera3DOptions;
  /**
   * Ease the camera to the route before drawing it (default `true`). With
   * `false` the map stays on the world view and the route is drawn straight
   * away — `frameRoute: false` on `RouteDots` does the same thing.
   */
  zoomToRoute?: boolean;
  /** How long the zoom takes, in ms (default 900; `0` draws instantly). */
  zoomDurationMs?: number;
  /**
   * Tightest the camera may get when framing a route, **as a multiple of the
   * whole-world view** (default `4`). A close city pair is framed by its own
   * fit, never further in than this.
   */
  maxRouteZoom?: number;
  /**
   * Loosest the camera may get when framing a route, as a multiple of the
   * whole-world view (default `1` — the world view itself, so both airports
   * always fit). Below `1` allows a little sea around the map; above `1` keeps
   * the frame tighter than the world (very long routes may then be cropped).
   */
  minRouteZoom?: number;
}

interface FlatRouteOptions {
  roundTrip?: boolean;
}

/** A route endpoint; `name` (when given) renders a text label. */
export interface FlatRoutePoint extends LatLon {
  name?: string;
}

const CITY_CSS = `
@keyframes rd-city-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: var(--rd-city-dot-dim, 0.45); }
}
@keyframes rd-city-pulse {
  0% { transform: scale(1); opacity: var(--rd-city-ring-opacity, 0.55); }
  100% { transform: scale(var(--rd-city-ring-grow, 3.6)); opacity: 0; }
}
.rd-city-dot {
  animation: rd-city-blink var(--rd-city-period, 2600ms) linear infinite;
}
.rd-city-ring {
  transform-box: fill-box;
  transform-origin: center;
  animation: rd-city-pulse var(--rd-city-period, 2600ms) linear infinite;
}
@keyframes rd-dash-flow {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: calc(var(--rd-dash-dir, 1) * var(--rd-dash-period, 20px)); }
}
.rd-dash-flow {
  animation: rd-dash-flow var(--rd-dash-duration, 1000ms) linear infinite;
}
`;

let cityCssInjected = false;

function injectCityStyles(): void {
  if (cityCssInjected || typeof document === 'undefined') return;
  cityCssInjected = true;
  const style = document.createElement('style');
  style.textContent = CITY_CSS;
  document.head.appendChild(style);
}

const NS = 'http://www.w3.org/2000/svg';

/** Follow-chase strength for the flat camera (per second). */
const FOLLOW_EASE_PER_SECOND = 3;

/**
 * The country fills are a canvas painted once in map px. At a route close-up
 * the map can zoom several times over, so the canvas is rendered at 2× and
 * down-scaled by CSS — coastlines stay clean instead of going soft.
 */
const SURFACE_SUPERSAMPLE = 2;

/** True when the visitor asked the OS for fewer animations. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Transform precision for the camera. Two decimals (the `roundPixel` used for
 * geometry) is too coarse for a slow zoom: it steps the scale in ~1 % jumps,
 * which reads as stutter. Scale keeps five decimals, positions stay sub-pixel.
 */
const roundTransform = (value: number): number => Math.round(value * 1e5) / 1e5;

/** A city name attached to an airport dot (map px anchor). */
interface FlatLabel {
  el: SVGTextElement;
  x: number;
  y: number;
}

/** A point along a camera move where something else happens (once). */
interface ViewMilestone {
  at: number;
  run: () => void;
  fired?: boolean;
}

/** A camera move that is played out over time. */
interface ViewTween {
  path: ViewPath;
  start: number;
  duration: number;
  milestones: ViewMilestone[];
  onDone: (() => void) | null;
}

/** The SVG element + its configured (screen px) size, before zoom scaling. */
interface ScaledCircle {
  el: SVGCircleElement;
  radius: number;
  strokeWidth?: number;
}

export class FlatRouteMap {
  private readonly container: HTMLElement;
  private readonly viewportEl: HTMLDivElement;
  private readonly worldEl: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly bordersSvg: SVGSVGElement;
  private readonly citiesSvg: SVGSVGElement;
  private readonly routesSvg: SVGSVGElement;
  private readonly borderGroup: SVGGElement;
  private readonly cityGroup: SVGGElement;
  private readonly routeGroup: SVGGElement;
  private readonly planeGroup: SVGGElement;
  private readonly width: number;
  private readonly height: number;

  private options: FlatRouteMapOptions;
  private palette: RouteDotsPalette;
  private theme: FlatTheme;
  private routeStyle: ResolvedRouteStyle;
  private cityStyle: ResolvedCityMarkers;
  private labelStyle: ResolvedCityLabelStyle;
  private airportStyle: ResolvedAirportsStyle;
  private planeIcon: PlaneIcon;
  private camera: ResolvedFlatCamera3D;
  private view: FlatView = { scale: 1, cx: 0, cy: 0 };
  private route: { from: FlatRoutePoint; to: FlatRoutePoint; roundTrip: boolean } | null = null;
  private rafId = 0;
  private routeStart: number | null = null;
  private outboundPath: SVGPathElement | null = null;
  private planeStage: { x: number; y: number } | null = null;
  private lastGeometries: FlatArcGeometry[] = [];
  private labelEls: FlatLabel[] = [];
  private markerEls: SVGCircleElement[] = [];
  private planeScheduler: PlaneScheduler | null = null;
  private planeLeg: FlightLeg = 'outbound';
  private following = false;
  private lastFrameMs = 0;
  private pointerDown = false;
  private lastPointer = { x: 0, y: 0 };
  private readonly abort = new AbortController();
  /** The camera move currently playing (world → route, route → world…). */
  private tween: ViewTween | null = null;
  /** Airport-city dots, kept screen-sized by `syncOverlayScale`. */
  private cityDots: ScaledCircle[] = [];
  /** Airport-city ripple rings, kept screen-sized by `syncOverlayScale`. */
  private cityRings: ScaledCircle[] = [];
  /** True once the route's arcs/markers/labels are on the map. */
  private routeDrawn = false;
  /** True once the world view has been fitted to a real viewport size. */
  private framed = false;
  /** Last viewport the framing was computed for, in CSS px. */
  private lastViewport: FlatViewport = { w: 0, h: 0 };
  private resizeObserver: ResizeObserver | null = null;

  /**
   * Called once the route has actually been drawn — after the zoom-in
   * finishes, not when `setRoute` was requested. Mirrors the 3D world's
   * `RouteLayer.onDrawn`.
   */
  onDrawn: (() => void) | null = null;

  constructor(container: HTMLElement, options: FlatRouteMapOptions = {}) {
    this.container = container;
    this.options = { ...options };
    this.width = options.width ?? 1600;
    this.height = this.width / 2;

    const themeName = options.theme ?? 'light';
    this.palette = resolvePalette(themeName, options.colors);
    this.theme = paletteToFlatTheme(this.palette);
    this.routeStyle = resolveRouteStyle(themeName, options.route, options.colors);
    this.cityStyle = resolveCityMarkers(options.cities ?? {}, this.palette.cities);
    this.labelStyle = resolveCityLabelStyle(this.palette, options.labels);
    this.airportStyle = resolveAirportsStyle(
      this.palette,
      options.airports,
      AIRPORT_DOT_RADIUS_FLAT,
    );
    this.planeIcon = PlaneIcon.from(options.plane?.icon);
    this.camera = resolveFlatCamera3D(options.camera3d);

    // The map is absolutely positioned inside the host, so the host must be a
    // containing block — but never take over a position the host already set:
    // an `absolute; inset: 0` hero would collapse to zero height if it were
    // switched to `relative` (which is exactly how a full-bleed hero mounts).
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.backgroundColor = this.theme.bg;
    container.style.perspectiveOrigin = '50% 50%';

    // The stage's coordinate space is exactly the map's pixel space
    // (width × height), so canvas, SVG viewBox and framing math all agree.
    // viewport → world (3D camera) → stage (pan/zoom) → the map layers.
    this.viewportEl = document.createElement('div');
    this.viewportEl.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
    container.appendChild(this.viewportEl);

    this.worldEl = document.createElement('div');
    this.worldEl.style.cssText = 'position:absolute;inset:0;transform-origin:50% 50%;';
    this.viewportEl.appendChild(this.worldEl);

    this.stage = document.createElement('div');
    this.stage.style.position = 'absolute';
    this.stage.style.left = '0';
    this.stage.style.top = '0';
    this.stage.style.width = `${this.width}px`;
    this.stage.style.height = `${this.height}px`;
    this.stage.style.transformOrigin = '0 0';
    // The zoom is driven frame-by-frame (see `frame`), so a CSS transition on
    // top of it would only lag every step behind.
    this.stage.style.transition = 'none';
    this.stage.style.willChange = 'transform';
    this.worldEl.appendChild(this.stage);

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width * SURFACE_SUPERSAMPLE;
    this.canvas.height = this.height * SURFACE_SUPERSAMPLE;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.position = 'absolute';
    this.canvas.style.left = '0';
    this.canvas.style.top = '0';
    this.canvas.setAttribute(FLAT_LAYER_ATTR, FLAT_LAYER_NAME.surface);
    this.stage.appendChild(this.canvas);

    const svg = (layer: string, zIndex: number): SVGSVGElement => {
      const el = document.createElementNS(NS, 'svg');
      el.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
      el.style.position = 'absolute';
      el.style.inset = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.pointerEvents = 'none';
      el.style.zIndex = String(zIndex);
      el.setAttribute(FLAT_LAYER_ATTR, layer);
      this.stage.appendChild(el);
      return el;
    };
    const group = (parent: SVGSVGElement): SVGGElement => {
      const el = document.createElementNS(NS, 'g');
      parent.appendChild(el);
      return el;
    };

    this.bordersSvg = svg(FLAT_LAYER_NAME.borders, 1);
    this.borderGroup = group(this.bordersSvg);
    this.citiesSvg = svg(FLAT_LAYER_NAME.cities, 2);
    this.cityGroup = group(this.citiesSvg);
    this.routesSvg = svg(FLAT_LAYER_NAME.routes, 3);
    this.routeGroup = group(this.routesSvg);
    this.planeGroup = group(this.routesSvg);

    injectCityStyles();
    this.renderSurface();
    this.renderBorders();
    this.renderCities();
    this.buildPlaneIcon();
    // Rest on the whole world — the map opens wide, not cropped.
    this.frameWorldView();
    this.applyCamera();
    this.bindInteraction();
    this.observeSize();

    this.lastFrameMs = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  /** The palette in use (theme + `colors` merged). */
  get activePalette(): RouteDotsPalette {
    return this.palette;
  }

  /** The resolved route style in use (colours, angles, dashes). */
  get activeRouteStyle(): ResolvedRouteStyle {
    return this.routeStyle;
  }

  /** The resolved city marker style (dot + ripple numbers). */
  get activeCityStyle(): ResolvedCityMarkers {
    return this.cityStyle;
  }

  /** The resolved city-name label text style. */
  get activeLabelStyle(): ResolvedCityLabelStyle {
    return this.labelStyle;
  }

  /** The resolved source / destination airport styles. */
  get activeAirports(): ResolvedAirportsStyle {
    return this.airportStyle;
  }

  /** The resolved 3D camera settings. */
  get camera3d(): ResolvedFlatCamera3D {
    return { ...this.camera };
  }

  /**
   * Draws a route: zoom to it first, then paint it.
   *
   * From the world view the camera eases straight into a frame that holds both
   * airports and the arc between them. When a route is **already on screen**
   * (the visitor picked another destination) it first pulls back out to the
   * whole world — the old route riding the zoom-out — and only then dives into
   * the new pair, so a city change reads as a flight plan being redrawn rather
   * than a pan between two close-ups. The arcs, airport dots, city names and
   * plane appear once the dive has landed, so the route is "flown to" rather
   * than stamped on a moving map. `zoomToRoute: false` (or `zoomDurationMs:
   * 0`) draws immediately.
   */
  setRoute(origin: FlatRoutePoint, dest: FlatRoutePoint, options: FlatRouteOptions = {}): void {
    const previousDrawn = this.routeDrawn;
    this.route = { from: origin, to: dest, roundTrip: options.roundTrip === true };
    this.tween = null;
    const viewport = this.viewportSize();
    this.lastViewport = viewport;
    this.framed = true;
    // Not laid out yet (a hidden hero): draw now and frame on the first
    // resize once the host has a size.
    if (viewport.w < 2 || viewport.h < 2) {
      this.clearRouteVisuals();
      this.drawRoute();
      return;
    }

    // `zoomToRoute: false` means "draw it where the camera is": the world
    // view stays put and the route appears at once.
    const target = this.options.zoomToRoute === false ? null : this.routeView();
    if (!target) {
      this.clearRouteVisuals();
      this.drawRoute();
      return;
    }

    const world = this.worldView();
    // A new flight chosen from an existing, zoomed-in one: **one** continuous
    // move out to the whole world and back into the new pair. The old route
    // rides the pull-back and leaves exactly as the camera passes the world
    // view; the new route is drawn when the dive lands. It is a single path
    // with each leg eased (`pathProgress`), so the camera settles onto the
    // wide view and sweeps on rather than stopping or bouncing there.
    if (previousDrawn && this.zoomDuration() > 0 && !isWorldFraming(this.view, world)) {
      const path = buildViewPath([this.view, world, target]);
      this.startTween(
        path,
        3,
        [{ at: path.stops[1] ?? 0.5, run: () => this.clearRouteVisuals() }],
        () => this.drawRoute(),
      );
      return;
    }

    this.clearRouteVisuals();
    this.zoomTo(target, () => this.drawRoute());
  }

  /**
   * Removes the current route, and eases the map back out to the whole world
   * (the framing a visitor sees before choosing a flight).
   */
  clearRoute(): void {
    this.route = null;
    this.tween = null;
    this.clearRouteVisuals();
    this.zoomTo(this.worldView(), null, this.options.zoomToRoute === false ? 0 : undefined);
  }

  /** Applies new options live (theme/colour pickers, sliders, icon swaps). */
  applyStyle(options: Partial<FlatRouteMapOptions>): void {
    const previous = this.options;
    this.options = { ...previous, ...options };
    const themeName = this.options.theme ?? 'light';
    this.palette = resolvePalette(themeName, this.options.colors);
    this.theme = paletteToFlatTheme(this.palette);
    this.routeStyle = resolveRouteStyle(themeName, this.options.route, this.options.colors);
    this.cityStyle = resolveCityMarkers(this.options.cities ?? {}, this.palette.cities);
    this.labelStyle = resolveCityLabelStyle(this.palette, this.options.labels);
    this.airportStyle = resolveAirportsStyle(
      this.palette,
      this.options.airports,
      AIRPORT_DOT_RADIUS_FLAT,
    );
    this.container.style.backgroundColor = this.theme.bg;

    if (
      options.surface !== undefined ||
      options.stepDeg !== undefined ||
      options.width !== undefined ||
      options.land !== undefined ||
      options.hexTiles !== undefined ||
      options.colors !== undefined ||
      options.theme !== undefined
    ) {
      this.renderSurface();
    }
    if (
      options.borders !== undefined ||
      options.colors !== undefined ||
      options.theme !== undefined
    ) {
      this.renderBorders();
    }
    if (
      options.cities !== undefined ||
      options.colors !== undefined ||
      options.theme !== undefined
    ) {
      this.renderCities();
    }
    if (
      options.plane !== undefined ||
      options.colors !== undefined ||
      options.theme !== undefined
    ) {
      this.applyPlaneOptions();
    }
    if (options.camera3d !== undefined) {
      // Re-resolve before pushing the transforms: the merged options are in
      // `this.options` already, but the resolved camera still holds the old
      // numbers.
      this.camera = resolveFlatCamera3D(this.options.camera3d);
      this.applyCamera();
    }
    if (
      (options.route !== undefined ||
        options.colors !== undefined ||
        options.theme !== undefined) &&
      this.routeDrawn &&
      this.route
    ) {
      // Restyle the arcs in place — the camera stays exactly where it is, so a
      // slider drag never re-runs the zoom.
      this.renderRoutes();
    } else {
      // Restyle in place — no route rebuild, no re-framing.
      if (options.labels !== undefined) this.renderRouteLabels();
      if (options.airports !== undefined) this.renderEndpointMarkers();
    }
    // Label / airport restyles still need the screen-space compensation of the
    // current zoom.
    this.syncOverlayScale();
  }

  /**
   * Re-frames the current view (used on resize): the route stays framed, and
   * without a route the whole world is fitted again.
   */
  reframe(): void {
    this.tween = null;
    this.lastViewport = this.viewportSize();
    this.framed = true;
    if (this.route) {
      const target = this.routeView();
      if (target) {
        this.view = target;
        this.applyView();
      }
      if (!this.routeDrawn) this.drawRoute();
      return;
    }
    this.view = this.worldView();
    this.applyView();
  }

  /** The map's current framing (scale + centre in map px) — for tests/demos. */
  getViewState(): { scale: number; cx: number; cy: number } {
    return { ...this.view };
  }

  /** True once the current route's arcs and airports are on the map. */
  get isRouteDrawn(): boolean {
    return this.routeDrawn;
  }

  /** Restyles / re-aims the 3D camera. */
  setCamera3D(options: Partial<FlatCamera3DOptions>): void {
    this.options.camera3d = { ...this.options.camera3d, ...options };
    this.camera = resolveFlatCamera3D(this.options.camera3d);
    this.applyCamera();
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.tween = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.abort.abort();
    this.container.innerHTML = '';
  }

  /** The container's size in CSS px (never zero, so the maths stays finite). */
  private viewportSize(): FlatViewport {
    return {
      w: Math.max(1, this.container.clientWidth || 0),
      h: Math.max(1, this.container.clientHeight || 0),
    };
  }

  /** The map's own size, in map px. */
  private mapSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** The resting framing: the whole planet, letterboxed in the viewport. */
  private worldView(): FlatView {
    return fitWorldView(this.mapSize(), this.viewportSize());
  }

  /**
   * The framing a route deserves: both airports and the arc between them,
   * with a screen-space margin so the airport dots and city names never touch
   * the viewport edge. Zoom is capped, and it never pulls back further than
   * the world view.
   */
  private routeView(): FlatView | null {
    const route = this.route;
    if (!route) return null;
    const geometry = flatArcGeometry({
      from: route.from,
      to: route.to,
      project: (point) => this.project(point),
      angle: this.routeStyle.outbound.angle,
    });
    const points: FlatPoint[] = [geometry.from, geometry.control, geometry.to].map(([x, y]) => ({
      x,
      y,
    }));
    // The configured limits are multiples of the world view, so they mean the
    // same thing on a phone and on a full-bleed hero.
    const worldScale = this.worldView().scale;
    const floor = worldScale * Math.max(0.05, this.options.minRouteZoom ?? DEFAULT_MIN_ROUTE_ZOOM);
    const ceiling =
      worldScale * Math.max(0.05, this.options.maxRouteZoom ?? DEFAULT_MAX_ROUTE_ZOOM);
    return fitPointsView(points, this.mapSize(), this.viewportSize(), {
      minScale: floor,
      maxScale: Math.max(floor, ceiling),
    });
  }

  /** Snaps to the whole-world framing (mount, resize, cleared route). */
  private frameWorldView(): void {
    const viewport = this.viewportSize();
    if (viewport.w < 2 || viewport.h < 2) return;
    this.lastViewport = viewport;
    this.framed = true;
    this.view = this.worldView();
    this.applyView();
  }

  /**
   * How long a camera move should take, honouring reduced-motion preferences.
   * A multi-leg move (out to the world and back in) gets a longer budget, so
   * the extra travel does not make it feel rushed.
   */
  private zoomDuration(legs = 1, overrideMs?: number): number {
    const base = overrideMs ?? this.options.zoomDurationMs ?? DEFAULT_ZOOM_DURATION_MS;
    if (!Number.isFinite(base) || base <= 0) return 0;
    if (prefersReducedMotion()) return 0;
    const factor = legs > 2 ? MULTI_LEG_DURATION_FACTOR : 1;
    return Math.min(12_000, Math.round(base * factor));
  }

  /**
   * Plays a camera move along `path`; calls `onDone` when it lands (or at
   * once, for reduced motion / `zoomDurationMs: 0`).
   */
  private startTween(
    path: ViewPath,
    legs: number,
    milestones: ViewMilestone[],
    onDone: (() => void) | null,
    durationMs?: number,
  ): void {
    this.following = false;
    const target = path.views[path.views.length - 1] ?? this.view;
    const duration = this.zoomDuration(legs, durationMs);
    if (duration <= 0) {
      this.tween = null;
      this.view = { ...target };
      this.applyView();
      for (const milestone of milestones) {
        milestone.fired = true;
        milestone.run();
      }
      onDone?.();
      return;
    }
    this.tween = {
      path,
      start: performance.now(),
      duration,
      milestones,
      onDone,
    };
  }

  /** Eases the camera to `to` (one leg); calls `onDone` when it lands. */
  private zoomTo(to: FlatView, onDone: (() => void) | null, durationMs?: number): void {
    this.startTween(buildViewPath([this.view, to]), 1, [], onDone, durationMs);
  }

  /** Plays one frame of the running camera move (if any). */
  private stepTween(now: number): void {
    const tween = this.tween;
    if (!tween) return;
    const elapsed = tween.duration > 0 ? (now - tween.start) / tween.duration : 1;
    const progress = Math.min(1, Math.max(0, elapsed));
    // Each leg is eased on its own (see `pathProgress`): the camera settles
    // onto a middle keyframe instead of bouncing through it at full speed, and
    // milestones live in *path* space, so they fire on the position, not the
    // clock.
    const position = pathProgress(tween.path, progress);
    this.view = viewAlongPath(tween.path, position);
    this.applyView();
    for (const milestone of tween.milestones) {
      if (!milestone.fired && position >= milestone.at) {
        milestone.fired = true;
        milestone.run();
      }
    }
    if (progress < 1) return;
    this.tween = null;
    tween.onDone?.();
  }

  /**
   * Keeps the world fitted while the host is laid out (a hero can mount
   * hidden or zero-sized) and on every resize. Only runs without a route —
   * with a route, `reframe()` owns the framing.
   */
  private ensureWorldView(): void {
    if (this.route || this.tween) return;
    const viewport = this.viewportSize();
    if (viewport.w < 2 || viewport.h < 2) return;
    if (this.framed && viewport.w === this.lastViewport.w && viewport.h === this.lastViewport.h) {
      return;
    }
    this.frameWorldView();
  }

  /**
   * Re-frames on container resize (the route stays framed).
   *
   * The observer also fires once as soon as it starts watching: that first
   * call must not disturb a zoom that is already playing (a route set at
   * mount), so only a *changed* size re-frames.
   */
  private observeSize(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      const viewport = this.viewportSize();
      if (viewport.w === this.lastViewport.w && viewport.h === this.lastViewport.h) return;
      this.reframe();
    });
    this.resizeObserver.observe(this.container);
  }

  /** Removes the route's SVG elements and stops its plane. */
  private clearRouteVisuals(): void {
    this.routeGroup.innerHTML = '';
    this.outboundPath = null;
    this.planeStage = null;
    this.routeStart = null;
    this.routeDrawn = false;
    this.planeScheduler = null;
    this.labelEls = [];
    this.markerEls = [];
    this.lastGeometries = [];
    this.planeGroup.style.display = 'none';
  }

  /** Paints the route that is already framed (called when the zoom lands). */
  private drawRoute(): void {
    if (!this.route) return;
    this.renderRoutes();
    this.routeDrawn = true;
    this.routeStart = performance.now();
    this.planeScheduler?.reset(this.routeStart);
    this.planeGroup.style.display = 'none';
    this.syncOverlayScale();
    this.onDrawn?.();
  }

  /**
   * Counter-scales the screen-space overlay (city names, airport dots) so the
   * configured px sizes survive the zoom.
   */
  private syncOverlayScale(): void {
    const k = screenSpaceScale(this.view.scale);
    for (const marker of this.markerEls) {
      const cx = Number(marker.getAttribute('cx'));
      const cy = Number(marker.getAttribute('cy'));
      marker.setAttribute(
        'transform',
        `translate(${roundPixel(cx)} ${roundPixel(cy)}) scale(${roundTransform(
          k,
        )}) translate(${roundPixel(-cx)} ${roundPixel(-cy)})`,
      );
    }
    for (const label of this.labelEls) this.placeLabel(label);
    // The airport-city dots and their ripples are markers on the map, not
    // geography: they keep their configured px size however far the map zooms.
    this.scaleMarkers(this.cityDots, k);
    this.scaleMarkers(this.cityRings, k);
  }

  /**
   * Applies the screen-space factor to a list of circles: radius (and stroke
   * width, for rings) shrink as the map zooms, so their px size stays put.
   */
  private scaleMarkers(list: readonly ScaledCircle[], k: number): void {
    for (const marker of list) {
      marker.el.setAttribute('r', String(roundTransform(Math.max(0.05, marker.radius * k))));
      if (marker.strokeWidth !== undefined) {
        marker.el.setAttribute(
          'stroke-width',
          String(roundTransform(Math.max(0.05, marker.strokeWidth * k))),
        );
      }
    }
  }

  /** Positions + scales one city label for the current view. */
  private placeLabel(label: FlatLabel): void {
    const placement = flatLabelPlacement({ x: label.x, y: label.y }, this.view.scale, {
      scaleWithZoom: this.labelStyle.scaleWithZoom,
    });
    const x = roundPixel(placement.x);
    const y = roundPixel(placement.y);
    label.el.setAttribute('x', String(x));
    label.el.setAttribute('y', String(y));
    label.el.setAttribute(
      'transform',
      `translate(${x} ${y}) scale(${roundTransform(placement.scale)}) translate(${roundPixel(
        -x,
      )} ${roundPixel(-y)})`,
    );
  }

  /** Projects lat/lng to map pixel coordinates (equirectangular). */
  private project(p: LatLon): [number, number] {
    return [((p.lng + 180) / 360) * this.width, ((90 - p.lat) / 180) * this.height];
  }

  /**
   * The surface canvas context, in **map px**: the bitmap is supersampled, so
   * every drawing call stays in the map's own coordinate space.
   */
  private surfaceContext(): CanvasRenderingContext2D | null {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(SURFACE_SUPERSAMPLE, 0, 0, SURFACE_SUPERSAMPLE, 0, 0);
    return ctx;
  }

  /** Paints the grey country fills (even-odd, so enclaves stay empty). */
  private renderSurface(): void {
    if ((this.options.surface ?? 'countries') === 'dots') {
      this.renderDots(this.options.stepDeg ?? 2, (this.options.land ?? landTopo) as TopoLand);
      return;
    }
    const ctx = this.surfaceContext();
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = this.theme.land;
    for (const path of flatCountryPaths(
      decodeCountryPolygonsCached(countriesTopo),
      this.width,
      this.height,
    )) {
      ctx.fill(new Path2D(path), 'evenodd');
    }
    // Optional hex tile overlay inside country borders.
    if (this.options.hexTiles?.enabled) {
      this.renderHexTiles(this.options.hexTiles);
    }
  }

  /**
   * Draws pointy-top hex tiles inside country polygons — same axial grid as
   * the globe overlay, rasterised directly to the flat canvas.
   */
  private renderHexTiles(hexOpts: HexTilesOptions): void {
    const ctx = this.surfaceContext();
    if (!ctx) return;
    const polygons = decodeCountryPolygonsCached(countriesTopo);
    const pattern = buildHexGrid(polygons, {
      spacingDeg: hexOpts.spacingDeg,
      sizeDeg: hexOpts.sizeDeg,
      insetDeg: hexOpts.insetDeg,
    });
    const fillColor = hexOpts.color ?? this.theme.border;
    const opacity = hexOpts.opacity ?? 0.35;

    ctx.save();
    ctx.fillStyle = fillColor;
    ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
    for (const tile of pattern.tiles) {
      const [cx, cy] = this.project(tile);
      const radiusPx = Math.max(1, (tile.sizeDeg / 360) * this.width);
      // Antimeridian wrap: a tile sitting on the seam is drawn on both sides
      // of the map, so the cylinder reads as continuous.
      const draws: [number, number][] = [[cx, cy]];
      if (tile.lng > 180 - pattern.spacingDeg) draws.push([cx - this.width, cy]);
      if (tile.lng < -180 + pattern.spacingDeg) draws.push([cx + this.width, cy]);
      for (const [px, py] of draws) this.drawFlatHex(ctx, px, py, radiusPx);
    }
    ctx.restore();
  }

  /** Draws one pointy-top regular hexagon centred at (cx, cy) in canvas px. */
  private drawFlatHex(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 6 + (Math.PI / 3) * i;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  private renderDots(stepDeg: number, topo: TopoLand): void {
    const pattern = buildDotGrid(decodeRings(topo), { stepDeg });
    const ctx = this.surfaceContext();
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = this.theme.dot;
    const r = Math.max(1.2, (0.62 / 360) * this.width * 1.15);
    for (const dot of pattern.dots) {
      const [x, y] = this.project(dot);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Blinking dots + expanding ripple rings at every airport city, under the
   * routes. Every number comes from the resolved city style, so the globe and
   * the flat world share one ripple definition; phases are spread with the
   * same golden-ratio offsets as the WebGL layer (the CSS animation delay is
   * simply the negative phase).
   */
  private renderCities(): void {
    this.cityGroup.innerHTML = '';
    this.cityDots = [];
    this.cityRings = [];
    if (this.options.cities?.enabled === false) return;
    const style = this.cityStyle;
    const sizes = flatCityMarkerSizes(style);
    for (const [name, value] of Object.entries(flatCityMarkerCssVars(style))) {
      this.cityGroup.style.setProperty(name, value);
    }
    const cities = this.options.cities?.list ?? CITIES;
    cities.forEach((city, index) => {
      const [x, y] = this.project(city);
      const delay = `${Math.round(-blinkPhase(index) * style.ripple.periodMs)}ms`;
      if (style.ripple.enabled) {
        const ring = document.createElementNS(NS, 'circle');
        ring.setAttribute('class', 'rd-city-ring');
        ring.setAttribute('cx', String(roundPixel(x)));
        ring.setAttribute('cy', String(roundPixel(y)));
        ring.setAttribute('r', String(roundPixel(sizes.ringRadius)));
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', style.ripple.color);
        ring.setAttribute('stroke-width', String(roundPixel(sizes.ringWidth)));
        ring.style.animationDelay = delay;
        this.cityGroup.appendChild(ring);
        this.cityRings.push({ el: ring, radius: sizes.ringRadius, strokeWidth: sizes.ringWidth });
      }
      if (style.dot.enabled) {
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('class', 'rd-city-dot');
        dot.setAttribute('cx', String(roundPixel(x)));
        dot.setAttribute('cy', String(roundPixel(y)));
        dot.setAttribute('r', String(roundPixel(sizes.dotRadius)));
        dot.setAttribute('fill', style.dot.color);
        dot.setAttribute('opacity', String(style.dot.dim));
        dot.style.animationDelay = delay;
        this.cityGroup.appendChild(dot);
        this.cityDots.push({ el: dot, radius: sizes.dotRadius });
      }
    });
    // Keep the markers at their configured px size for the current zoom.
    const k = screenSpaceScale(this.view.scale);
    this.scaleMarkers(this.cityDots, k);
    this.scaleMarkers(this.cityRings, k);
  }

  /** Draws the country borders as SVG polylines under the city layer. */
  private renderBorders(): void {
    this.borderGroup.innerHTML = '';
    if (this.options.borders?.enabled === false) return;
    const rings = decodeBorderArcs(countriesTopo);
    const points = flatBorderPoints(rings, this.width, this.height);
    for (const pts of points) {
      const el = document.createElementNS(NS, 'polyline');
      el.setAttribute('points', pts);
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', this.options.borders?.color ?? this.theme.border);
      el.setAttribute('stroke-width', String(this.options.borders?.width ?? 1));
      // Hairlines stay hairlines when the map zooms into a route.
      el.setAttribute('vector-effect', 'non-scaling-stroke');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('stroke-linecap', 'round');
      this.borderGroup.appendChild(el);
    }
  }

  /**
   * (Re)builds the route's SVG: arcs, airport dots and city names. The camera
   * is not touched — framing is the caller's job (`setRoute` / `reframe`), so
   * a live restyle never re-runs the zoom.
   */
  private renderRoutes(): void {
    this.routeGroup.innerHTML = '';
    this.outboundPath = null;
    this.planeStage = null;
    this.labelEls = [];
    this.markerEls = [];
    this.planeLeg = 'outbound';
    const route = this.route;
    if (!route) return;

    const geometries: FlatArcGeometry[] = [];
    // Single edge by default for both one-way and round-trip: one shared
    // path; round trips fly the plane along it in both directions. Pass
    // dualEdge via route to opt into two visually distinct arcs.
    const outbound = this.addArc(route.from, route.to, this.routeStyle.outbound, 1);
    if (outbound) {
      geometries.push(outbound.geometry);
      this.outboundPath = outbound.path;
    }

    const plane = this.options.plane ?? {};
    this.planeScheduler = new PlaneScheduler({
      flightMs: plane.flightMs ?? this.options.flightMs,
      pauseMs: plane.pauseMs ?? this.options.pauseMs,
      roundTrip: route.roundTrip,
    });

    const [x1, y1] = this.project(route.from);
    const [x2, y2] = this.project(route.to);
    this.renderEndpointMarkers([
      { x: x1, y: y1, style: this.airportStyle.source },
      { x: x2, y: y2, style: this.airportStyle.destination },
    ]);

    // City-name labels (only when the caller provides names).
    if (route.from.name) this.addLabel(x1, y1, route.from.name);
    if (route.to.name) this.addLabel(x2, y2, route.to.name);

    this.lastGeometries = geometries;
  }

  private addArc(
    from: LatLon,
    to: LatLon,
    style: ResolvedPathStyle,
    bulgeScale: number,
  ): { path: SVGPathElement; geometry: FlatArcGeometry } | null {
    const geometry = flatArcGeometry({
      from,
      to,
      project: (point) => this.project(point),
      angle: style.angle,
      bulgeScale,
    });
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', geometry.d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', style.dash?.color ?? style.color);
    path.setAttribute('stroke-width', String(roundPixel(style.strokeWidth)));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-opacity', String(roundPixel(style.opacity)));
    // The stroke is authored in px: keep it px-wide at every zoom level.
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    this.routeGroup.appendChild(path);

    // Dashes are measured in px on the real path. A route-fraction pattern
    // scales with the path; a world-unit pattern keeps a fixed px length —
    // the flat map's twin of the globe's fixed arc length, so both worlds
    // show the same dashes on the same route.
    const length = typeof path.getTotalLength === 'function' ? path.getTotalLength() : 0;
    const worldToPx = this.width / (2 * Math.PI);
    if (style.dash) {
      const [dash, gap] = dashArrayPx(style.dash, length, worldToPx);
      path.setAttribute('stroke-dasharray', `${roundPixel(dash)} ${roundPixel(gap)}`);
      if (style.dash.speed > 0) {
        // --rd-dash-dir flips sign to reverse dash flow on return legs.
        path.style.setProperty('--rd-dash-period', `${roundPixel(dash + gap)}px`);
        const flow = dashFlowPerSecond(style.dash, length / worldToPx);
        path.style.setProperty(
          '--rd-dash-duration',
          `${Math.round(1000 / Math.max(0.001, flow))}ms`,
        );
        path.style.setProperty('--rd-dash-dir', '1');
        path.setAttribute('class', 'rd-dash-flow');
      }
    }
    return { path, geometry };
  }

  /** Flips dash-flow direction on the shared edge to match `leg`. */
  private setDashDirection(leg: FlightLeg): void {
    if (!this.outboundPath) return;
    this.outboundPath.style.setProperty('--rd-dash-dir', leg === 'return' ? '-1' : '1');
    this.planeLeg = leg;
  }

  /**
   * Adds a haloed city-name label next to an endpoint marker. The label is
   * positioned + counter-scaled for the current zoom by `placeLabel`, so its
   * `labels.fontSize` stays the size on screen.
   */
  private addLabel(x: number, y: number, text: string): void {
    const el = document.createElementNS(NS, 'text');
    el.setAttribute('data-rd-label', 'city');
    this.applyLabelAttrs(el);
    el.textContent = text;
    this.routeGroup.appendChild(el);
    const label: FlatLabel = { el, x, y };
    this.labelEls.push(label);
    this.placeLabel(label);
  }

  /** Applies the resolved label text style to a label element. */
  private applyLabelAttrs(el: SVGTextElement): void {
    for (const [name, value] of Object.entries(svgLabelAttrs(this.labelStyle))) {
      el.setAttribute(name, value);
    }
    // Paint the stroke first so it acts as a halo around the glyphs.
    el.setAttribute('stroke-linejoin', 'round');
  }

  /** Re-styles the existing route labels in place (live `labels` updates). */
  private renderRouteLabels(): void {
    for (const label of this.labelEls) {
      this.applyLabelAttrs(label.el);
      this.placeLabel(label);
    }
  }

  /** (Re)draws the source / destination airport dots. */
  private renderEndpointMarkers(
    endpoints: { x: number; y: number; style: ResolvedAirportEndpoint }[] = [
      ...this.markerPositions(),
    ],
  ): void {
    for (const el of this.markerEls) el.remove();
    this.markerEls = [];
    for (const { x, y, style } of endpoints) {
      const marker = document.createElementNS(NS, 'circle');
      marker.setAttribute('cx', String(roundPixel(x)));
      marker.setAttribute('cy', String(roundPixel(y)));
      marker.setAttribute('r', String(roundPixel(style.size)));
      marker.setAttribute('fill', style.color);
      this.routeGroup.appendChild(marker);
      this.markerEls.push(marker);
    }
  }

  /** Positions + styles of the current route's endpoints (null mid-frame). */
  private markerPositions(): { x: number; y: number; style: ResolvedAirportEndpoint }[] {
    const route = this.route;
    if (!route) return [];
    const [x1, y1] = this.project(route.from);
    const [x2, y2] = this.project(route.to);
    return [
      { x: x1, y: y1, style: this.airportStyle.source },
      { x: x2, y: y2, style: this.airportStyle.destination },
    ];
  }

  /** Builds the plane's icon element (path data, or a rasterized `<image>`). */
  private buildPlaneIcon(): void {
    this.planeGroup.innerHTML = '';
    const color = this.options.plane?.color ?? this.theme.plane;
    const size = this.options.plane?.size ?? 30;
    let element: SVGElement;
    if (this.planeIcon.path) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', this.planeIcon.path);
      path.setAttribute('fill', color);
      const scale = size / this.planeIcon.viewBox;
      path.setAttribute('transform', `scale(${roundPixel(scale)})`);
      element = path;
    } else {
      const href = this.planeIcon.dataUrl(color);
      const image = document.createElementNS(NS, 'image');
      image.setAttribute('href', href ?? '');
      image.setAttribute('x', String(-size / 2));
      image.setAttribute('y', String(-size / 2));
      image.setAttribute('width', String(size));
      image.setAttribute('height', String(size));
      element = image;
    }
    this.planeGroup.appendChild(element);
    this.planeGroup.setAttribute('data-rd-plane', this.planeIcon.name);
    this.planeGroup.style.display = 'none';
    void element;
  }

  /** Re-applies plane options live (icon, colour, size). */
  private applyPlaneOptions(): void {
    this.planeIcon = PlaneIcon.from(this.options.plane?.icon);
    this.buildPlaneIcon();
  }

  /**
   * Pushes `view` to the stage (one transform per frame, no CSS transition on
   * top) and re-fits the screen-space overlay for the new zoom.
   */
  private applyView(): void {
    const { w: vw, h: vh } = this.viewportSize();
    const { scale, cx, cy } = this.view;
    const tx = vw / 2 - cx * scale;
    const ty = vh / 2 - cy * scale;
    this.stage.style.transform = `translate3d(${roundPixel(tx)}px, ${roundPixel(
      ty,
    )}px, 0) scale(${roundTransform(scale)})`;
    this.syncOverlayScale();
  }

  private applyCamera(): void {
    const transforms = flatCamera3DTransforms(this.camera);
    this.container.style.perspective = transforms.viewport;
    this.viewportEl.style.transformStyle = this.camera.enabled ? 'preserve-3d' : '';
    this.viewportEl.style.overflow = 'visible';
    this.worldEl.style.transformStyle = this.camera.enabled ? 'preserve-3d' : '';
    this.worldEl.style.transform = transforms.world;
    this.stage.style.transformStyle = this.camera.enabled ? 'preserve-3d' : '';
    this.canvas.style.transform = this.camera.enabled ? 'translateZ(0px)' : '';
    this.bordersSvg.style.transform = transforms.borderLayer;
    this.citiesSvg.style.transform = transforms.cityLayer;
    this.routesSvg.style.transform = transforms.routeLayer;
    this.applyView();
  }

  private bindInteraction(): void {
    const { signal } = this.abort;
    const el = this.container;
    el.style.touchAction = 'none';
    el.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.camera.enabled || !this.camera.interactive) return;
        this.pointerDown = true;
        this.lastPointer = { x: event.clientX, y: event.clientY };
      },
      { signal },
    );
    el.addEventListener(
      'pointermove',
      (event) => {
        if (!this.pointerDown || !this.camera.interactive) return;
        const dx = event.clientX - this.lastPointer.x;
        const dy = event.clientY - this.lastPointer.y;
        this.lastPointer = { x: event.clientX, y: event.clientY };
        this.setCamera3D({ tilt: this.camera.tilt + dy * 0.3, yaw: this.camera.yaw + dx * 0.3 });
      },
      { signal },
    );
    const endDrag = (): void => {
      this.pointerDown = false;
    };
    el.addEventListener('pointerup', endDrag, { signal });
    el.addEventListener('pointercancel', endDrag, { signal });
    el.addEventListener(
      'wheel',
      (event) => {
        if (!this.camera.enabled || !this.camera.interactive) return;
        event.preventDefault();
        // A hand on the wheel always beats the camera's own zoom.
        this.tween = null;
        this.view = { ...this.view, scale: zoomStep(this.view.scale, event.deltaY) };
        this.applyView();
      },
      { signal, passive: false },
    );
  }

  private frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);
    const dtSec = Math.min(0.05, Math.max(0, (now - this.lastFrameMs) / 1000));
    this.lastFrameMs = now;

    // 1. Keep the resting view honest (mount racing a zero-sized hero, then
    //    any resize), and 2. play the intro zoom. The route is drawn by the
    //    zoom's completion callback, so it appears *after* the camera lands.
    this.ensureWorldView();
    this.stepTween(now);

    if (!this.outboundPath || this.routeStart === null || !this.planeScheduler) {
      this.planeGroup.style.display = 'none';
      return;
    }
    const plane = this.options.plane ?? {};
    if (plane.enabled === false) {
      this.planeGroup.style.display = 'none';
      return;
    }
    // Anchor the scheduler on first frame (setRoute resets it, but the
    // RAF loop may fire before the reset if mount is racing).
    if (this.planeScheduler.progress(now) === null) {
      this.planeScheduler.reset(this.routeStart);
    }
    const state = this.planeScheduler.progress(now);
    if (state === null) {
      // Pre first-flight delay: nothing to draw.
      this.planeGroup.style.display = 'none';
      return;
    }
    if (state.paused) {
      this.planeGroup.style.display = 'none';
      return;
    }
    // Path measuring is a browser-only API (there is none in jsdom-style
    // environments): without it the plane simply hides.
    const measure = this.outboundPath.getTotalLength;
    if (typeof measure !== 'function') {
      this.planeGroup.style.display = 'none';
      return;
    }
    this.setDashDirection(state.leg);
    const length = measure.call(this.outboundPath);
    const easedT = easeInOutCubic(state.t);
    // Return leg samples the path backwards so the plane flies to the
    // origin along the same curve without a second SVG path.
    const param = state.leg === 'return' ? 1 - easedT : easedT;
    const at = (distance: number) => this.outboundPath!.getPointAtLength(distance);
    const pt = at(param * length);
    const aheadDistance =
      state.leg === 'return'
        ? Math.max(0, param * length - 2)
        : Math.min(length, param * length + 2);
    const ahead = at(aheadDistance);
    const angle = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI + 90;
    this.planeGroup.style.display = '';
    // Screen-space: the plane keeps its configured px size at every zoom.
    const planeScale = roundPixel(screenSpaceScale(this.view.scale));
    this.planeGroup.setAttribute(
      'transform',
      `translate(${roundPixel(pt.x)} ${roundPixel(pt.y)}) rotate(${roundPixel(angle)}) scale(${planeScale})`,
    );
    this.planeStage = { x: pt.x, y: pt.y };

    // 3D camera tracking: ease the framing so the plane can never fly off
    // screen (the flat world's twin of the globe's camera chase). A zoom the
    // camera is already playing out wins over the chase.
    if (!this.camera.enabled || !this.camera.follow || this.tween) return;
    const target = followCentre({
      plane: this.planeStage,
      centre: { x: this.view.cx, y: this.view.cy },
      viewport: {
        w: this.container.clientWidth || 1,
        h: this.container.clientHeight || 1,
      },
      scale: this.view.scale,
    });
    if (!target) return;
    if (!this.following) this.following = true;
    const k = easeFactor(FOLLOW_EASE_PER_SECOND, dtSec);
    this.view = {
      ...this.view,
      cx: this.view.cx + (target.x - this.view.cx) * k,
      cy: this.view.cy + (target.y - this.view.cy) * k,
    };
    this.applyView();
  };
}
