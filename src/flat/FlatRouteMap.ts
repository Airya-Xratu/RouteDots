/**
 * FlatRouteMap — the no-WebGL fallback.
 *
 * A flat equirectangular dot map (same dot lattice as the 3D globe) with an
 * SVG overlay: two curved dashed routes (outbound bulging up, return bulging
 * down) and a small plane that repeatedly flies the outbound path. The view
 * pans/zooms to frame the route, mimicking the 3D globe's camera move.
 *
 * Everything is local DOM — no WebGL, no network.
 */
import landTopo from '../data/land-110m.js';
import { buildDotGrid } from '../core/dotPattern.js';
import { decodeRings, type TopoLand } from '../core/topojson.js';
import type { LatLon } from '../types.js';

export interface FlatTheme {
  bg: string;
  dot: string;
  outbound: string;
  return: string;
  marker: string;
  plane: string;
}

export const FLAT_THEMES: Record<'light' | 'dark', FlatTheme> = {
  light: {
    bg: '#ffffff',
    dot: '#b6bcc6',
    outbound: '#23262e',
    return: '#8b93a1',
    marker: '#23262e',
    plane: '#14161a',
  },
  dark: {
    bg: '#10141c',
    dot: '#3a4557',
    outbound: '#cfd8e6',
    return: '#5b6b82',
    marker: '#e2e8f0',
    plane: '#e2e8f0',
  },
};

export interface FlatRouteMapOptions {
  theme?: 'light' | 'dark';
  /** Dot spacing in degrees (default 1.5). */
  stepDeg?: number;
  /** Replace the bundled land mask. */
  land?: TopoLand;
  /** Map canvas width in CSS px (default 1600). */
  width?: number;
  /** Flight time / pause for the plane (ms). */
  flightMs?: number;
  pauseMs?: number;
}

interface FlatRouteOptions {
  roundTrip?: boolean;
}

const PLANE_PATH_D =
  'M0,-9 C1.2,-6 1.6,-3 1.5,-1 L1.5,4 C1.5,6 0,7.5 0,7.5 C0,7.5 -1.5,6 -1.5,4 L-1.5,-1 C-1.6,-3 -1.2,-6 0,-9 Z ' +
  'M1,-2 L9,4 L9,5.6 L1,3.4 Z M-1,-2 L-9,4 L-9,5.6 L-1,3.4 Z';

export class FlatRouteMap {
  private readonly container: HTMLElement;
  private readonly stage: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly svg: SVGSVGElement;
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
    this.renderDots(options.stepDeg ?? 1.5, (options.land ?? landTopo) as TopoLand);

    const ns = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(ns, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.svg.style.position = 'absolute';
    this.svg.style.inset = '0';
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.pointerEvents = 'none';
    this.routeGroup = document.createElementNS(ns, 'g');
    this.planeEl = document.createElementNS(ns, 'g');
    this.svg.appendChild(this.routeGroup);
    this.svg.appendChild(this.planeEl);
    this.stage.appendChild(this.svg);
    this.buildPlane();

    this.rafId = requestAnimationFrame(this.frame);
  }

  /** (Re)draws the route. */
  setRoute(origin: LatLon, dest: LatLon, options: FlatRouteOptions = {}): void {
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
    outbound.setAttribute('stroke-width', '3');
    outbound.setAttribute('stroke-linecap', 'round');
    outbound.setAttribute('stroke-dasharray', '10 7');
    this.routeGroup.appendChild(outbound);
    this.outboundPath = outbound;

    if (options.roundTrip) {
      const ret = makePath(x2, y2, x1, y1, bulge * 1.25);
      ret.setAttribute('stroke', this.theme.return);
      ret.setAttribute('stroke-width', '2.5');
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

  private renderDots(stepDeg: number, topo: TopoLand): void {
    const pattern = buildDotGrid(decodeRings(topo), { stepDeg });
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = this.theme.dot;
    const r = Math.max(1.2, (0.45 / 360) * this.width * 1.15);
    for (const dot of pattern.dots) {
      const [x, y] = this.project(dot);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
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
