import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEX_GAP_RATIO,
  DEFAULT_HEX_INSET_RATIO,
  DEFAULT_HEX_SPACING_DEG,
  buildHexGrid,
  distanceToSegment,
  hexSegmentClearance,
  hexVertices,
  normalizeRing,
  pointInHex,
  pointInPolygon,
  type HexTile,
} from '../hexPattern.js';
import { decodeCountryPolygonsCached, type PolygonRings, type Ring } from '../topojson.js';
import countriesTopo from '../../data/countries-110m.js';

/** A closed ring from a list of [lng, lat] corners. */
function rect(minLng: number, minLat: number, maxLng: number, maxLat: number): Ring {
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ];
}

/** True when every vertex of a tile is inside `rings`. */
function tileFitsInside(rings: PolygonRings, tile: HexTile): boolean {
  for (const [lng, lat] of hexVertices(tile.lng, tile.lat, tile.sizeDeg)) {
    if (!pointInPolygon(rings, lng, lat)) return false;
  }
  return true;
}

/**
 * The outline a country is tested against: rings are polar-normalised (see
 * `normalizeRing`), which is what the engine itself uses.
 */
function hostOutline(rings: PolygonRings): PolygonRings {
  return rings.map((ring) => normalizeRing(ring).fill);
}

/** True when no vertex of a tile is inside `rings` (for hole tests). */
function tileStaysOutside(rings: PolygonRings, tile: HexTile): boolean {
  for (const [lng, lat] of hexVertices(tile.lng, tile.lat, tile.sizeDeg)) {
    if (pointInPolygon(rings, lng, lat)) return false;
  }
  return true;
}

const BIG_SQUARE: PolygonRings[] = [[rect(0, 0, 40, 30)]];

/** Bounding box of a ring, so distant borders are skipped. */
function ringBox(ring: Ring) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, maxLng, minLat, maxLat };
}

const ringBoxes = new WeakMap<Ring, ReturnType<typeof ringBox>>();
const boxOf = (ring: Ring) => {
  let box = ringBoxes.get(ring);
  if (!box) {
    box = ringBox(ring);
    ringBoxes.set(ring, box);
  }
  return box;
};

/** Smallest clearance from a tile to any border segment of any polygon. */
function minClearance(polygons: PolygonRings[], tile: HexTile): number {
  let worst = Infinity;
  for (const rings of polygons) {
    for (const ring of rings) {
      const box = boxOf(ring);
      if (
        tile.lng < box.minLng - tile.sizeDeg ||
        tile.lng > box.maxLng + tile.sizeDeg ||
        tile.lat < box.minLat - tile.sizeDeg ||
        tile.lat > box.maxLat + tile.sizeDeg
      )
        continue;
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1]!;
        const b = ring[i]!;
        // A jump wider than the map is the antimeridian seam some rings are
        // closed with — a border of the data, not of the world.
        if (Math.abs(b[0] - a[0]) > 180) continue;
        const d = hexSegmentClearance(tile.lng, tile.lat, tile.sizeDeg, a[0], a[1], b[0], b[1]);
        if (d < worst) worst = d;
      }
    }
  }
  return worst;
}

