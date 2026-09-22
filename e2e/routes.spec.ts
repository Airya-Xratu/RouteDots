import { expect, test } from '@playwright/test';

type Hooks = {
  __state: { ready: boolean; drawn: number; error: string | null; webgl: boolean | null };
  __globe: {
    isReady: boolean;
    readPixel: (x: number, y: number) => [number, number, number, number];
  } | null;
  __plane: { getProgress: () => number | null; sprite: { visible: boolean } } | null;
  __layer: {
    currentRoute: {
      origin: { lat: number; lng: number };
      dest: { lat: number; lng: number };
      roundTrip: boolean;
      arcs: { id: string; lift: number }[];
    } | null;
  } | null;
};

test('round-trip route draws two separated arcs, then reports drawn', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  const here = new URL('./fixtures/routes.html', import.meta.url);
  await page.goto(here.href);

  const state = await page.evaluate(() => (window as unknown as Hooks).__state);
  expect(state.error, `fixture error: ${state.error}`).toBeNull();
  expect(state.webgl).toBe(true);

  await page.waitForFunction(
    () => (window as unknown as Hooks).__globe?.isReady === true,
    undefined,
    { timeout: 30_000 },
  );

  // Route model: two arcs with separated lifts, return reversed.
  const route = await page.evaluate(() => (window as unknown as Hooks).__layer?.currentRoute);
  expect(route).not.toBeNull();
  const r = route!;
  expect(r.roundTrip).toBe(true);
  expect(r.arcs).toHaveLength(2);
  const [out, back] = r.arcs;
  expect(out?.id).toBe('outbound');
  expect(back?.id).toBe('return');
  expect(back?.lift).toBeGreaterThan(out?.lift ?? 0);

  // Draw-on animation completes (one callback per setRoute).
  await page.waitForFunction(() => (window as unknown as Hooks).__state.drawn === 1, undefined, {
    timeout: 15_000,
  });

  // The frame is still a solid globe (arcs/marker render without breaking the scene).
  const center = await page.evaluate(() =>
    (window as unknown as Hooks).__globe!.readPixel(640, 360),
  );
  expect(center[3]).toBeGreaterThan(200);

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});
