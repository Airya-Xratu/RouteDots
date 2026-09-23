import { expect, test } from '@playwright/test';

type Hooks = {
  __state: { ready: boolean; error: string | null };
  __flat: { dispose: () => void } | null;
};

test('flat fallback draws both routes and flies the plane', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  const here = new URL('./fixtures/flat.html', import.meta.url);
  await page.goto(here.href);
  const state = await page.evaluate(() => (window as unknown as Hooks).__state);
  expect(state.error, `fixture error: ${state.error}`).toBeNull();

  // The world is built from addressable layers: surface → borders → cities →
  // routes (bottom to top).
  const layers = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-rd-layer]')).map((el) =>
      el.getAttribute('data-rd-layer'),
    ),
  );
  expect(layers).toEqual(['surface', 'borders', 'cities', 'routes']);

  // Two route paths (outbound + return) and two endpoint markers; the
  // outbound strokes slightly heavier than the return.
  const counts = await page.evaluate(() => {
    const routes = document.querySelectorAll('[data-rd-layer="routes"] path[stroke]');
    return {
      paths: routes.length,
      widths: Array.from(routes).map((p) => p.getAttribute('stroke-width')),
      markers: document.querySelectorAll('[data-rd-layer="routes"] circle:not([class])').length,
      cityDots: document.querySelectorAll('circle.rd-city-dot').length,
      cityRings: document.querySelectorAll('circle.rd-city-ring').length,
      dashed: Array.from(routes).every((p) => p.getAttribute('stroke-dasharray')?.includes(' ')),
    };
  });
  expect(counts.paths).toBe(2);
  expect(counts.widths).toEqual(['1.8', '1.4']);
  expect(counts.markers).toBe(2);
  expect(counts.dashed).toBe(true);

  // Every bundled airport city blinks: a dot + an expanding pulse ring,
  // phase-shifted so they never pulse in unison.
  expect(counts.cityDots).toBe(31);
  expect(counts.cityRings).toBe(31);
  const blink = await page.evaluate(() => {
    const dots = Array.from(document.querySelectorAll('circle.rd-city-dot'));
    const rings = Array.from(document.querySelectorAll('circle.rd-city-ring'));
    const delays = new Set(dots.map((d) => (d as SVGCircleElement).style.animationDelay));
    return {
      dot: dots[0] ? getComputedStyle(dots[0]).animationName : null,
      ring: rings[0] ? getComputedStyle(rings[0]).animationName : null,
      distinctDelays: delays.size,
      // The custom properties live on the city <g>, so they inherit down to
      // every dot and ring.
      period: getComputedStyle(dots[0]!).getPropertyValue('--rd-city-period').trim(),
      grow: getComputedStyle(rings[0]!).getPropertyValue('--rd-city-ring-grow').trim(),
    };
  });
  expect(blink.dot).toBe('rd-city-blink');
  expect(blink.ring).toBe('rd-city-pulse');
  expect(blink.distinctDelays).toBeGreaterThan(20);
  expect(blink.period).toBe('2600ms');
  expect(Number(blink.grow)).toBeCloseTo(3.6, 2);

  // Country borders render as hairline white SVG polylines beneath the routes.
  const borders = await page.evaluate(() => {
    const polylines = Array.from(document.querySelectorAll('svg polyline'));
    return {
      count: polylines.length,
      width: polylines[0]?.getAttribute('stroke-width'),
      color: polylines[0]?.getAttribute('stroke'),
      filled: polylines.some((p) => p.getAttribute('fill') !== 'none'),
    };
  });
  expect(borders.count).toBeGreaterThan(500);
  expect(borders.width).toBe('1');
  expect(borders.color).toBe('#ffffff');
  expect(borders.filled).toBe(false);

  // The canvas paints grey country fills, leaving the ocean untouched
  // (equirectangular: x = (lng + 180) / 360 · w, y = (90 − lat) / 180 · h).
  const surface = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return null;
    const at = (lng: number, lat: number): number[] => {
      const x = Math.round(((lng + 180) / 360) * canvas.width);
      const y = Math.round(((90 - lat) / 180) * canvas.height);
      return Array.from(ctx.getImageData(x, y, 1, 1).data);
    };
    return { paris: at(2, 47), atlantic: at(-40, 30) };
  });
  expect(surface).not.toBeNull();
  expect(surface!.paris[3]).toBe(255); // filled
  expect(surface!.paris[0]).toBeLessThan(220); // grey, not the white border
  expect(surface!.atlantic[3]).toBe(0); // ocean stays transparent

  // Named endpoints render city-name labels.
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-rd-layer="routes"] text')).map(
      (t) => t.textContent,
    ),
  );
  expect(labels).toEqual(['London', 'Dubai']);

  // Without a 3D camera the layers stay flat — no perspective, no depth.
  const flatCamera = await page.evaluate(() => ({
    perspective: getComputedStyle(document.getElementById('map')!).perspective,
    layerDepth: getComputedStyle(document.querySelector('[data-rd-layer="routes"]')!).transform,
    world: getComputedStyle(
      document.querySelector('[data-rd-layer="borders"]')!.parentElement!.parentElement!,
    ).transform,
  }));
  expect(flatCamera.perspective).toBe('none');
  expect(flatCamera.layerDepth).toBe('none');
  expect(flatCamera.world).toBe('none');

  // The plane animates along the outbound path (the plane group carries the
  // icon's name) and follows the same route as the arcs.
  const readPlaneTransform = () =>
    page.evaluate(
      () => document.querySelector('[data-rd-plane]')?.getAttribute('transform') ?? null,
    );
  const t1 = await readPlaneTransform();
  await page.waitForTimeout(700);
  const t2 = await readPlaneTransform();
  expect(t1).not.toBeNull();
  expect(t2).not.toBeNull();
  expect(t1).not.toBe(t2);
  const planeName = await page.evaluate(() =>
    document.querySelector('[data-rd-plane]')?.getAttribute('data-rd-plane'),
  );
  expect(planeName).toBe('airliner');

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});
