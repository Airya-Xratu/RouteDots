import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

type Hooks = {
  __rd: {
    mode: string | null;
    getRoute: () => { from: { code: string }; to: { code: string }; roundTrip: boolean } | null;
    setRoute: (f: string, t: string, o?: { roundTrip?: boolean }) => boolean;
    getCityMarkers: () => { count: number } | null;
    getRouteStyle: () => {
      outbound: {
        color: string;
        angle: number;
        strokeWidth: number;
        dash: { length: number } | null;
      };
      return: { angle: number };
    } | null;
    getCityStyle: () => { ripple: { periodMs: number } } | null;
    getCamera3D: () => {
      enabled: boolean;
      interactive: boolean;
      tilt: number;
      yaw: number;
      depth: number;
    } | null;
    getFlatMap: () => { getViewState: () => { scale: number } } | null;
  } | null;
};

const showcasePath = fileURLToPath(new URL('../examples/showcase/index.html', import.meta.url));

/** Opens the showcase and waits until RouteDots has picked a renderer. */
async function openShowcase(page: Page): Promise<void> {
  await page.goto(new URL('../examples/showcase/index.html', import.meta.url).href);
  await page.waitForFunction(
    () => {
      const rd = (window as unknown as { __rd?: { mode: string | null } }).__rd;
      return Boolean(rd && rd.mode !== null);
    },
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * Playwright's `fill` types into text fields, but the studio's sliders are
 * driven the way a keyboard user does it: focus, then arrow keys (which fire
 * real `input` events).
 */
async function nudgeSlider(page: Page, id: string, presses: number, key: string): Promise<void> {
  await page.locator(`#${id}`).focus();
  for (let i = 0; i < Math.abs(presses); i++) {
    await page.keyboard.press(key);
  }
}

test('showcase hero: form drives the globe route', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await openShowcase(page);

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

test('showcase studio: every customization applies live', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await openShowcase(page);

  // The studio coalesces each control change into one animation frame, so the
  // values it produces are polled (the assertions retry until they hold).
  const routeStyle = () => page.evaluate(() => (window as unknown as Hooks).__rd!.getRouteStyle()!);
  const cityStyle = () => page.evaluate(() => (window as unknown as Hooks).__rd!.getCityStyle()!);
  const camera = () => page.evaluate(() => (window as unknown as Hooks).__rd!.getCamera3D());
  const mode = () => page.evaluate(() => (window as unknown as Hooks).__rd!.mode);
  const layerTransform = () =>
    page.evaluate(
      () => (document.querySelector('[data-rd-layer="routes"]') as HTMLElement).style.transform,
    );

  // The studio is closed until it is asked for.
  const studio = page.locator('#studio');
  await expect(studio).toBeHidden();
  await page.click('#studio-toggle');
  await expect(studio).toBeVisible();
  await expect(page.locator('#studio-code')).toContainText('rd.setOptions');

  // ── curve angles: both legs, straight from the sliders ───────────────────
  await page.locator('#angle-outbound').fill('30');
  await expect.poll(async () => (await routeStyle()).outbound.angle).toBe(30);
  await page.locator('#angle-return').fill('-40');
  await expect.poll(async () => (await routeStyle()).return.angle).toBe(-40);

  // Keyboard nudging works too (a real user gesture).
  await nudgeSlider(page, 'angle-outbound', 5, 'ArrowRight');
  await expect.poll(async () => (await routeStyle()).outbound.angle).toBe(35);

  // ── dashes: length, gap, speed and thickness ─────────────────────────────
  await page.locator('#dash-length').fill('0.08');
  await page.locator('#dash-gap').fill('0.04');
  await page.locator('#dash-width').fill('2.5');
  await page.locator('#dash-speed').fill('4');
  await expect.poll(async () => (await routeStyle()).outbound.dash?.length).toBeCloseTo(0.08, 3);
  await expect.poll(async () => (await routeStyle()).outbound.strokeWidth).toBeCloseTo(2.5, 2);

  // ── colours, ripple and the plane icon, in the flat world ────────────────
  await page.selectOption('#world', 'flat');
  await expect.poll(mode).toBe('flat');
  await page.locator('#color-outbound').fill('#ff0066');
  await page.locator('#color-cities').fill('#22cc88');
  await expect.poll(async () => (await routeStyle()).outbound.color).toBe('#ff0066');
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('circle.rd-city-dot')?.getAttribute('fill') ?? ''),
    )
    .toBe('#22cc88');

  // Dashes are real SVG dashes in the flat world (fractions of the path).
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector('[data-rd-layer="routes"] path[stroke="#ff0066"]') !== null,
      ),
    )
    .toBe(true);
  const dashes = await page.evaluate(() => {
    const path = document.querySelector(
      '[data-rd-layer="routes"] path[stroke="#ff0066"]',
    ) as SVGPathElement | null;
    if (!path) return null;
    const length = path.getTotalLength();
    const [dash = 0, gap = 0] = (path.getAttribute('stroke-dasharray') ?? '')
      .split(' ')
      .map(Number);
    return {
      dashFraction: dash / length,
      gapFraction: gap / length,
      width: Number(path.getAttribute('stroke-width')),
      flow: getComputedStyle(path).animationName,
      duration: path.style.getPropertyValue('--rd-dash-duration'),
    };
  });
  expect(dashes).not.toBeNull();
  expect(dashes!.dashFraction).toBeCloseTo(0.08, 2);
  expect(dashes!.gapFraction).toBeCloseTo(0.04, 2);
  expect(dashes!.width).toBeCloseTo(2.5, 2);
  expect(dashes!.flow).toBe('rd-dash-flow');
  expect(dashes!.duration).toBe('250ms'); // 4 dashes per second

  // ── city ripple: period, growth, ring geometry ───────────────────────────
  await page.locator('#city-period').fill('1200');
  await page.locator('#city-grow').fill('5');
  await page.locator('#city-ring').fill('0.02');
  await page.locator('#city-ring-width').fill('0.004');
  await expect.poll(async () => (await cityStyle()).ripple.periodMs).toBe(1200);
  const ripple = () =>
    page.evaluate(() => {
      const ring = document.querySelector('circle.rd-city-ring')!;
      const style = getComputedStyle(ring);
      return {
        period: style.getPropertyValue('--rd-city-period').trim(),
        grow: style.getPropertyValue('--rd-city-ring-grow').trim(),
        radius: Number(ring.getAttribute('r')),
        width: Number(ring.getAttribute('stroke-width')),
      };
    });
  await expect.poll(async () => (await ripple()).period).toBe('1200ms');
  await expect.poll(async () => Number((await ripple()).grow)).toBeCloseTo(6, 1); // 1 + grow
  await expect.poll(async () => (await ripple()).radius).toBeGreaterThan(4);
  await expect.poll(async () => (await ripple()).width).toBeGreaterThan(1.2);

  // ── the plane icon is a component: presets and raw SVG paths ─────────────
  await page.selectOption('#plane-icon', 'jet');
  await expect(page.locator('[data-rd-plane]')).toHaveAttribute('data-rd-plane', 'jet');
  await page.selectOption('#plane-icon', 'custom');
  await page.locator('#plane-path').fill('M0,-40 L18,26 L-18,26 Z');
  await expect(page.locator('[data-rd-plane]')).toHaveAttribute('data-rd-plane', 'custom');
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('[data-rd-plane] path')?.getAttribute('d') ?? ''),
    )
    .toContain('M0,-40');

  // ── the 3D camera effect: perspective, depth, orbit, zoom ────────────────
  await page.click('#cam3d');
  await expect.poll(camera).toMatchObject({ enabled: true, interactive: true });
  expect(
    await page.evaluate(() => getComputedStyle(document.getElementById('globe')!).perspective),
  ).toBe('1400px');
  await expect.poll(layerTransform).toBe('translateZ(44px)');
  await page.locator('#cam-tilt').fill('50');
  await page.locator('#cam-depth').fill('120');
  await expect.poll(camera).toMatchObject({ tilt: 50, depth: 120 });
  await expect.poll(layerTransform).toBe('translateZ(120px)');

  // Drag orbits; scrolling zooms (interactive is armed when the camera turns on).
  // The studio applies its own state on the next animation frame, so let any
  // frame queued by the sliders above land before measuring the gesture.
  await page.waitForTimeout(200);
  const before = (await camera())!;
  const box = (await page.locator('#globe').boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // Instrument the gesture: the log records every pointer event that reaches
  // the flat world's container together with the camera yaw the library has
  // applied by the time our (later) listener runs.
  const surface = await page.evaluate((at) => {
    const el = document.getElementById('globe')!;
    const log: string[] = [];
    (window as unknown as { __dragLog: string[] }).__dragLog = log;
    for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) {
      el.addEventListener(type, (event) => {
        const pointer = event as PointerEvent;
        const rd = (window as unknown as Hooks).__rd!;
        log.push(`${type}(${pointer.clientX},${pointer.clientY}) yaw=${rd.getCamera3D()?.yaw}`);
      });
    }
    const hit = document.elementFromPoint(at.x, at.y);
    const rect = el.getBoundingClientRect();
    return {
      hit: hit ? `<${hit.tagName.toLowerCase()} class="${hit.getAttribute('class') ?? ''}">` : null,
      rect: [rect.x, rect.y, rect.width, rect.height],
    };
  }, centre);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 60, centre.y + 30, { steps: 6 });
  await page.mouse.up();
  const dragLog = await page.evaluate(
    () => (window as unknown as { __dragLog: string[] }).__dragLog,
  );
  const diagnostic = `drag from (${centre.x},${centre.y}) over ${surface.hit}; log=${JSON.stringify(
    dragLog,
  )}`;
  await expect
    .poll(async () => (await camera())!.yaw, { message: diagnostic })
    .toBeGreaterThan(before.yaw);
  await expect.poll(async () => (await camera())!.tilt).toBeGreaterThan(before.tilt);

  const zoomBefore = await page.evaluate(
    () => (window as unknown as Hooks).__rd!.getFlatMap()!.getViewState().scale,
  );
  await page.mouse.wheel(0, -240);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as Hooks).__rd!.getFlatMap()!.getViewState().scale),
    )
    .toBeGreaterThan(zoomBefore);

  // Turning the camera on while the 3D globe is showing moves the world to the
  // flat map: that is where the effect lives.
  await page.selectOption('#world', 'auto');
  await expect.poll(mode).toBe('webgl');
  expect(await camera()).toBeNull();
  await page.click('#cam3d');
  await page.click('#cam3d');
  await expect(page.locator('#world')).toHaveValue('flat');
  await expect.poll(mode).toBe('flat');

  // ── reset puts everything back ───────────────────────────────────────────
  await page.click('#studio-reset');
  await expect.poll(async () => (await routeStyle()).outbound.angle).toBe(0);
  await expect.poll(async () => (await routeStyle()).outbound.strokeWidth).toBeCloseTo(1.8, 2);
  await expect.poll(async () => (await cityStyle()).ripple.periodMs).toBe(2600);
  await expect(page.locator('#plane-icon')).toHaveValue('airliner');
  await expect(page.locator('#world')).toHaveValue('auto');

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});
