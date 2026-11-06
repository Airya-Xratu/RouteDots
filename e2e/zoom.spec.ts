import { expect, test } from '@playwright/test';

type View = { scale: number; cx: number; cy: number };

type Hooks = {
  __state: { ready: boolean; error: string | null; drawn: number };
  __rd: {
    mode: string | null;
    getRoute: () => { from: { code: string }; to: { code: string } } | null;
    setRoute: (from: string, to: string, options?: { roundTrip?: boolean }) => boolean;
    clearRoute: () => void;
    getFlatMap: () => {
      getViewState: () => View;
      isRouteDrawn: boolean;
    } | null;
  };
};

const MAP = { width: 1600, height: 800 };

/** The map point the scene puts at the viewport centre, in screen px. */
function toScreen(point: { x: number; y: number }, view: View, viewport: { w: number; h: number }) {
  return {
    x: viewport.w / 2 + (point.x - view.cx) * view.scale,
    y: viewport.h / 2 + (point.y - view.cy) * view.scale,
  };
}

const lhr = { x: ((-0.128 + 180) / 360) * MAP.width, y: ((90 - 51.507) / 180) * MAP.height };
const dxb = { x: ((55.271 + 180) / 360) * MAP.width, y: ((90 - 25.204) / 180) * MAP.height };

