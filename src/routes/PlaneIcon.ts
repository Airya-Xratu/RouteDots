/**
 * PlaneIcon — the airplane marker as a swappable component.
 *
 * A `PlaneIcon` is one self-contained thing the developer can replace: it
 * knows how to paint itself on a 2D canvas (the WebGL sprite texture) *and*
 * how to describe itself as SVG path data (the flat world, or your own
 * markup). Swap it with `plane: { icon: … }`:
 *
 * ```ts
 * new RouteDots(el, { plane: { icon: 'jet', color: '#e11d48' } });
 * new RouteDots(el, { plane: { icon: { path: 'M0,-50 L22,30 L-22,30 Z' } } });
 * new RouteDots(el, { plane: { icon: PlaneIcon.from({ draw: myDrawFn }) } });
 * ```
 *
 * Built-in presets: `'airliner'` (default), `'jet'`, `'arrow'`, `'dot'`.
 *
 * The drawing convention is always the same: the icon is centred on the
 * current transform origin, its nose points up (local −Y) and it spans about
 * `size` px — so it can be rotated to a heading without any extra maths.
 *
 * Pure geometry + a canvas adapter: `path`, `viewBox` and preset data are
 * plain values, and nothing here touches three.js.
 */
import {
  buildPlanePath,
  drawPlanePath,
  segmentsToPathData,
  type PlaneSegment,
} from './planeSilhouette.js';

/** Names of the icons that ship with RouteDots. */
export type PlaneIconName = 'airliner' | 'jet' | 'arrow' | 'dot';

/** Every built-in icon name, in showcase order. */
export const PLANE_ICON_NAMES: readonly PlaneIconName[] = ['airliner', 'jet', 'arrow', 'dot'];

/** A reusable icon definition: SVG path data inside a centred design box. */
export interface PlaneIconGeometry {
  /** SVG path data, design box centred on the origin (see `viewBox`). */
  path: string;
  /** Width/height of the design box the path is drawn in (default 100). */
  viewBox?: number;
}

/** Options handed to a custom canvas draw function. */
export interface PlaneIconDrawOptions {
  /** Overall icon size in px (default 100). */
  size: number;
  /** Fill colour (default '#14161a'). */
  color: string;
}

/** A fully custom icon: the developer paints it. */
export interface PlaneIconCustomOptions {
  /** Label used for debugging / the showcase. */
  name?: string;
  /** Paints the icon centred on the current origin, nose up. */
  draw: (ctx: CanvasRenderingContext2D, options: PlaneIconDrawOptions) => void;
  /** Optional SVG path data; without it the flat world rasterizes the canvas. */
  path?: string;
  /** Design box of `path` (default 100). */
  viewBox?: number;
}

/** A raster / external icon (an `<img>`, canvas or bitmap). */
export interface PlaneIconImageOptions {
  name?: string;
  /** Image drawn centred, `size` px wide. */
  image: CanvasImageSource;
}

/** Anything a developer can pass as `plane.icon`. */
export type PlaneIconSource =
  PlaneIconName | PlaneIconGeometry | PlaneIconCustomOptions | PlaneIconImageOptions | PlaneIcon;

/** Default icon size in px, and the design box every preset draws in. */
export const PLANE_ICON_SIZE = 100;

