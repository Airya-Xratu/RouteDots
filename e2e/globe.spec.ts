import { expect, test } from '@playwright/test';

type Hooks = {
  __state: { ready: boolean; error: string | null; webgl: boolean | null };
  __globe: {
    isReady: boolean;
    readPixel: (x: number, y: number) => [number, number, number, number];
    setView: (v: { lat: number; lng: number; altitude: number }, ms?: number) => void;
    getCameraState: () => { lat: number; lng: number; altitude: number };
    borders: {
      segmentCount: number;
      lines: { material: { color: { getHexString: () => string } } };
    } | null;
    countries: { triangleCount: number } | null;
  } | null;
};

test('the map renders in WebGL and tweens the camera', async ({ page }) => {
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

  // Centre of the frame should be opaque map surface, and a wide patch around
  // it should hold both the grey country fills and the lighter ocean / white
  // borders (a wide patch so antialiasing or a single border can't flake it).
  const center = await page.evaluate(() =>
    (window as unknown as Hooks).__globe!.readPixel(640, 400),
  );
  expect(center[3]).toBeGreaterThan(200); // opaque
  const patch = await page.evaluate(() => {
    const src = document.querySelector('canvas');
    if (!src) return null;
    const copy = document.createElement('canvas');
    copy.width = src.width;
    copy.height = src.height;
    const ctx = copy.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0);
    const half = 200;
    const cx = Math.floor(src.width / 2);
    const cy = Math.floor(src.height / 2);
    const img = ctx.getImageData(cx - half, cy - half, half * 2, half * 2).data;
    let minR = 255;
    let maxR = 0;
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i]!;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
    return { minR, maxR };
  });
  expect(patch).not.toBeNull();
  expect(patch!.maxR).toBeGreaterThan(235); // ocean / white borders
  expect(patch!.minR).toBeLessThan(220); // grey country fills

  // A far corner should be transparent page background.
  const corner = await page.evaluate(() => (window as unknown as Hooks).__globe!.readPixel(4, 4));
  expect(corner[3]).toBeLessThan(40);

  // Grey country fills are triangulated once into a single mesh.
  const triangles = await page.evaluate(
    () => (window as unknown as Hooks).__globe?.countries?.triangleCount ?? 0,
  );
  expect(triangles).toBeGreaterThan(10_000);

  // Country borders are drawn as a single white LineSegments layer.
  const borders = await page.evaluate(() => {
    const layer = (window as unknown as Hooks).__globe?.borders;
    return layer
      ? { segments: layer.segmentCount, color: layer.lines.material.color.getHexString() }
      : null;
  });
  expect(borders).not.toBeNull();
  expect(borders!.segments).toBeGreaterThan(5000);
  expect(borders!.color).toBe('ffffff');

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
