import { expect, test, type Page } from '@playwright/test';

type ViewState = { lat: number; lng: number; altitude: number };

type Hooks = {
  __state: { ready: boolean; error: string | null; webgl: boolean | null };
  __rd: {
    mode: 'webgl' | 'flat' | null;
    setRoute: (from: string, to: string, options?: { roundTrip?: boolean }) => boolean;
    clearRoute: () => void;
    getCameraState: () => ViewState | null;
    setView: (view: ViewState, durationMs?: number) => void;
  } | null;
};

const getCamera = (page: Page): Promise<ViewState> =>
  page.evaluate(() => {
    const rd = (window as unknown as Hooks).__rd!;
    return rd.getCameraState() as ViewState;
  });

test('the camera tracks the plane and yields to explicit views', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  const here = new URL('./fixtures/tracking.html', import.meta.url);
  await page.goto(here.href);

  const state = await page.evaluate(() => (window as unknown as Hooks).__state);
  expect(state.error, `fixture error: ${state.error}`).toBeNull();
  expect(state.webgl, 'WebGL should be available in headless chromium').toBe(true);
  expect(await page.evaluate(() => (window as unknown as Hooks).__rd!.mode)).toBe('webgl');

  // Public camera API is available (WebGL mode).
  expect(await getCamera(page)).not.toBeNull();

  // Set a route: the camera frames it (frameRoute tween, 1400 ms), then holds.
  await page.evaluate(() => (window as unknown as Hooks).__rd!.setRoute('LHR', 'DXB'));
  await page.waitForTimeout(2_200);
  const framed = await getCamera(page);

  // Idle auto-rotation is paused while the route is set: the camera holds
  // (0.5°/s of drift would be visible at 0.3° over 1.2 s).
  await page.waitForTimeout(1_200);
  const held = await getCamera(page);
  expect(Math.abs(held.lng - framed.lng)).toBeLessThan(0.3);

  // Yank the camera far away with an explicit view: the tween wins first…
  const yankTo: ViewState = { lat: 20, lng: framed.lng - 80, altitude: 1.6 };
  await page.evaluate((v) => (window as unknown as Hooks).__rd!.setView(v, 700), yankTo);
  await page.waitForTimeout(1_100);
  const yanked = await getCamera(page);
  expect(yanked.lng).toBeCloseTo(yankTo.lng, 0);

  // …then tracking eases the camera back toward the plane.
  await page.waitForTimeout(2_500);
  const tracked = await getCamera(page);
  expect(tracked.lng).toBeGreaterThan(yanked.lng + 20);

  // Clear the route: tracking disengages and idle rotation resumes.
  await page.evaluate(() => (window as unknown as Hooks).__rd!.clearRoute());
  await page.waitForTimeout(100);
  const before = await getCamera(page);
  await page.waitForTimeout(1_500);
  const after = await getCamera(page);
  expect(after.lng).toBeGreaterThan(before.lng + 0.25);

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});
