/**
 * Builds the equirectangular hex-tile texture for country interiors.
 *
 * Each land hex is rendered as a filled regular polygon in a solid colour
 * at the developer-chosen opacity. The canvas is transparent except for the
 * hexagons, so the country-surface shell shows through between tiles.
 */
import * as THREE from 'three';
import type { HexPattern, HexTile } from '../core/hexPattern.js';

export interface HexTextureOptions {
  /** Texture width in px (default 2048, height = width / 2). */
  width?: number;
  /** Hex fill colour (default '#ffffff'). */
  color?: string;
  /** Hex fill opacity 0..1 (default 0.35). */
  opacity?: number;
}

export interface HexTextureResult {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
}

/**
 * Projects a lat/lng tile centre to pixel coordinates on an equirectangular
 * canvas — identical projection to {@link projectDotToPx}.
 */
function projectHexToPx(
  lat: number,
  lng: number,
  width: number,
  height: number,
): [number, number] {
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return [x, y];
}

/**
 * Draws a single pointy-top regular hexagon centred at (cx, cy) with the
 * given circum-radius in px.
 */
function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    // Pointy-top: vertices at angles π/6, π/2, 5π/6, …
    const angle = Math.PI / 6 + (Math.PI / 3) * i;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Renders the hex tile pattern onto a transparent equirectangular canvas
 * and wraps it in a CanvasTexture. The texture sits just above the country
 * surface shell.
 */
export function createHexTexture(
  pattern: HexPattern,
  options: HexTextureOptions = {},
): HexTextureResult {
  const width = options.width ?? 2048;
  const height = Math.round(width / 2);
  const color = options.color ?? '#ffffff';
  const opacity = Math.min(1, Math.max(0, options.opacity ?? 0.35));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('createHexTexture: 2D canvas context unavailable');

  // Transparent base — hex tiles float above the grey country fills.
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;

  // Hex circum-radius in px (sizeDeg is in degrees of longitude at the
  // equator; latitude compression is not applied — tiles look slightly
  // squashed near the poles, matching the dot lattice's aesthetic).
  const radiusPx = Math.max(1, (pattern.tiles[0]?.sizeDeg ?? 1) / 360 * width * 0.85);

  for (const tile of pattern.tiles) {
    // Allow wrapping when a hex centre is pushed across the antimeridian by
    // the odd-row offset — draw it twice so tiles near the seam don't have a
    // gap.
    const positions: [number, number][] = [];
    const [x, y] = projectHexToPx(tile.lat, tile.lng, width, height);
    positions.push([x, y]);
    if (tile.lng > 180 - pattern.spacingDeg) positions.push([x - width, y]);
    if (tile.lng < -180 + pattern.spacingDeg) positions.push([x + width, y]);
    for (const [px, py] of positions) drawHex(ctx, px, py, radiusPx);
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return { texture, canvas };
}
