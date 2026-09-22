/**
 * Builds the equirectangular dot-map texture from a dot pattern.
 *
 * The canvas drawing is the only DOM-dependent part of this module; the
 * projection math (`projectDotToPx`) is pure and unit-tested.
 */
import * as THREE from 'three';
import type { DotPattern } from '../core/dotPattern.js';

export interface DotTextureOptions {
  /** Texture width in px (default 2048, height = width / 2). */
  width?: number;
  /** Base (ocean) colour — the canvas is filled with it so the globe body is opaque. */
  bgColor?: string;
  /** Dot colour (default #8b93a1). */
  dotColor?: string;
  /** Dot radius in degrees (default 0.62). */
  dotSizeDeg?: number;
}

/**
 * Projects a lat/lng point to pixel coordinates on an equirectangular canvas.
 *
 * @returns `[x, y]` with (0,0) at the top-left, x right, y down.
 */
export function projectDotToPx(
  lat: number,
  lng: number,
  width: number,
  height: number,
): [number, number] {
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return [x, y];
}

export interface DotTextureResult {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
}

/**
 * Renders the dot pattern onto a transparent equirectangular canvas and wraps
 * it in a CanvasTexture.
 */
export function createDotTexture(
  pattern: DotPattern,
  options: DotTextureOptions = {},
): DotTextureResult {
  const width = options.width ?? 2048;
  const height = Math.round(width / 2);
  const bgColor = options.bgColor ?? '#ffffff';
  const dotColor = options.dotColor ?? '#8b93a1';
  const dotSizeDeg = options.dotSizeDeg ?? 0.62;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('createDotTexture: 2D canvas context unavailable');

  // Opaque base: the ocean colour. Dots are drawn on top.
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = dotColor;
  const radiusPx = Math.max(0.75, (dotSizeDeg / 360) * width);

  for (const dot of pattern.dots) {
    const [x, y] = projectDotToPx(dot.lat, dot.lng, width, height);
    ctx.beginPath();
    ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { texture, canvas };
}
