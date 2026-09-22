import { expect, test } from '@playwright/test';

type Hooks = {
  __state: { ready: boolean; error: string | null; webgl: boolean | null };
  __globe: {
    isReady: boolean;
    readPixel: (x: number, y: number) => [number, number, number, number];
    setView: (v: { lat: number; lng: number; altitude: number }, ms?: number) => void;
    getCameraState: () => { lat: number; lng: number; altitude: number };
  } | null;
};

test('dot globe renders in WebGL and tweens the camera', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  const here = new URL('./fixtures/globe.html', import.meta.url);
  await page.goto(here.href);

  const state = await page.evaluate(() => (window as unknown as Hooks).__state);
  expect(state.error, `fixture error: ${state.error}`).toBeNull();
  expect(state.webgl, 'WebGL should be available in headless chromium').toBe(true);

  await page.waitForFunction(
    () => (window as unknown as Hooks).__globe?.isReady === true,
    undefined,
    { timeout: 30_000 },
  );

  // Centre of the frame should be the (white) globe surface with real alpha.
  const center = await page.evaluate(() =>
    (window as unknown as Hooks).__globe!.readPixel(640, 400),
  );
  expect(center[3]).toBeGreaterThan(200); // opaque
  expect(center[0]).toBeGreaterThan(180); // bright (light theme globe)

  // A far corner should be transparent page background.
  const corner = await page.evaluate(() => (window as unknown as Hooks).__globe!.readPixel(4, 4));
  expect(corner[3]).toBeLessThan(40);

  // Camera tween: animate to a new view and verify the rig lands there.
  await page.evaluate(() =>
    (window as unknown as Hooks).__globe!.setView({ lat: 10, lng: 95, altitude: 1.6 }, 600),
  );
  await page.waitForTimeout(1_100);
  const view = await page.evaluate(() => (window as unknown as Hooks).__globe!.getCameraState());
  expect(view.lat).toBeCloseTo(10, 1);
  expect(view.lng).toBeCloseTo(95, 1);
  expect(view.altitude).toBeCloseTo(1.6, 1);

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});