const jetSegments = (): PlaneSegment[] => {
  const wing = (m: number): PlaneSegment[] =>
    m === 1
      ? [
          { op: 'move', x: 2.4, y: -4 },
          { op: 'quad', cx: 18, cy: 4, x: 32, y: 20 },
          { op: 'line', x: 47, y: 31 },
          { op: 'quad', cx: 50, cy: 33, x: 48, y: 35 },
          { op: 'line', x: 9, y: 24 },
          { op: 'quad', cx: 2.6, cy: 20, x: 2.4, y: 12 },
          { op: 'close' },
        ]
      : [
          { op: 'move', x: -2.4, y: -4 },
          { op: 'quad', cx: -18, cy: 4, x: -32, y: 20 },
          { op: 'line', x: -47, y: 31 },
          { op: 'quad', cx: -50, cy: 33, x: -48, y: 35 },
          { op: 'line', x: -9, y: 24 },
          { op: 'quad', cx: -2.6, cy: 20, x: -2.4, y: 12 },
          { op: 'close' },
        ];

  const tail = (m: number): PlaneSegment[] =>
    m === 1
      ? [
          { op: 'move', x: 2, y: 22 },
          { op: 'quad', cx: 7, cy: 30, x: 11, y: 40 },
          { op: 'quad', cx: 14, cy: 47, x: 9, y: 46 },
          { op: 'line', x: 1.6, y: 32 },
          { op: 'close' },
        ]
      : [
          { op: 'move', x: -2, y: 22 },
          { op: 'quad', cx: -7, cy: 30, x: -11, y: 40 },
          { op: 'quad', cx: -14, cy: 47, x: -9, y: 46 },
          { op: 'line', x: -1.6, y: 32 },
          { op: 'close' },
        ];

  return [
    { op: 'move', x: 0, y: -50 },
    { op: 'quad', cx: 2.6, cy: -38, x: 3, y: -10 },
    { op: 'line', x: 3.2, y: 16 },
    { op: 'quad', cx: 3.2, cy: 32, x: 0, y: 42 },
    { op: 'quad', cx: -3.2, cy: 32, x: -3.2, y: 16 },
    { op: 'line', x: -3, y: -10 },
    { op: 'quad', cx: -2.6, cy: -38, x: 0, y: -50 },
    { op: 'close' },
    ...wing(1),
    ...wing(-1),
    ...tail(1),
    ...tail(-1),
  ];
};

const arrowSegments = (): PlaneSegment[] => [
  { op: 'move', x: 0, y: -48 },
  { op: 'quad', cx: 14, cy: -12, x: 26, y: 26 },
  { op: 'quad', cx: 28, cy: 38, x: 18, y: 32 },
  { op: 'line', x: 0, y: 20 },
  { op: 'line', x: -18, y: 32 },
  { op: 'quad', cx: -28, cy: 38, x: -26, y: 26 },
  { op: 'quad', cx: -14, cy: -12, x: 0, y: -48 },
  { op: 'close' },
];

const dotPath = 'M0,-32 A32,32 0 1,1 0,32 A32,32 0 1,1 0,-32 Z';

/** Built-in icon geometry, keyed by name. */
export const PLANE_ICON_PRESETS: Record<PlaneIconName, PlaneIconGeometry> = {
  airliner: { path: segmentsToPathData(buildPlanePath()), viewBox: 100 },
  jet: { path: segmentsToPathData(jetSegments()), viewBox: 100 },
  arrow: { path: segmentsToPathData(arrowSegments()), viewBox: 100 },
  dot: { path: dotPath, viewBox: 72 },
};

const isName = (source: unknown): source is PlaneIconName =>
  typeof source === 'string' && (PLANE_ICON_NAMES as readonly string[]).includes(source);

/**
 * The airplane marker component.
 *
 * Instances are immutable and cheap; `PlaneIcon.from()` normalizes any
 * supported source into one, filling in whichever representation is missing
 * (path data → canvas paint, or canvas paint → raster fallback).
 */
export class PlaneIcon {
  /** Name of the icon (a preset name, or the custom name). */
  readonly name: string;
  /** SVG path data, when the icon can be described as paths. */
  readonly path: string | null;
  /** Design box of {@link path}. */
  readonly viewBox: number;
  /** Raster source, when the icon is an image. */
  readonly image: CanvasImageSource | null;

  private readonly customDraw:
    ((ctx: CanvasRenderingContext2D, o: PlaneIconDrawOptions) => void) | null;
  private cachedPath2D: Path2D | null | undefined;

  private constructor(options: {
    name: string;
    path: string | null;
    viewBox: number;
    image: CanvasImageSource | null;
    draw: ((ctx: CanvasRenderingContext2D, o: PlaneIconDrawOptions) => void) | null;
  }) {
    this.name = options.name;
    this.path = options.path;
    this.viewBox = options.viewBox;
    this.image = options.image;
    this.customDraw = options.draw;
  }

