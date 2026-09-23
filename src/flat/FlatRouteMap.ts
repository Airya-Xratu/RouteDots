/**
 * FlatRouteMap — the no-WebGL fallback.
 *
 * A flat equirectangular map (grey country fills with white borders, or the
 * dot lattice of the 3D globe) with an SVG overlay: two curved dashed routes
 * (outbound bulging up, return bulging down) and a small plane that
 * repeatedly flies the outbound path. The view pans/zooms to frame the route,
 * mimicking the 3D globe's camera move.
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
import { flatBorderPoints, roundPixel } from './borderPolylines.js';
import { flatCountryPaths } from './countryPaths.js';
import { CITIES } from '../cities.js';
import { DEFAULT_BLINK_PERIOD_MS, blinkPhase } from '../markers/blinkPattern.js';
import type { City, LatLon, MapSurface } from '../types.js';

export interface FlatTheme {
  /** Ocean / page background. */
  bg: string;
  /** Country fill (the `countries` surface). */
  land: string;
  /** Dot colour (the `dots` surface). */
  dot: string;
  /** Country border stroke. */
  border: string;
  /** Airport-city marker colour. */
  city: string;
  outbound: string;
  return: string;
  marker: string;
  plane: string;
}

export const FLAT_THEMES: Record<'light' | 'dark', FlatTheme> = {
  light: {
    bg: '#f2f5f9',
    land: '#c3c9d4',
    dot: '#8b93a1',
    border: '#ffffff',
    outbound: '#23262e',
    return: '#8b93a1',
    marker: '#23262e',
    city: '#39414e',
    plane: '#14161a',
  },
  dark: {
    bg: '#0e131c',
    land: '#2b3442',
    dot: '#5b6b82',
    border: '#ffffff',
    outbound: '#cfd8e6',
    return: '#5b6b82',
    marker: '#e2e8f0',
    city: '#d7e0ee',
    plane: '#e2e8f0',
  },
};

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
    /** Line colour (default: the theme's border colour). */
    color?: string;
    /** Stroke width in px (default 1). */
    width?: number;
  };
  /** Map canvas width in CSS px (default 1600). */
  width?: number;
  /** Blinking circles at every airport city (default enabled). */
  cities?: {
    enabled?: boolean;
    periodMs?: number;
    list?: readonly City[];
  };
  /** Flight time / pause for the plane (ms). */
  flightMs?: number;
  pauseMs?: number;
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
  50% { opacity: 0.45; }
}
@keyframes rd-city-pulse {
  0% { transform: scale(1); opacity: 0.55; }
  100% { transform: scale(3.6); opacity: 0; }
}
.rd-city-dot {
  animation: rd-city-blink var(--rd-city-period, 2600ms) linear infinite;
}
.rd-city-ring {
  transform-box: fill-box;
  transform-origin: center;
  animation: rd-city-pulse var(--rd-city-period, 2600ms) linear infinite;
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

// Rounded top-view airliner (nose up), ~20px tip-to-tail.
const PLANE_PATH_D =
  'M0,-10 Q1.8,-6.8 1.4,-2.4 L1.4,3.2 Q1.4,6.8 0,8.4 Q-1.4,6.8 -1.4,3.2 L-1.4,-2.4 Q-1.8,-6.8 0,-10 Z ' +
  'M1.2,-1.6 Q5.2,-0.4 8.4,2.8 Q10,4.2 10,6 Q10,7.2 8.6,6.8 L2,4.4 Q1.2,4 1.2,2.4 Z ' +
  'M-1.2,-1.6 Q-5.2,-0.4 -8.4,2.8 Q-10,4.2 -10,6 Q-10,7.2 -8.6,6.8 L-2,4.4 Q-1.2,4 -1.2,2.4 Z ' +
  'M1,4 Q2.8,5.2 4.2,7.2 Q5,8.4 4.2,9.2 Q3.6,9.8 2.8,9 L1.2,6.8 Q1,6 1,5 Z ' +
  'M-1,4 Q-2.8,5.2 -4.2,7.2 Q-5,8.4 -4.2,9.2 Q-3.6,9.8 -2.8,9 L-1.2,6.8 Q-1,6 -1,5 Z';

export class FlatRouteMap {
  private readonly container: HTMLElement;
  private readonly stage: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly svg: SVGSVGElement;
  private readonly borderGroup: SVGGElement;
  private readonly cityGroup: SVGGElement;
  private readonly routeGroup: SVGGElement;
  private readonly planeEl: SVGGElement;
  private readonly theme: FlatTheme;
  private readonly width: number;
  private readonly height: number;
  private rafId = 0;
  private flightMs: number;
  private pauseMs: number;
  private routeStart: number | null = null;
  private outboundPath: SVGPathElement | null = null;

  constructor(container: HTMLElement, options: FlatRouteMapOptions = {}) {
    this.container = container;
    this.theme = FLAT_THEMES[options.theme ?? 'light'];
    this.width = options.width ?? 1600;
    this.height = this.width / 2;
    this.flightMs = options.flightMs ?? 4500;
    this.pauseMs = options.pauseMs ?? 700;

    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.backgroundColor = this.theme.bg;

    // The stage's coordinate space is exactly the map's pixel space
    // (width x height), so canvas, SVG viewBox and framing math all agree.
    this.stage = document.createElement('div');
    this.stage.style.position = 'absolute';
    this.stage.style.left = '0';
    this.stage.style.top = '0';
    this.stage.style.width = `${this.width}px`;
    this.stage.style.height = `${this.height}px`;
    this.stage.style.transformOrigin = '0 0';
    this.stage.style.transition = 'transform 700ms cubic-bezier(0.33, 1, 0.68, 1)';
    container.appendChild(this.stage);

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.stage.appendChild(this.canvas);
    if ((options.surface ?? 'countries') === 'dots') {
      this.renderDots(options.stepDeg ?? 2, (options.land ?? landTopo) as TopoLand);
    } else {
      this.renderCountries();
    }

    const ns = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(ns, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.svg.style.position = 'absolute';
    this.svg.style.inset = '0';
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.pointerEvents = 'none';
    this.borderGroup = document.createElementNS(ns, 'g');
    this.cityGroup = document.createElementNS(ns, 'g');
    this.routeGroup = document.createElementNS(ns, 'g');
    this.planeEl = document.createElementNS(ns, 'g');
    this.svg.appendChild(this.borderGroup);
    if (options.borders?.enabled !== false) this.renderBorders(options);
    this.svg.appendChild(this.cityGroup);
    if (options.cities?.enabled !== false) this.renderCities(options);
    this.svg.appendChild(this.routeGroup);
    this.svg.appendChild(this.planeEl);
    this.stage.appendChild(this.svg);
    this.buildPlane();

    this.rafId = requestAnimationFrame(this.frame);
  }

  /** (Re)draws the route. */
  setRoute(origin: FlatRoutePoint, dest: FlatRoutePoint, options: FlatRouteOptions = {}): void {
    this.routeStart = null;
    this.clearRoutes();
    const ns = 'http://www.w3.org/2000/svg';
    const [x1, y1] = this.project(origin);
    const [x2, y2] = this.project(dest);
    const distPx = Math.hypot(x2 - x1, y2 - y1);
    const bulge = Math.max(14, distPx * 0.28);

    const makePath = (x1: number, y1: number, x2: number, y2: number, bend: number) => {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2 + bend;
      const d = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      return path;
    };

    const outbound = makePath(x1, y1, x2, y2, -bulge);
    outbound.setAttribute('stroke', this.theme.outbound);
    outbound.setAttribute('stroke-width', '1.8');
    outbound.setAttribute('stroke-linecap', 'round');
    outbound.setAttribute('stroke-dasharray', '10 7');
    this.routeGroup.appendChild(outbound);
    this.outboundPath = outbound;

    if (options.roundTrip) {
      const ret = makePath(x2, y2, x1, y1, bulge * 1.25);
      ret.setAttribute('stroke', this.theme.return);
      ret.setAttribute('stroke-width', '1.4');
      ret.setAttribute('stroke-linecap', 'round');
      ret.setAttribute('stroke-dasharray', '7 8');
      this.routeGroup.appendChild(ret);
    }

    for (const [x, y] of [
      [x1, y1],
      [x2, y2],
    ]) {
      const marker = document.createElementNS(ns, 'circle');
      marker.setAttribute('cx', String(x));
      marker.setAttribute('cy', String(y));
      marker.setAttribute('r', '5');
      marker.setAttribute('fill', this.theme.marker);
      this.routeGroup.appendChild(marker);
    }

    // City-name labels (only when the caller provides names).
    if (origin.name) this.addLabel(x1, y1, origin.name);
    if (dest.name) this.addLabel(x2, y2, dest.name);

    this.frameRoute(x1, y1, x2, y2, bulge);
    // restart the plane flight
    this.routeStart = performance.now();
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.container.innerHTML = '';
  }

  /** Projects lat/lng to map pixel coordinates (equirectangular). */
  private project(p: LatLon): [number, number] {
    return [((p.lng + 180) / 360) * this.width, ((90 - p.lat) / 180) * this.height];
  }

  /** Paints the grey country fills (even-odd, so enclaves stay empty). */
  private renderCountries(): void {
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
   * Blinking dot + expanding ring at every airport city, under the routes.
   * Phases are spread with the same golden-ratio offsets as the WebGL layer;
   * the CSS animation delay is simply the negative phase.
   */
  private renderCities(options: FlatRouteMapOptions): void {
    const period = options.cities?.periodMs ?? DEFAULT_BLINK_PERIOD_MS;
    injectCityStyles();
    this.cityGroup.style.setProperty('--rd-city-period', `${period}ms`);
    const ns = 'http://www.w3.org/2000/svg';
    const cities = options.cities?.list ?? CITIES;
    cities.forEach((city, index) => {
      const [x, y] = this.project(city);
      const delay = `${Math.round(-blinkPhase(index) * period)}ms`;
      const ring = document.createElementNS(ns, 'circle');
      ring.setAttribute('class', 'rd-city-ring');
      ring.setAttribute('cx', String(roundPixel(x)));
      ring.setAttribute('cy', String(roundPixel(y)));
      ring.setAttribute('r', '4');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', this.theme.city);
      ring.setAttribute('stroke-width', '1.2');
      ring.style.animationDelay = delay;
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('class', 'rd-city-dot');
      dot.setAttribute('cx', String(roundPixel(x)));
      dot.setAttribute('cy', String(roundPixel(y)));
      dot.setAttribute('r', '2.6');
      dot.setAttribute('fill', this.theme.city);
      dot.style.animationDelay = delay;
      this.cityGroup.append(ring, dot);
    });
  }

  /** Draws the country borders as SVG polylines under the route group. */
  private renderBorders(options: FlatRouteMapOptions): void {
    const rings = decodeBorderArcs(countriesTopo);
    const points = flatBorderPoints(rings, this.width, this.height);
    if (points.length === 0) return;
    for (const pts of points) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      el.setAttribute('points', pts);
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', options.borders?.color ?? this.theme.border);
      el.setAttribute('stroke-width', String(options.borders?.width ?? 1));
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('stroke-linecap', 'round');
      this.borderGroup.appendChild(el);
    }
  }

  /** Pans/zooms the stage so the route is framed in the middle. */
  private frameRoute(x1: number, y1: number, x2: number, y2: number, bulge: number): void {
    const vw = this.container.clientWidth || 1;
    const vh = this.container.clientHeight || 1;
    const minX = Math.min(x1, x2) - 60;
    const maxX = Math.max(x1, x2) + 60;
    const minY = Math.min(y1, y2) - bulge - 60;
    const maxY = Math.max(y1, y2) + bulge * 1.25 + 60;
    const bw = Math.max(minX, maxX - minX) || 1;
    const bh = Math.max(minY, maxY - minY) || 1;
    const scale = Math.min(vw / bw, vh / bh, 3);
    const tx = vw / 2 - ((minX + maxX) / 2) * scale;
    const ty = vh / 2 - ((minY + maxY) / 2) * scale;
    this.stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  /** Adds a haloed city-name label near an endpoint marker. */
  private addLabel(x: number, y: number, text: string): void {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x', String(x + 12));
    el.setAttribute('y', String(y - 12));
    el.setAttribute(
      'font-family',
      "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    );
    el.setAttribute('font-size', '24');
    el.setAttribute('font-weight', '600');
    el.setAttribute('fill', this.theme.marker);
    // Paint the stroke first so it acts as a halo around the glyphs.
    el.setAttribute('stroke', this.theme.bg);
    el.setAttribute('stroke-width', '6');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('paint-order', 'stroke');
    el.textContent = text;
    this.routeGroup.appendChild(el);
  }

  private buildPlane(): void {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', PLANE_PATH_D);
    path.setAttribute('fill', this.theme.plane);
    this.planeEl.appendChild(path);
    this.planeEl.style.display = 'none';
  }

  private frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);
    if (!this.outboundPath || this.routeStart === null) return;
    const elapsed = now - this.routeStart;
    const cycle = this.flightMs + this.pauseMs;
    const t = (elapsed % cycle) / this.flightMs;
    if (t >= 1) {
      this.planeEl.style.display = 'none';
      return;
    }
    const length = this.outboundPath.getTotalLength();
    const pt = this.outboundPath.getPointAtLength(t * length);
    const ahead = this.outboundPath.getPointAtLength(Math.min(length, t * length + 2));
    const angle = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI + 90;
    this.planeEl.style.display = '';
    this.planeEl.setAttribute(
      'transform',
      `translate(${pt.x} ${pt.y}) rotate(${angle}) scale(1.6)`,
    );
  };

  private clearRoutes(): void {
    this.routeGroup.innerHTML = '';
    this.outboundPath = null;
  }
}
