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

  // Two route paths (outbound + return) and two endpoint markers; the
  // outbound strokes slightly heavier than the return.
  const counts = await page.evaluate(() => {
    const svg = document.querySelector('svg');
    const routes = svg?.querySelectorAll('path[stroke]') ?? [];
    return {
      paths: routes.length,
      widths: Array.from(routes).map((p) => p.getAttribute('stroke-width')),
      markers: svg?.querySelectorAll('circle').length ?? 0,
      dashed: Array.from(routes).every((p) => p.getAttribute('stroke-dasharray')?.includes(' ')),
    };
  });
  expect(counts.paths).toBe(2);
  expect(counts.widths).toEqual(['1.8', '1.4']);
  expect(counts.markers).toBe(2);
  expect(counts.dashed).toBe(true);

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
    Array.from(document.querySelectorAll('svg text')).map((t) => t.textContent),
  );
  expect(labels).toEqual(['London', 'Dubai']);

  // The plane animates along the outbound path (plane group = last svg <g>).
  const readPlaneTransform = () =>
    page.evaluate(() => {
      const groups = document.querySelectorAll('svg g');
      return groups.length >= 2
        ? (groups[groups.length - 1] as SVGGElement).getAttribute('transform')
        : null;
    });
  const t1 = await readPlaneTransform();
  await page.waitForTimeout(700);
  const t2 = await readPlaneTransform();
  expect(t1).not.toBeNull();
  expect(t2).not.toBeNull();
  expect(t1).not.toBe(t2);

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});