  /** Normalizes any {@link PlaneIconSource} (or `undefined`) into an icon. */
  static from(source?: PlaneIconSource): PlaneIcon {
    if (source instanceof PlaneIcon) return source;

    // Anything that isn't an object is a preset name (or unknown → airliner).
    if (typeof source !== 'object' || source === null) {
      if (isName(source)) {
        const preset = PLANE_ICON_PRESETS[source];
        return new PlaneIcon({
          name: source,
          path: preset.path,
          viewBox: preset.viewBox ?? PLANE_ICON_SIZE,
          image: null,
          draw: null,
        });
      }
      return PlaneIcon.from('airliner');
    }

    if ('image' in source && source.image) {
      return new PlaneIcon({
        name: source.name ?? 'image',
        path: null,
        viewBox: PLANE_ICON_SIZE,
        image: source.image,
        draw: null,
      });
    }
    if ('draw' in source && typeof source.draw === 'function') {
      return new PlaneIcon({
        name: source.name ?? 'custom',
        path: source.path ?? null,
        viewBox: source.viewBox ?? PLANE_ICON_SIZE,
        image: null,
        draw: source.draw,
      });
    }
    if ('path' in source && typeof source.path === 'string' && source.path.length > 0) {
      return new PlaneIcon({
        name: ('name' in source ? source.name : undefined) ?? 'custom',
        path: source.path,
        viewBox: source.viewBox ?? PLANE_ICON_SIZE,
        image: null,
        draw: null,
      });
    }
    return PlaneIcon.from('airliner');
  }

  /** True when the icon paints itself with a custom function. */
  get isCustom(): boolean {
    return this.customDraw !== null;
  }

  /**
   * Paints the icon centred on the current origin, nose up, roughly `size` px
   * across. Callers set up the transform (translate to the sprite centre).
   */
  draw(ctx: CanvasRenderingContext2D, options: Partial<PlaneIconDrawOptions> = {}): void {
    const size = options.size ?? PLANE_ICON_SIZE;
    const color = options.color ?? '#14161a';
    const drawOptions: PlaneIconDrawOptions = { size, color };

    if (this.customDraw) {
      this.customDraw(ctx, drawOptions);
      return;
    }

    if (this.image) {
      const half = size / 2;
      ctx.drawImage(this.image, -half, -half, size, size);
      return;
    }

    const scale = size / this.viewBox;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    const path = this.path2D();
    if (path) {
      ctx.fill(path, 'nonzero');
    } else if (this.path) {
      // No Path2D (very old browser / test env): trace with the segment
      // renderer, which understands the same command set.
      drawPlanePath(ctx, buildPlanePath(1));
      ctx.fill('nonzero');
    }
    ctx.restore();
  }

  /**
   * Renders the icon onto a square canvas — the shape the WebGL sprite and
   * the flat world's `<image>` fallback want.
   */
  toCanvas(options: { size?: number; color?: string } = {}): HTMLCanvasElement {
    const size = Math.max(8, Math.round(options.size ?? 128));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('PlaneIcon.toCanvas: 2D canvas context unavailable');
    ctx.translate(size / 2, size / 2);
    this.draw(ctx, { size: size * 0.92, color: options.color ?? '#14161a' });
    return canvas;
  }

  /** The icon as a standalone SVG markup string (handy outside the canvas). */
  toSVG(options: { size?: number; color?: string; className?: string } = {}): string {
    const size = options.size ?? 24;
    const color = options.color ?? 'currentColor';
    const className = options.className ? ` class="${options.className}"` : '';
    if (!this.path) {
      const href = this.dataUrl(color);
      return (
        `<svg${className} width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
        `<image href="${href ?? ''}" x="0" y="0" width="${size}" height="${size}" /></svg>`
      );
    }
    const half = this.viewBox / 2;
    return (
      `<svg${className} width="${size}" height="${size}" viewBox="${-half} ${-half} ${this.viewBox} ${this.viewBox}">` +
      `<path d="${this.path}" fill="${color}" /></svg>`
    );
  }

  /** A data URL of the rasterized icon (null when there is no canvas). */
  dataUrl(color = '#14161a'): string | null {
    try {
      return this.toCanvas({ size: 256, color }).toDataURL('image/png');
    } catch {
      return null;
    }
  }

  private path2D(): Path2D | null {
    if (this.cachedPath2D !== undefined) return this.cachedPath2D;
    if (typeof Path2D === 'undefined' || !this.path) {
      this.cachedPath2D = null;
    } else {
      try {
        this.cachedPath2D = new Path2D(this.path);
      } catch {
        this.cachedPath2D = null;
      }
    }
    return this.cachedPath2D;
  }
}

/** Convenience factory — identical to {@link PlaneIcon.from}. */
export function createPlaneIcon(source?: PlaneIconSource): PlaneIcon {
  return PlaneIcon.from(source);
}