test('flat world: whole world at rest, zoom to the route, then draw it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // A calm zoom, so the mid-flight assertions are reliable.
  await page.goto(new URL('./fixtures/zoom.html', import.meta.url).href);
  const state = await page.evaluate(() => (window as unknown as Hooks).__state);
  expect(state.error, `fixture error: ${state.error}`).toBeNull();

  // ── Nothing to draw: the whole world, contained and centred ──────────────
  const rest = await page.evaluate(() => {
    const rd = (window as unknown as Hooks).__rd;
    const map = document.getElementById('map')!;
    return {
      mode: rd.mode,
      view: rd.getFlatMap()!.getViewState(),
      viewport: { w: map.clientWidth, h: map.clientHeight },
      routePaths: document.querySelectorAll('[data-rd-layer="routes"] path[stroke]').length,
    };
  });
  expect(rest.mode).toBe('flat');
  expect(rest.routePaths).toBe(0);
  expect(rest.view.cx).toBeCloseTo(MAP.width / 2, 6);
  expect(rest.view.cy).toBeCloseTo(MAP.height / 2, 6);

  // Every corner of the world is inside the viewport — the map opens wide.
  const corners = await page.evaluate(
    ({ view, viewport, map }) => {
      const at = (x: number, y: number) => ({
        x: viewport.w / 2 + (x - view.cx) * view.scale,
        y: viewport.h / 2 + (y - view.cy) * view.scale,
      });
      return [at(0, 0), at(map.width, 0), at(0, map.height), at(map.width, map.height)];
    },
    { view: rest.view, viewport: rest.viewport, map: MAP },
  );
  for (const corner of corners) {
    expect(corner.x).toBeGreaterThanOrEqual(-0.5);
    expect(corner.x).toBeLessThanOrEqual(rest.viewport.w + 0.5);
    expect(corner.y).toBeGreaterThanOrEqual(-0.5);
    expect(corner.y).toBeLessThanOrEqual(rest.viewport.h + 0.5);
  }

  // ── A route: zoom first, keep the route off the map while it flies ───────
  const started = await page.evaluate(() => {
    const rd = (window as unknown as Hooks).__rd;
    const ok = rd.setRoute('LHR', 'DXB', { roundTrip: true });
    return {
      ok,
      drawn: (window as unknown as Hooks).__state.drawn,
      paths: document.querySelectorAll('[data-rd-layer="routes"] path[stroke]').length,
      labels: document.querySelectorAll('[data-rd-layer="routes"] text').length,
    };
  });
  expect(started.ok).toBe(true);
  // The route is not stamped on a moving map…
  expect(started.drawn).toBe(0);
  expect(started.paths).toBe(0);
  expect(started.labels).toBe(0);

  // …it lands once the camera has arced in, and the app is told.
  await page.waitForFunction(() => (window as unknown as Hooks).__state.drawn === 1, undefined, {
    timeout: 5000,
  });
  const framed = await page.evaluate(() => {
    const rd = (window as unknown as Hooks).__rd;
    const map = document.getElementById('map')!;
    const label = document.querySelector<SVGTextElement>('[data-rd-layer="routes"] text');
    const transform = label?.getAttribute('transform') ?? '';
    const scaleMatch = /scale\(([^)]+)\)/.exec(transform);
    return {
      route: rd.getRoute(),
      view: rd.getFlatMap()!.getViewState(),
      drawn: rd.getFlatMap()!.isRouteDrawn,
      viewport: { w: map.clientWidth, h: map.clientHeight },
      paths: document.querySelectorAll('[data-rd-layer="routes"] path[stroke]').length,
      labels: Array.from(document.querySelectorAll('[data-rd-layer="routes"] text')).map(
        (el) => el.textContent,
      ),
      fontSize: Number(label?.getAttribute('font-size')),
      labelScale: scaleMatch ? Number(scaleMatch[1]) : null,
    };
  });
  expect(framed.drawn).toBe(true);
  expect(framed.route?.from.code).toBe('LHR');
  expect(framed.route?.to.code).toBe('DXB');
  expect(framed.paths).toBe(1);
  expect(framed.labels).toEqual(['London', 'Dubai']);

  // Zoomed in on the city pair — a real close-up, not the old 2.2× cap in
  // absolute terms, and never past the configured 4× the world view.
  expect(framed.view.scale).toBeGreaterThan(rest.view.scale * 3);
  expect(framed.view.scale).toBeLessThanOrEqual(rest.view.scale * 4 + 1e-6);
  // …but never into a microscope: at least ~90 map px of the world stays on
  // screen, so there is always some geography around the two cities.
  expect(framed.viewport.h / framed.view.scale).toBeGreaterThanOrEqual(88);

  // Both airports are on screen, with room for their dots and city names.
  for (const airport of [lhr, dxb]) {
    const point = toScreen(airport, framed.view, framed.viewport);
    expect(point.x).toBeGreaterThan(40);
    expect(point.x).toBeLessThan(framed.viewport.w - 40);
    expect(point.y).toBeGreaterThan(40);
    expect(point.y).toBeLessThan(framed.viewport.h - 40);
  }

  // The city name keeps the configured size on screen: the label is
  // counter-scaled by the map's zoom (font-size × local scale × view scale is
  // the configured px, whatever the zoom).
  expect(framed.fontSize).toBe(24); // 12 px × the flat map's 2× space
  expect(framed.labelScale).not.toBeNull();
  expect(framed.fontSize! * framed.labelScale! * framed.view.scale).toBeCloseTo(12, 1);

  // ── Clearing the route returns to the whole world ────────────────────────
  await page.evaluate(() => (window as unknown as Hooks).__rd.clearRoute());
  await page.waitForFunction(
    () => {
      const rd = (window as unknown as Hooks).__rd;
      const view = rd.getFlatMap()?.getViewState();
      return Boolean(
        view &&
        Math.abs(view.scale - 0.784) < 0.01 &&
        document.querySelectorAll('[data-rd-layer="routes"] path[stroke]').length === 0,
      );
    },
    undefined,
    { timeout: 5000 },
  );
  const cleared = await page.evaluate(() =>
    (window as unknown as Hooks).__rd.getFlatMap()!.getViewState(),
  );
  expect(cleared.cx).toBeCloseTo(MAP.width / 2, 6);
  expect(cleared.cy).toBeCloseTo(MAP.height / 2, 6);

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('frameRoute: false draws the route on the world view, without a zoom', async ({ page }) => {
  await page.goto(new URL('./fixtures/zoom.html?frameRoute=0', import.meta.url).href);
  const state = await page.evaluate(() => (window as unknown as Hooks).__state);
  expect(state.error, `fixture error: ${state.error}`).toBeNull();

  const before = await page.evaluate(() =>
    (window as unknown as Hooks).__rd.getFlatMap()!.getViewState(),
  );
  const result = await page.evaluate(() => {
    const rd = (window as unknown as Hooks).__rd;
    const ok = rd.setRoute('LHR', 'DXB', { roundTrip: true });
    return {
      ok,
      drawn: (window as unknown as Hooks).__state.drawn,
      paths: document.querySelectorAll('[data-rd-layer="routes"] path[stroke]').length,
      view: rd.getFlatMap()!.getViewState(),
    };
  });
  expect(result.ok).toBe(true);
  // Synchronous: no zoom, so the route is there by the time setRoute returns.
  expect(result.drawn).toBe(1);
  expect(result.paths).toBe(1);
  expect(result.view.scale).toBeCloseTo(before.scale, 6);
  expect(result.view.cx).toBeCloseTo(before.cx, 6);
  expect(result.view.cy).toBeCloseTo(before.cy, 6);
});

