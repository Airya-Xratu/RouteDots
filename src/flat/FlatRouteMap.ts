/**
 * FlatRouteMap — the flat world: the no-WebGL fallback, and a first-class
 * mode of its own.
 *
 * A flat equirectangular map (grey country fills with white borders, or the
 * dot lattice of the 3D globe) with an SVG overlay:
 *
 * - two curved dashed routes (the outbound leg bulging one way, the return
 *   the other), each with its own colour, dash pattern and curve angle,
 * - a small plane that repeatedly flies the outbound path — any icon the
 *   developer wants (`PlaneIcon`),
 * - city dots with a fully tunable ripple ring,
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
import {
  decodeBorderArcs,
  decodeCountryPolygons,
  decodeRings,
  type TopoLand,
} from '../core/topojson.js';
import { FLAT_LAYER_ATTR, FLAT_LAYER_NAME } from './layers.js';
import { flatBorderPoints, roundPixel } from './borderPolylines.js';
import { flatCountryPaths } from './countryPaths.js';
import { flatArcBounds, flatArcGeometry, type FlatArcGeometry } from './routePath.js';
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
import type { ResolvedPathStyle, RouteStyleOptions } from '../routes/routeStyle.js';
import { dashArrayPx, resolveRouteStyle, type ResolvedRouteStyle } from '../routes/routeStyle.js';
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
import type { City, LatLon, MapSurface } from '../types.js';

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
  /** Map canvas width in CSS px (default 1600). */
  width?: number;
  /** Palette overrides — the same object as the `colors` option. */
  colors?: RouteDotsColors;
  /** Route styling; the same shape as the globe's `route` option. */
  route?: RouteStyleOptions;
  /** Blinking city dots + ripple rings (default enabled). */
  cities?: CityMarkersOptions & { list?: readonly City[] };
  /** The plane and its icon component. */
  plane?: FlatPlaneOptions;
  /** Flight time / pause for the plane (ms) — legacy aliases of `plane.*`. */
  flightMs?: number;
  pauseMs?: number;
  /** 3D camera effect: perspective, tilt, depth layers, orbit, follow. */
  camera3d?: FlatCamera3DOptions;
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
  to { stroke-dashoffset: calc(-1 * var(--rd-dash-period, 20px)); }
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
  private planeIcon: PlaneIcon;
  private camera: ResolvedFlatCamera3D;
  private view = { scale: 1, cx: 0, cy: 0 };
  private route: { from: FlatRoutePoint; to: FlatRoutePoint; roundTrip: boolean } | null = null;
  private rafId = 0;
  private routeStart: number | null = null;
  private outboundPath: SVGPathElement | null = null;
  private planeStage: { x: number; y: number } | null = null;
  private lastGeometries: FlatArcGeometry[] = [];
  private following = false;
  private lastFrameMs = 0;
  private pointerDown = false;
  private lastPointer = { x: 0, y: 0 };
  private readonly abort = new AbortController();

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
    this.stage.style.transition = 'transform 700ms cubic-bezier(0.33, 1, 0.68, 1)';
    this.stage.style.willChange = 'transform';
    this.worldEl.appendChild(this.stage);

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
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
    this.applyCamera();
    this.bindInteraction();

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

  /** The resolved 3D camera settings. */
  get camera3d(): ResolvedFlatCamera3D {
    return { ...this.camera };
  }

  /** (Re)draws the route. */
  setRoute(origin: FlatRoutePoint, dest: FlatRoutePoint, options: FlatRouteOptions = {}): void {
    this.route = { from: origin, to: dest, roundTrip: options.roundTrip === true };
    this.renderRoutes();
    this.routeStart = performance.now();
  }

  /** Removes the current route (paths, markers, labels, plane). */
  clearRoute(): void {
    this.route = null;
    this.routeGroup.innerHTML = '';
    this.outboundPath = null;
    this.planeStage = null;
    this.routeStart = null;
    this.planeGroup.style.display = 'none';
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
    this.container.style.backgroundColor = this.theme.bg;

    if (
      options.surface !== undefined ||
      options.stepDeg !== undefined ||
      options.width !== undefined ||
      options.land !== undefined ||
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
      options.route !== undefined ||
      options.colors !== undefined ||
      options.theme !== undefined
    ) {
      this.renderRoutes();
    }
  }

  /** Re-frames the current route (used on resize). */
  reframe(): void {
    const bounds = flatArcBounds(this.lastGeometries);
    if (bounds) this.frameBounds(bounds);
  }

  /** Restyles / re-aims the 3D camera. */
  setCamera3D(options: Partial<FlatCamera3DOptions>): void {
    this.options.camera3d = { ...this.options.camera3d, ...options };
    this.camera = resolveFlatCamera3D(this.options.camera3d);
    this.applyCamera();
  }

  /** The map centre currently in view, in map px (handy for tests/demos). */
  getViewState(): { scale: number; cx: number; cy: number } {
    return { ...this.view };
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.abort.abort();
    this.container.innerHTML = '';
  }

  /** Projects lat/lng to map pixel coordinates (equirectangular). */
  private project(p: LatLon): [number, number] {
    return [((p.lng + 180) / 360) * this.width, ((90 - p.lat) / 180) * this.height];
  }

  /** Paints the grey country fills (even-odd, so enclaves stay empty). */
  private renderSurface(): void {
    if ((this.options.surface ?? 'countries') === 'dots') {
      this.renderDots(this.options.stepDeg ?? 2, (this.options.land ?? landTopo) as TopoLand);
      return;
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = this.theme.land;
    for (const path of flatCountryPaths(
      decodeCountryPolygons(countriesTopo),
      this.width,
      this.height,
    )) {
      ctx.fill(new Path2D(path), 'evenodd');
    }
  }

  private renderDots(stepDeg: number, topo: TopoLand): void {
    const pattern = buildDotGrid(decodeRings(topo), { stepDeg });
    const ctx = this.canvas.getContext('2d');
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
      }
    });
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
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('stroke-linecap', 'round');
      this.borderGroup.appendChild(el);
    }
  }

  /** (Re)draws the route: arcs, markers and labels. */
  private renderRoutes(): void {
    this.routeGroup.innerHTML = '';
    this.outboundPath = null;
    this.planeStage = null;
    const route = this.route;
    if (!route) return;

    const geometries: FlatArcGeometry[] = [];
    const outbound = this.addArc(route.from, route.to, this.routeStyle.outbound, 1);
    if (outbound) {
      geometries.push(outbound.geometry);
      this.outboundPath = outbound.path;
    }
    if (route.roundTrip) {
      const back = this.addArc(route.to, route.from, this.routeStyle.return, 1.25);
      if (back) geometries.push(back.geometry);
    }

    const [x1, y1] = this.project(route.from);
    const [x2, y2] = this.project(route.to);
    const endpoints: [number, number][] = [
      [x1, y1],
      [x2, y2],
    ];
    for (const [x, y] of endpoints) {
      const marker = document.createElementNS(NS, 'circle');
      marker.setAttribute('cx', String(roundPixel(x)));
      marker.setAttribute('cy', String(roundPixel(y)));
      marker.setAttribute('r', '5');
      marker.setAttribute('fill', this.theme.marker);
      this.routeGroup.appendChild(marker);
    }

    // City-name labels (only when the caller provides names).
    if (route.from.name) this.addLabel(x1, y1, route.from.name);
    if (route.to.name) this.addLabel(x2, y2, route.to.name);

    this.lastGeometries = geometries;
    const bounds = flatArcBounds(geometries);
    if (bounds) this.frameBounds(bounds);
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
    this.routeGroup.appendChild(path);

    // Dashes are measured in px on the real path, so a dash configured as a
    // fraction of the route looks the same here as on the globe.
    const length = typeof path.getTotalLength === 'function' ? path.getTotalLength() : 0;
    if (style.dash) {
      const [dash, gap] = dashArrayPx(style.dash, length);
      path.setAttribute('stroke-dasharray', `${roundPixel(dash)} ${roundPixel(gap)}`);
      if (style.dash.speed > 0) {
        path.style.setProperty('--rd-dash-period', `${roundPixel(dash + gap)}px`);
        path.style.setProperty('--rd-dash-duration', `${Math.round(1000 / style.dash.speed)}ms`);
        path.setAttribute('class', 'rd-dash-flow');
      }
    }
    return { path, geometry };
  }

  /** Adds a haloed city-name label near an endpoint marker. */
  private addLabel(x: number, y: number, text: string): void {
    const el = document.createElementNS(NS, 'text');
    el.setAttribute('x', String(roundPixel(x + 12)));
    el.setAttribute('y', String(roundPixel(y - 12)));
    el.setAttribute(
      'font-family',
      "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    );
    el.setAttribute('font-size', '24');
    el.setAttribute('font-weight', '600');
    el.setAttribute('fill', this.theme.label ?? this.theme.marker);
    // Paint the stroke first so it acts as a halo around the glyphs.
    el.setAttribute('stroke', this.theme.bg);
    el.setAttribute('stroke-width', '6');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('paint-order', 'stroke');
    el.textContent = text;
    this.routeGroup.appendChild(el);
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

  /** Pans/zooms the stage so a route box is framed in the middle. */
  private frameBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number }): void {
    const vw = this.container.clientWidth || 1;
    const vh = this.container.clientHeight || 1;
    const bw = Math.max(1, bounds.maxX - bounds.minX);
    const bh = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min(vw / bw, vh / bh, 3);
    this.view = {
      scale,
      cx: (bounds.minX + bounds.maxX) / 2,
      cy: (bounds.minY + bounds.maxY) / 2,
    };
    // A fresh route re-frames with the eased transition (the chase turns it
    // off again once the plane leaves the safe area).
    this.following = false;
    this.stage.style.transition = 'transform 700ms cubic-bezier(0.33, 1, 0.68, 1)';
    this.applyView();
  }

  /** Pushes `view`, the 3D camera and the depth layers to the DOM. */
  private applyView(): void {
    const vw = this.container.clientWidth || 1;
    const vh = this.container.clientHeight || 1;
    const { scale, cx, cy } = this.view;
    const tx = vw / 2 - cx * scale;
    const ty = vh / 2 - cy * scale;
    this.stage.style.transform = `translate3d(${roundPixel(tx)}px, ${roundPixel(ty)}px, 0) scale(${roundPixel(scale)})`;
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
        this.stage.style.transition = 'none';
        this.setCamera3D({ tilt: this.camera.tilt + dy * 0.3, yaw: this.camera.yaw + dx * 0.3 });
      },
      { signal },
    );
    const endDrag = (): void => {
      this.pointerDown = false;
      this.stage.style.transition = 'transform 700ms cubic-bezier(0.33, 1, 0.68, 1)';
    };
    el.addEventListener('pointerup', endDrag, { signal });
    el.addEventListener('pointercancel', endDrag, { signal });
    el.addEventListener(
      'wheel',
      (event) => {
        if (!this.camera.enabled || !this.camera.interactive) return;
        event.preventDefault();
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

    if (!this.outboundPath || this.routeStart === null) {
      this.planeGroup.style.display = 'none';
      return;
    }
    const plane = this.options.plane ?? {};
    if (plane.enabled === false) {
      this.planeGroup.style.display = 'none';
      return;
    }
    const flightMs = plane.flightMs ?? this.options.flightMs ?? 4500;
    const pauseMs = plane.pauseMs ?? this.options.pauseMs ?? 700;
    const elapsed = now - this.routeStart;
    const cycle = flightMs + pauseMs;
    const t = (elapsed % cycle) / flightMs;
    if (t >= 1) {
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
    const length = measure.call(this.outboundPath);
    const at = (distance: number) => this.outboundPath!.getPointAtLength(distance);
    const pt = at(t * length);
    const ahead = at(Math.min(length, t * length + 2));
    const angle = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI + 90;
    this.planeGroup.style.display = '';
    this.planeGroup.setAttribute(
      'transform',
      `translate(${roundPixel(pt.x)} ${roundPixel(pt.y)}) rotate(${roundPixel(angle)})`,
    );
    this.planeStage = { x: pt.x, y: pt.y };

    // 3D camera tracking: ease the framing so the plane can never fly off
    // screen (the flat world's twin of the globe's camera chase).
    if (!this.camera.enabled || !this.camera.follow) return;
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
    if (!this.following) {
      this.following = true;
      // The chase writes a transform every frame — no tweening on top of it.
      this.stage.style.transition = 'none';
    }
    const k = easeFactor(FOLLOW_EASE_PER_SECOND, dtSec);
    this.view = {
      ...this.view,
      cx: this.view.cx + (target.x - this.view.cx) * k,
      cy: this.view.cy + (target.y - this.view.cy) * k,
    };
    this.applyView();
  };
}