describe('hex geometry primitives', () => {
  it('builds a pointy-top hexagon: one vertex straight up, one straight down', () => {
    const verts = hexVertices(10, 20, 2);
    expect(verts).toHaveLength(6);
    const top = verts[1]!;
    expect(top[0]).toBeCloseTo(10, 9);
    expect(top[1]).toBeCloseTo(22, 9);
    const bottom = verts[4]!;
    expect(bottom[0]).toBeCloseTo(10, 9);
    expect(bottom[1]).toBeCloseTo(18, 9);
    // √3 · radius wide
    const right = verts[0]!;
    expect(right[0]).toBeCloseTo(10 + 2 * Math.cos(Math.PI / 6), 9);
  });

  it('tests point containment against the hexagon slabs', () => {
    expect(pointInHex(0, 0, 2, 0, 0)).toBe(true);
    expect(pointInHex(0, 0, 2, 2.1, 0)).toBe(false); // beyond a flat side
    expect(pointInHex(0, 0, 2, 1.8, 0)).toBe(false);
    expect(pointInHex(0, 0, 2, 1.6, 0)).toBe(true);
    expect(pointInHex(0, 0, 2, 0, 1.99)).toBe(true); // towards a vertex
    expect(pointInHex(0, 0, 2, 0, 2.01)).toBe(false); // past it
  });

  it('measures the distance from a hexagon to a segment', () => {
    // A vertical line 2° east of a radius-1 hexagon centred at the origin:
    // the nearest hexagon vertex is at x = √3 / 2 ≈ 0.866, so 1.134 away.
    const d = hexSegmentClearance(0, 0, 1, 2, -10, 2, 10);
    expect(d).toBeCloseTo(2 - Math.cos(Math.PI / 6), 6);
    // A line straight through the hexagon crosses it.
    expect(hexSegmentClearance(0, 0, 1, -10, 0, 10, 0)).toBe(-1);
    // A line that clips a corner crosses it too.
    expect(hexSegmentClearance(0, 0, 1, -10, 0.9, 10, 0.9)).toBe(-1);
    // A short segment whose endpoint dangles near a flat side measures the
    // endpoint-to-edge distance, not the vertex-to-segment one.
    const dangling = hexSegmentClearance(0, 0, 1, 1.4, 0, 6, 0);
    expect(dangling).toBeCloseTo(1.4 - Math.sqrt(3) / 2, 6);
  });

  it('measures point-to-segment distance with the endpoints clamped', () => {
    expect(distanceToSegment(0, 5, -1, 0, 1, 0)).toBeCloseTo(5, 9);
    expect(distanceToSegment(-4, 0, -1, 0, 1, 0)).toBeCloseTo(3, 9);
    expect(distanceToSegment(0, 0, -1, 3, 1, 3)).toBeCloseTo(3, 9);
  });
});

