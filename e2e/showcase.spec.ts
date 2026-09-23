import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

type Hooks = {
  __rd: {
    getRoute: () => { from: { code: string }; to: { code: string }; roundTrip: boolean } | null;
    setRoute: (f: string, t: string, o?: { roundTrip?: boolean }) => boolean;
    getCityMarkers: () => { count: number } | null;
    getRouteStyle: () => {
      outbound: {
        color: string;
        angle: number;
        dash: { length: number } | null;
        strokeWidth: number;
      };
      return: { angle: number };
    } | null;
    getCityStyle: () => { ripple: { periodMs: number } } | null;
    getCamera3D: () => { enabled: boolean; tilt: number; yaw: number } | null;
    getFlatMap: () => { getViewState: () => { scale: number } } | null;
    mode: string | null;
  } | null;
};

const showcasePath = fileURLToPath(new URL('../examples/showcase/index.html', import.meta.url));

test('showcase hero: form drives the globe route', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  const here = new URL('../examples/showcase/index.html', import.meta.url);
  await page.goto(here.href);

  await page.waitForFunction(
    () => {
      const rd = (window as unknown as { __rd?: { mode: string | null } }).__rd;
      return Boolean(rd && rd.mode !== null);
    },
    undefined,
    { timeout: 30_000 },
  );

  // Default route is LHR → DXB round trip — and the form reports it.
  const route = await page.evaluate(() => (window as unknown as Hooks).__rd!.getRoute());
  expect(route?.from.code).toBe('LHR');
  expect(route?.to.code).toBe('DXB');
  expect(route?.roundTrip).toBe(true);
  expect(await page.textContent('#hint')).toContain('London → Dubai');

  // Every bundled airport city carries a blinking marker layer.
  const cityCount = await page.evaluate(
    () => (window as unknown as Hooks).__rd!.getCityMarkers()?.count ?? 0,
  );
  expect(cityCount).toBe(31);

  // Pin badges show the city names at both endpoints.
  await page.waitForFunction(
    () => {
      const pins = Array.from(document.querySelectorAll<HTMLElement>('.rd-pin'));
      return pins.length === 2 && pins.every((p) => p.style.opacity === '1');
    },
    undefined,
    { timeout: 15_000 },
  );
  const pinNames = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.rd-pin .rd-pin-label')).map((n) => n.textContent),
  );
  expect(pinNames).toEqual(['London', 'Dubai']);

  // Changing the destination updates the route live… and the pin with it.
  await page.selectOption('#to', 'SIN');
  await page.waitForTimeout(300);
  const route2 = await page.evaluate(() => (window as unknown as Hooks).__rd!.getRoute());
  expect(route2?.to.code).toBe('SIN');
  expect(await page.textContent('#hint')).toContain('Singapore');
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.rd-pin .rd-pin-label'))
        .map((n) => n.textContent)
        .join('|') === 'London|Singapore',
    undefined,
    { timeout: 5_000 },
  );

  // One-way toggle drops the return arc; swap exchanges endpoints.
  await page.click('#one-way');
  await page.waitForTimeout(300);
  const route3 = await page.evaluate(() => (window as unknown as Hooks).__rd!.getRoute());
  expect(route3?.roundTrip).toBe(false);

  await page.click('#swap');
  await page.waitForTimeout(300);
  const route4 = await page.evaluate(() => (window as unknown as Hooks).__rd!.getRoute());
  expect(route4?.from.code).toBe('SIN');
  expect(route4?.to.code).toBe('LHR');

  // The theme switcher flips light/dark live without errors.
  await page.click('#theme');
  expect(await page.textContent('#theme')).toBe('☀️');
  await page.click('#theme');
  expect(await page.textContent('#theme')).toBe('🌙');

  // Selecting the same city twice is rejected gracefully.
  await page.selectOption('#from', 'LHR');
  await page.selectOption('#to', 'LHR');
  await page.waitForTimeout(200);
  const hint = await page.textContent('#hint');
  expect(hint).toContain('two different cities');

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('showcase without the built bundle explains what to do', async ({ page }) => {
  // Strip the external IIFE script so the page simulates a fresh clone that
  // has not been built yet.
  const html = readFileSync(showcasePath, 'utf8').replace(
    /<script src="[^"]*routedots[^"]*"><\/script>/,
    '',
  );
  await page.setContent(html);

  const note = page.locator('.build-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('npm run build');
  const rdInstance = await page.evaluate(() => (window as unknown as { __rd?: unknown }).__rd);
  expect(rdInstance).toBeFalsy();
});

/**
 * Playwright can type into every control except a range input, so sliders are
 * driven the way a keyboard user does it: focus, then arrow keys (which fire
 * real `input` events).
 */
async function nudgeSlider(page: Page, id: string, presses: number, key: string): Promise<void> {
  await page.locator(`#${id}`).focus();
  for (let i = 0; i < Math.abs(presses); i++) {
    await page.keyboard.press(key);
  }
}

test('showcase studio: every customization applies live', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  const here = new URL('../examples/showcase/index.html', import.meta.url);
  await page.goto(here.href);
  await page.waitForFunction(
    () => {
      const rd = (window as unknown as { __rd?: { mode: string | null } }).__rd;
      return Boolean(rd && rd.mode !== null);
    },
    undefined,
    { timeout: 30_000 },
  );

  // The studio is closed until it is asked for.
  const studio = page.locator('#studio');
  await expect(studio).toBeHidden();
  await page.click('#studio-toggle');
  await expect(studio).toBeVisible();
  await expect(page.locator('#studio-code')).toContainText('rd.setOptions');

  // ── curve angles: both legs, straight from the sliders ───────────────────
  await page.locator('#angle-outbound').fill('30');
  const angleOut = await page.evaluate(
    () => (window as unknown as Hooks).__rd!.getRouteStyle()!.outbound.angle,
  );
  expect(angleOut).toBe(30);
  await page.locator('#angle-return').fill('-40');
  const angleBack = await page.evaluate(
    () => (window as unknown as Hooks).__rd!.getRouteStyle()!.return.angle,
  );
  expect(angleBack).toBe(-40);
  await expect(page.locator('#angle-outbound')).toHaveValue('30');

  // Keyboard nudging works too (a real user gesture).
  await nudgeSlider(page, 'angle-outbound', 5, 'ArrowRight');
  expect(
    await page.evaluate(() => (window as unknown as Hooks).__rd!.getRouteStyle()!.outbound.angle),
  ).toBe(35);

  // ── dashes: length, gap, speed and thickness ─────────────────────────────
  await page.locator('#dash-length').fill('0.08');
  await page.locator('#dash-gap').fill('0.04');
  await page.locator('#dash-width').fill('2.5');
  await page.locator('#dash-speed').fill('4');
  const dash = await page.evaluate(
    () => (window as unknown as Hooks).__rd!.getRouteStyle()!.outbound,
  );
  expect(dash.dash!.length).toBeCloseTo(0.08, 3);
  expect(dash.strokeWidth).toBeCloseTo(2.5, 2);

  // ── colours, dashes, ripple and the plane icon, in the flat world ──────
  await page.selectOption('#world', 'flat');
  await page.waitForTimeout(200);
  await page.locator('#color-outbound').fill('#ff0066');
  await page.locator('#color-cities').fill('#22cc88');
  expect(
    await page.evaluate(() => (window as unknown as Hooks).__rd!.getRouteStyle()!.outbound.color),
  ).toBe('#ff0066');
  expect(
    await page.evaluate(
      () => document.querySelector('circle.rd-city-dot')?.getAttribute('fill') ?? '',
    ),
  ).toBe('#22cc88');

  // Dashes are real SVG dashes in the flat world (fractions of the path).
  const dashes = await page.evaluate(() => {
    const path = document.querySelector(
      '[data-rd-layer="routes"] path[stroke="#ff0066"]',
    ) as SVGPathElement | null;
    if (!path) return null;
    const [dash = 0, gap = 0] = (path.getAttribute('stroke-dasharray') ?? '')
      .split(' ')
      .map(Number);
    return {
      length: path.getTotalLength(),
      dash,
      gap,
      width: path.getAttribute('stroke-width'),
      flow: getComputedStyle(path).animationName,
      duration: path.style.getPropertyValue('--rd-dash-duration'),
    };
  });
  expect(dashes).not.toBeNull();
  expect(dashes!.dash / dashes!.length).toBeCloseTo(0.08, 2);
  expect(dashes!.gap / dashes!.length).toBeCloseTo(0.04, 2);
  expect(Number(dashes!.width)).toBeCloseTo(2.5, 2);
  expect(dashes!.flow).toBe('rd-dash-flow');
  expect(dashes!.duration).toBe('250ms'); // 4 dashes per second

  // ── city ripple: period, growth, ring geometry ───────────────────────────
  await page.locator('#city-period').fill('1200');
  await page.locator('#city-grow').fill('5');
  await page.locator('#city-ring').fill('0.02');
  await page.locator('#city-ring-width').fill('0.004');
  const city = await page.evaluate(() => (window as unknown as Hooks).__rd!.getCityStyle()!.ripple);
  expect(city.periodMs).toBe(1200);
  const ripple = await page.evaluate(() => {
    const ring = document.querySelector('circle.rd-city-ring')!;
    return {
      period: getComputedStyle(ring).getPropertyValue('--rd-city-period').trim(),
      grow: getComputedStyle(ring).getPropertyValue('--rd-city-ring-grow').trim(),
      radius: Number(ring.getAttribute('r')),
      width: Number(ring.getAttribute('stroke-width')),
    };
  });
  expect(ripple.period).toBe('1200ms');
  expect(Number(ripple.grow)).toBeCloseTo(6, 1); // 1 + grow
  expect(ripple.radius).toBeGreaterThan(4);
  expect(ripple.width).toBeGreaterThan(1.2);

  // ── the plane icon is a component: presets and raw SVG paths ─────────────
  await page.selectOption('#plane-icon', 'jet');
  await expect(page.locator('[data-rd-plane]')).toHaveAttribute('data-rd-plane', 'jet');
  await page.selectOption('#plane-icon', 'custom');
  await page.locator('#plane-path').fill('M0,-40 L18,26 L-18,26 Z');
  await expect(page.locator('[data-rd-plane]')).toHaveAttribute('data-rd-plane', 'custom');
  expect(
    await page.evaluate(
      () => document.querySelector('[data-rd-plane] path')?.getAttribute('d') ?? '',
    ),
  ).toContain('M0,-40');

  // ── the 3D camera effect: perspective, depth, orbit, zoom ────────────────
  await page.click('#cam3d');
  const camera = await page.evaluate(() => (window as unknown as Hooks).__rd!.getCamera3D());
  expect(camera?.enabled).toBe(true);
  expect(
    await page.evaluate(() => getComputedStyle(document.getElementById('globe')!).perspective),
  ).toBe('1400px');
  expect(
    await page.evaluate(
      () => (document.querySelector('[data-rd-layer="routes"]') as HTMLElement).style.transform,
    ),
  ).toBe('translateZ(44.00px)');
  await page.locator('#cam-tilt').fill('50');
  await page.locator('#cam-depth').fill('120');
  expect(await page.evaluate(() => (window as unknown as Hooks).__rd!.getCamera3D())).toMatchObject(
    { tilt: 50, depth: 120 },
  );
  expect(
    await page.evaluate(
      () => (document.querySelector('[data-rd-layer="routes"]') as HTMLElement).style.transform,
    ),
  ).toBe('translateZ(120.00px)');

  // Drag orbits; scrolling zooms (interactive is armed when the camera turns on).
  const before = await page.evaluate(() => (window as unknown as Hooks).__rd!.getCamera3D()!);
  const box = (await page.locator('#globe').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => (window as unknown as Hooks).__rd!.getCamera3D()!);
  expect(after.yaw).toBeGreaterThan(before.yaw);
  expect(after.tilt).toBeGreaterThan(before.tilt);

  const zoomBefore = await page.evaluate(
    () => (window as unknown as Hooks).__rd!.getFlatMap()!.getViewState().scale,
  );
  await page.mouse.wheel(0, -240);
  const zoomAfter = await page.evaluate(
    () => (window as unknown as Hooks).__rd!.getFlatMap()!.getViewState().scale,
  );
  expect(zoomAfter).toBeGreaterThan(zoomBefore);

  // Turning the camera on from the 3D world moves the world to the flat map:
  // the effect lives there.
  await page.selectOption('#world', 'auto');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as Hooks).__rd!.getCamera3D())).toBeNull();
  await page.click('#cam3d');
  await page.click('#cam3d');
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(() => (document.getElementById('world') as HTMLSelectElement).value),
  ).toBe('flat');
  expect(await page.evaluate(() => (window as unknown as Hooks).__rd!.mode)).toBe('flat');

  // ── reset puts everything back ───────────────────────────────────────────
  await page.click('#studio-reset');
  const reset = await page.evaluate(() => {
    const rd = (window as unknown as Hooks).__rd!;
    return {
      route: rd.getRouteStyle(),
      cities: rd.getCityStyle(),
      camera: rd.getCamera3D(),
      icon: (document.getElementById('plane-icon') as HTMLSelectElement).value,
      world: (document.getElementById('world') as HTMLSelectElement).value,
    };
  });
  expect(reset.route!.outbound.angle).toBe(0);
  expect(reset.route!.outbound.strokeWidth).toBeCloseTo(1.8, 2);
  expect(reset.cities!.ripple.periodMs).toBe(2600);
  expect(reset.camera?.enabled ?? false).toBe(false);
  expect(reset.icon).toBe('airliner');
  expect(reset.world).toBe('auto');

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});