test('changing the airports zooms out to the world, then into the new route', async ({ page }) => {
  await page.goto(new URL('./fixtures/zoom.html', import.meta.url).href);
  const state = await page.evaluate(() => (window as unknown as Hooks).__state);
  expect(state.error, `fixture error: ${state.error}`).toBeNull();

  // The resting, world-wide framing — where the camera must return to.
  const world = await page.evaluate(() => {
    const map = document.getElementById('map')!;
    const view = (window as unknown as Hooks).__rd.getFlatMap()!.getViewState();
    return {
      scale: view.scale,
      cx: view.cx,
      cy: view.cy,
      width: map.clientWidth,
      height: map.clientHeight,
    };
  });

  // First flight: world view → LHR/DXB.
  await page.evaluate(() => {
    (window as unknown as Hooks).__rd.setRoute('LHR', 'DXB', { roundTrip: true });
  });
  await page.waitForFunction(() => (window as unknown as Hooks).__state.drawn === 1, undefined, {
    timeout: 5000,
  });

  // Second flight: the camera has to pull back out to the world before it
  // dives into Singapore — sample the framing while it travels.
  const samples = await page.evaluate(async () => {
    const hooks = window as unknown as Hooks & {
      __samples: number[];
      __drawn: number[];
      __views: View[];
    };
    hooks.__samples = [];
    hooks.__drawn = [];
    hooks.__views = [];
    const tick = () => {
      const rd = hooks.__rd;
      const view = rd.getFlatMap()!.getViewState();
      hooks.__samples.push(view.scale);
      hooks.__views.push(view);
      hooks.__drawn.push(hooks.__state.drawn);
      if (hooks.__state.drawn < 2) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    hooks.__rd.setRoute('LHR', 'SIN', { roundTrip: true });
    await new Promise<void>((resolve) => {
      const wait = () => (hooks.__state.drawn < 2 ? requestAnimationFrame(wait) : resolve());
      wait();
    });
    return {
      scales: hooks.__samples,
      views: hooks.__views,
      drawn: hooks.__drawn,
      view: hooks.__rd.getFlatMap()!.getViewState(),
      labels: Array.from(document.querySelectorAll('[data-rd-layer="routes"] text')).map(
        (el) => el.textContent,
      ),
    };
  });

  expect(samples.scales.length).toBeGreaterThan(3);
  const minScale = Math.min(...samples.scales);
  // Pulled all the way back to the world view…
  expect(minScale).toBeLessThan(world.scale * 1.05);
  // …and not further out than the world view (no drift into empty sea).
  expect(minScale).toBeGreaterThan(world.scale * 0.85);
  expect(Math.max(...samples.scales)).toBeGreaterThan(world.scale * 1.5);

  // The pull-back really is the *world*: at its widest the camera sits on the
  // world framing, both in scale and in centre.
  const widest = samples.views[samples.scales.indexOf(minScale)]!;
  expect(widest.cx).toBeCloseTo(world.cx, 0);
  expect(widest.cy).toBeCloseTo(world.cy, 0);

  // Smooth, not a bounce: the camera never jumps between frames…
  let worstStep = 0;
  for (let i = 1; i < samples.views.length; i++) {
    const prev = samples.views[i - 1]!;
    const next = samples.views[i]!;
    worstStep = Math.max(worstStep, Math.abs(Math.log(next.scale / prev.scale)));
  }
  expect(worstStep).toBeLessThan(0.6);
  // …and it never sits still at the wide shot: the turnaround is a smooth
  // slowdown, not a pause between two halves.
  let dwell = 0;
  for (let i = 1; i < samples.views.length; i++) {
    const prev = samples.views[i - 1]!;
    const next = samples.views[i]!;
    const moved =
      Math.abs(Math.log(next.scale / prev.scale)) > 1e-3 ||
      Math.hypot(next.cx - prev.cx, next.cy - prev.cy) > 0.5;
    if (!moved) dwell += 1;
  }
  expect(dwell).toBeLessThanOrEqual(2);
  // …with the old route still on screen for the ride out, and the new one
  // only after the dive has landed.
  expect(samples.drawn[0]).toBe(1);
  expect(samples.labels).toEqual(['London', 'Singapore']);
  expect(samples.view.scale).toBeGreaterThan(world.scale);
});

test('a route set while already at the world view dives in once, without a pull-back', async ({
  page,
}) => {
  await page.goto(new URL('./fixtures/zoom.html', import.meta.url).href);
  const result = await page.evaluate(async () => {
    const hooks = window as unknown as Hooks & { __samples: number[] };
    hooks.__samples = [];
    const rd = hooks.__rd;
    const tick = () => {
      hooks.__samples.push(rd.getFlatMap()!.getViewState().scale);
      if (hooks.__state.drawn < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const before = rd.getFlatMap()!.getViewState().scale;
    rd.setRoute('LHR', 'DXB', { roundTrip: true });
    while (hooks.__state.drawn < 1) await new Promise((r) => setTimeout(r, 20));
    return { before, scales: hooks.__samples };
  });
  // The camera never dips below where it started: a single zoom-in.
  expect(Math.min(...result.scales)).toBeGreaterThanOrEqual(result.before - 1e-6);
});

test('two nearby cities zoom in much further than a long haul', async ({ page }) => {
  await page.goto(new URL('./fixtures/zoom.html', import.meta.url).href);
  const state = await page.evaluate(() => (window as unknown as Hooks).__state);
  expect(state.error, `fixture error: ${state.error}`).toBeNull();

  const longHaul = await page.evaluate(async () => {
    const hooks = window as unknown as Hooks;
    hooks.__rd.setRoute('LHR', 'SIN', { roundTrip: true });
    while (hooks.__state.drawn < 1) await new Promise((r) => setTimeout(r, 20));
    const map = document.getElementById('map')!;
    return {
      view: hooks.__rd.getFlatMap()!.getViewState(),
      viewport: { w: map.clientWidth, h: map.clientHeight },
    };
  });

  // London → Paris: a 350 km hop. The framing has to come right down on the
  // two cities instead of leaving them as two specks in a continent.
  const shortHop = await page.evaluate(async () => {
    const hooks = window as unknown as Hooks;
    hooks.__rd.setRoute('LHR', 'CDG', { roundTrip: true });
    while (hooks.__state.drawn < 2) await new Promise((r) => setTimeout(r, 20));
    const map = document.getElementById('map')!;
    return {
      view: hooks.__rd.getFlatMap()!.getViewState(),
      viewport: { w: map.clientWidth, h: map.clientHeight },
      labels: Array.from(document.querySelectorAll('[data-rd-layer="routes"] text')).map(
        (el) => el.textContent,
      ),
    };
  });

  expect(shortHop.labels).toEqual(['London', 'Paris']);
  expect(longHaul.view.scale).toBeGreaterThan(1.5);
  // Tighter than the long haul…
  expect(shortHop.view.scale).toBeGreaterThan(longHaul.view.scale);
  // …and pinned to the configured ceiling: 4× the world view by default.
  const worldScale = await page.evaluate(() => {
    const map = document.getElementById('map')!;
    // The world view is the largest scale that still contains the whole map.
    return Math.min(map.clientWidth / MAP.width, map.clientHeight / MAP.height) * 0.98;
  });
  expect(shortHop.view.scale).toBeLessThanOrEqual(worldScale * 4 + 1e-6);
  expect(shortHop.view.scale).toBeGreaterThan(worldScale * 3.9);
  // Both airports still sit inside the frame with room for dot and name.
  const cdg = { x: ((2.352 + 180) / 360) * MAP.width, y: ((90 - 48.857) / 180) * MAP.height };
  for (const airport of [lhr, cdg]) {
    const point = toScreen(airport, shortHop.view, shortHop.viewport);
    expect(point.x).toBeGreaterThan(40);
    expect(point.x).toBeLessThan(shortHop.viewport.w - 40);
    expect(point.y).toBeGreaterThan(40);
    expect(point.y).toBeLessThan(shortHop.viewport.h - 40);
  }
  // At this zoom the map is still readable: not less than ~90 map px visible.
  expect(shortHop.viewport.h / shortHop.view.scale).toBeGreaterThanOrEqual(88);
});