describe('buildHexGrid — synthetic countries', () => {
  it('keeps only tiles that fit inside the country', () => {
    const pattern = buildHexGrid(BIG_SQUARE, { spacingDeg: 4 });
    expect(pattern.tiles.length).toBeGreaterThan(10);
    for (const tile of pattern.tiles) {
      expect(pointInPolygon(BIG_SQUARE[0]!, tile.lng, tile.lat)).toBe(true);
      expect(tileFitsInside(BIG_SQUARE[0]!, tile)).toBe(true);
    }
  });

  it('never lets a tile reach a border line', () => {
    // A tile's hexagon must stay inside the 0..40 / 0..30 square, i.e. clear
    // of the border by at least the requested inset.
    const inset = 0.75;
    const pattern = buildHexGrid(BIG_SQUARE, { spacingDeg: 4, insetDeg: inset });
    expect(pattern.tiles.length).toBeGreaterThan(5);
    for (const tile of pattern.tiles) {
      for (const [lng, lat] of hexVertices(tile.lng, tile.lat, tile.sizeDeg)) {
        expect(lng).toBeGreaterThanOrEqual(inset - 1e-9);
        expect(lng).toBeLessThanOrEqual(40 - inset + 1e-9);
        expect(lat).toBeGreaterThanOrEqual(inset - 1e-9);
        expect(lat).toBeLessThanOrEqual(30 - inset + 1e-9);
      }
    }
  });

  it('leaves a country too narrow for its tiles empty', () => {
    // 1.5° wide: no radius-2.9 tile can fit without crossing a border.
    const sliver: PolygonRings[] = [[rect(0, 0, 1.5, 30)]];
    expect(buildHexGrid(sliver, { spacingDeg: 5 }).tiles).toHaveLength(0);
    // …but smaller tiles do fit (the lattice pitch stays 5°).
    const narrow: PolygonRings[] = [[rect(2, 0, 8, 30)]];
    const fine = buildHexGrid(narrow, { spacingDeg: 5, sizeDeg: 0.5 });
    expect(fine.tiles.length).toBeGreaterThan(0);
    for (const tile of fine.tiles) expect(tileFitsInside(narrow[0]!, tile)).toBe(true);
  });

  it('punches holes out (a lake stays empty)', () => {
    const lake: Ring = rect(15, 10, 25, 20);
    const donut: PolygonRings[] = [[rect(0, 0, 40, 30), lake]];
    const pattern = buildHexGrid(donut, { spacingDeg: 3 });
    expect(pattern.tiles.length).toBeGreaterThan(10);
    for (const tile of pattern.tiles) {
      expect(tileFitsInside(donut[0]!, tile)).toBe(true);
      // Not a single corner may reach into the lake — not even touch it.
      expect(tileStaysOutside([lake], tile)).toBe(true);
    }
    // The hole's own outline is a border: no tile sits inside it.
    for (const tile of pattern.tiles) {
      expect(pointInPolygon([lake], tile.lng, tile.lat)).toBe(false);
    }
  });

  it('spaces neighbours by the pitch and clamps the tile size to it', () => {
    const pattern = buildHexGrid(BIG_SQUARE, { spacingDeg: 4 });
    expect(pattern.spacingDeg).toBe(4);
    expect(pattern.sizeDeg).toBeCloseTo((4 * (1 - DEFAULT_HEX_GAP_RATIO)) / Math.sqrt(3), 9);
    // Neighbouring tiles in a row are exactly one pitch apart.
    const row = pattern.tiles.filter((t) => Math.abs(t.lat - pattern.tiles[0]!.lat) < 1e-6);
    if (row.length > 1) {
      const sorted = [...row].sort((a, b) => a.lng - b.lng);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i]!.lng - sorted[i - 1]!.lng;
        expect(gap % 4 === 0 || Math.abs((gap % 4) - 4) < 1e-6 || Math.abs(gap % 4) < 1e-6).toBe(
          true,
        );
      }
    }
    // Asking for an oversized tile clamps to "neighbours touch".
    const clamped = buildHexGrid(BIG_SQUARE, { spacingDeg: 4, sizeDeg: 99 });
    expect(clamped.sizeDeg).toBeCloseTo(4 / Math.sqrt(3), 9);
    // …which is the largest tile the pitch allows.
    const touching = buildHexGrid(BIG_SQUARE, { spacingDeg: 4, sizeDeg: 4 / Math.sqrt(3) });
    expect(touching.sizeDeg).toBeCloseTo(4 / Math.sqrt(3), 9);
  });

  it('shrinks the tiles inside a fixed lattice when only the size changes', () => {
    const wide = buildHexGrid(BIG_SQUARE, { spacingDeg: 6 });
    const small = buildHexGrid(BIG_SQUARE, { spacingDeg: 6, sizeDeg: 1 });
    expect(small.sizeDeg).toBeCloseTo(1, 9);
    // Same pitch, so the same lattice positions — smaller tiles only let more
    // of them clear the border.
    expect(small.tiles.length).toBeGreaterThanOrEqual(wide.tiles.length);
    const wideCentres = new Set(wide.tiles.map((t) => `${t.lng},${t.lat}`));
    for (const tile of small.tiles) {
      if (wideCentres.has(`${tile.lng},${tile.lat}`)) continue;
      // New tiles only appear where the big one would have crossed a border.
      expect(tileFitsInside(BIG_SQUARE[0]!, tile)).toBe(true);
    }
  });

  it('reports the numbers it used and rejects a nonsense pitch', () => {
    const pattern = buildHexGrid(BIG_SQUARE, { spacingDeg: 3, sizeDeg: 0.8, insetDeg: 0.4 });
    expect(pattern).toMatchObject({ spacingDeg: 3, sizeDeg: 0.8, insetDeg: 0.4 });
    expect(buildHexGrid(BIG_SQUARE).spacingDeg).toBe(DEFAULT_HEX_SPACING_DEG);
    expect(() => buildHexGrid(BIG_SQUARE, { spacingDeg: 0 })).toThrow(RangeError);
    expect(() => buildHexGrid(BIG_SQUARE, { spacingDeg: 40 })).toThrow(RangeError);
  });
});

describe('buildHexGrid — bundled countries', () => {
  const polygons = decodeCountryPolygonsCached(countriesTopo);
  const pattern = buildHexGrid(polygons, { spacingDeg: 8 });

  it('tiles the world without ever covering a border', () => {
    expect(pattern.tiles.length).toBeGreaterThan(50);
    for (const tile of pattern.tiles) {
      const host = polygons.find((rings) => pointInPolygon(hostOutline(rings), tile.lng, tile.lat));
      expect(host, `tile at ${tile.lng},${tile.lat} is not inside any country`).toBeTruthy();
      // Every corner sits in the same country — the whole hexagon does.
      const outline = hostOutline(host!);
      for (const [lng, lat] of hexVertices(tile.lng, tile.lat, tile.sizeDeg)) {
        expect(
          pointInPolygon(outline, lng, lat),
          `tile at ${tile.lng},${tile.lat} reaches outside its country`,
        ).toBe(true);
      }
    }
  });

  it('keeps the requested clearance from every border segment', () => {
    const inset = 0.5;
    const cleared = buildHexGrid(polygons, { spacingDeg: 10, insetDeg: inset });
    expect(cleared.tiles.length).toBeGreaterThan(10);
    for (const tile of cleared.tiles) {
      for (const rings of polygons) {
        for (const ring of rings) {
          for (let i = 1; i < ring.length; i++) {
            const a = ring[i - 1]!;
            const b = ring[i]!;
            const d = hexSegmentClearance(tile.lng, tile.lat, tile.sizeDeg, a[0], a[1], b[0], b[1]);
            if (d >= 0 && d < inset - 1e-9) {
              throw new Error(
                `tile at ${tile.lng},${tile.lat} clears a border by only ${d.toFixed(4)}°`,
              );
            }
          }
        }
      }
    }
  });

  it('leaves a visible gutter along the borders at the default settings', () => {
    // Regression: the degree test alone lets a tile kiss a border, and the
    // borders are drawn as lines roughly a tenth of a degree wide — a tile
    // that touches one disappears under the stroke. The default clearance
    // scales with the pitch, so every tile stays visibly inside its country.
    const fine = buildHexGrid(polygons);
    expect(fine.spacingDeg).toBe(DEFAULT_HEX_SPACING_DEG);
    expect(fine.insetDeg).toBeCloseTo(DEFAULT_HEX_SPACING_DEG * DEFAULT_HEX_INSET_RATIO, 9);
    expect(fine.tiles.length).toBeGreaterThan(1000);
    let worst = Infinity;
    for (const tile of fine.tiles) worst = Math.min(worst, minClearance(polygons, tile));
    expect(worst).toBeGreaterThan(0.1);
  });

  it('scales the default clearance with the pitch', () => {
    const coarse = buildHexGrid(polygons, { spacingDeg: 10 });
    const fine = buildHexGrid(polygons, { spacingDeg: 2 });
    expect(coarse.insetDeg).toBeCloseTo(10 * DEFAULT_HEX_INSET_RATIO, 9);
    expect(fine.insetDeg).toBeCloseTo(2 * DEFAULT_HEX_INSET_RATIO, 9);
    for (const tile of coarse.tiles) {
      expect(minClearance(polygons, tile)).toBeGreaterThan(coarse.insetDeg - 1e-9);
    }
  });

  it('adds tiles as the grid gets finer', () => {
    const coarse = buildHexGrid(polygons, { spacingDeg: 10 });
    const fine = buildHexGrid(polygons, { spacingDeg: 4 });
    expect(fine.tiles.length).toBeGreaterThan(coarse.tiles.length * 3);
  });

  it('is deterministic and cached across calls', () => {
    const again = buildHexGrid(polygons, { spacingDeg: 8 });
    expect(again.tiles).toEqual(pattern.tiles);
  });
});
