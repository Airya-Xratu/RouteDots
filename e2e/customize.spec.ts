import { expect, test } from '@playwright/test';

type RouteDotsApi = {
  mode: string | null;
  getRoute: () => { from: { code: string }; to: { code: string }; roundTrip: boolean } | null;
  getOptions: () => Record<string, unknown>;
  getRouteStyle: () => {
    outbound: { color: string; angle: number; dash: { color: string } | null; width: number };
    return: { color: string; angle: number; lift: number; dash: { color: string } | null };
  } | null;
  getCityStyle: () => { ripple: { periodMs: number; grow: number; size: number } } | null;
  getCamera3D: () => {
    enabled: boolean;
    tilt: number;
    yaw: number;
    depth: number;
    perspective: number;
  } | null;
  getFlatMap: () => { getViewState: () => { scale: number; cx: number; cy: number } } | null;
  getCityMarkers: () => { count: number; resolvedStyle: { ripple: { periodMs: number } } } | null;
  setColors: (colors: Record<string, string>) => void;
  setOptions: (options: Record<string, unknown>) => void;
  setWorld: (world: 'auto' | 'globe' | 'flat') => void;
};

type Hooks = {
  __state: { ready: boolean; error: string | null };
  __rd: { flat: RouteDotsApi; globe: RouteDotsApi } | null;
};

const rounded = (value: number, digits = 2): number => Number(value.toFixed(digits));

test('flat world: colours, dashes, curve angles, ripple, plane icon and 3D camera', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(new URL('./fixtures/customize.html', import.meta.url).href);
  const state = await page.evaluate(() => (window as unknown as Hooks).__state);
  expect(state.error, `fixture error: ${state.error}`).toBeNull();

  // ── Colours: the palette reaches every layer ──────────────────────────────
  const palette = await page.evaluate(() => {
    const routes = document.querySelectorAll('[data-rd-layer="routes"] path[stroke]');
    const border = document.querySelector('svg polyline');
    const dot = document.querySelector('circle.rd-city-dot');
    return {
      routes: Array.from(routes).map((p) => p.getAttribute('stroke')),
      border: border?.getAttribute('stroke'),
      cities: dot?.getAttribute('fill'),
      background: getComputedStyle(document.getElementById('flat')!).backgroundColor,
    };
  });
  expect(palette.routes).toEqual(['#ff0066', '#00ccff']);
  expect(palette.border).toBe('#334455');
  expect(palette.cities).toBe('#22cc88');
  expect(palette.background).toBe('rgb(11, 18, 32)');

  // ── Country fills are painted in the requested colour ────────────────────
  const paris = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return null;
    const x = Math.round(((2 + 180) / 360) * canvas.width);
    const y = Math.round(((90 - 47) / 180) * canvas.height);
    return Array.from(ctx.getImageData(x, y, 1, 1).data);
  });
  expect(paris).not.toBeNull();
  expect(paris!.slice(0, 3)).toEqual([27, 42, 58]); // #1b2a3a

  // ── Dashes: the configured length / gap / speed / width, in px ───────────
  const dashes = await page.evaluate(() => {
    const outbound = document.querySelector('[data-rd-layer="routes"] path[stroke="#ff0066"]');
    const back = document.querySelector('[data-rd-layer="routes"] path[stroke="#00ccff"]');
    const read = (el: Element | null) => {
      const path = el as SVGPathElement;
      const [dash = 0, gap = 0] = (path.getAttribute('stroke-dasharray') ?? '')
        .split(' ')
        .map(Number);
      return {
        dash,
        gap,
        length: path.getTotalLength(),
        width: path.getAttribute('stroke-width'),
        flow: getComputedStyle(path).animationName,
        period: path.style.getPropertyValue('--rd-dash-period'),
        duration: path.style.getPropertyValue('--rd-dash-duration'),
      };
    };
    return { outbound: read(outbound), back: read(back) };
  });
  // 4 % / 2 % of the route length, drawn at 2.5 px.
  expect(dashes.outbound.dash / dashes.outbound.length).toBeCloseTo(0.04, 3);
  expect(dashes.outbound.gap / dashes.outbound.length).toBeCloseTo(0.02, 3);
  expect(dashes.outbound.width).toBe('2.5');
  expect(dashes.back.dash / dashes.back.length).toBeCloseTo(0.02, 3);
  expect(dashes.back.gap / dashes.back.length).toBeCloseTo(0.01, 3);
  // The dashes flow, and the flow speed is the configured 2 dashes / second
  // (one dash period per 500 ms).
  expect(dashes.outbound.flow).toBe('rd-dash-flow');
  expect(dashes.outbound.period.endsWith('px')).toBe(true);
  expect(dashes.outbound.duration).toBe('500ms');
  expect(dashes.back.duration).toBe('1000ms');

  // ── Curve angles: both legs are banked, and by the requested angles ──────
  const angles = await page.evaluate(() => {
    // The IIFE bundle exposes the whole module namespace as `RouteDots`.
    const { flatArcGeometry, RouteDots } = (
      window as unknown as {
        RouteDots: {
          flatArcGeometry: (input: {
            from: { lat: number; lng: number };
            to: { lat: number; lng: number };
            project: (point: { lat: number; lng: number }) => [number, number];
            angle?: number;
          }) => { control: [number, number] };
          RouteDots: unknown;
        };
      }
    ).RouteDots;
    const flat = (window as unknown as Hooks).__rd!.flat;
    const style = flat.getRouteStyle()!;
    const project = (p: { lat: number; lng: number }) =>
      [((p.lng + 180) / 360) * 1600, ((90 - p.lat) / 180) * 800] as [number, number];
    const LHR = { lat: 51.507, lng: -0.128 };
    const DXB = { lat: 25.204, lng: 55.271 };
    const banked = flatArcGeometry({
      from: LHR,
      to: DXB,
      project,
      angle: style.outbound.angle,
    });
    const straight = flatArcGeometry({ from: LHR, to: DXB, project, angle: 0 });
    return {
      outboundAngle: style.outbound.angle,
      returnAngle: style.return.angle,
      bankedControl: banked.control,
      straightControl: straight.control,
      hasClass: typeof RouteDots === 'function',
    };
  });
  expect(angles.outboundAngle).toBe(25);
  expect(angles.returnAngle).toBe(-35);
  // The drawn arc leans exactly like the geometry module says it should.
  expect(angles.bankedControl[0]).not.toBeCloseTo(angles.straightControl[0], 3);
  expect(angles.hasClass).toBe(true);
  const drawn = await page.evaluate(
    () =>
      document
        .querySelector('[data-rd-layer="routes"] path[stroke="#ff0066"]')
        ?.getAttribute('d') ?? '',
  );
  expect(drawn).toContain(
    `Q ${rounded(angles.bankedControl[0])} ${rounded(angles.bankedControl[1])}`,
  );

  // ── City ripple: period, dot size, ring size / thickness, colours ────────
  const ripple = await page.evaluate(() => {
    const ring = document.querySelector('circle.rd-city-ring')!;
    const dot = document.querySelector('circle.rd-city-dot')!;
    return {
      period: getComputedStyle(ring).getPropertyValue('--rd-city-period').trim(),
      grow: getComputedStyle(ring).getPropertyValue('--rd-city-ring-grow').trim(),
      opacity: getComputedStyle(ring).getPropertyValue('--rd-city-ring-opacity').trim(),
      dim: getComputedStyle(dot).getPropertyValue('--rd-city-dot-dim').trim(),
      ringRadius: Number(ring.getAttribute('r')),
      ringWidth: Number(ring.getAttribute('stroke-width')),
      ringStroke: ring.getAttribute('stroke'),
      dotRadius: Number(dot.getAttribute('r')),
    };
  });
  expect(ripple.period).toBe('1200ms');
  expect(Number(ripple.grow)).toBeCloseTo(5, 2); // 1 + grow
  expect(Number(ripple.opacity)).toBeCloseTo(0.8, 3);
  expect(Number(ripple.dim)).toBeCloseTo(0.2, 3);
  // 0.02 globe radii → 4 px · (0.02 / 0.011); 0.004 → 1.2 px · (0.004 / 0.0025).
  expect(ripple.ringRadius).toBeCloseTo(rounded(4 * (0.02 / 0.011)), 2);
  expect(ripple.ringWidth).toBeCloseTo(rounded(1.2 * (0.004 / 0.0025)), 2);
  expect(ripple.ringStroke).toBe('#22cc88');
  expect(ripple.dotRadius).toBeCloseTo(rounded(2.6 * (0.008 / 0.006)), 2);

  // ── The plane flies the custom icon ──────────────────────────────────────
  const plane = await page.evaluate(() => {
    const group = document.querySelector('[data-rd-plane]')!;
    const path = group.querySelector('path')!;
    return {
      name: group.getAttribute('data-rd-plane'),
      fill: path.getAttribute('fill'),
      scale: path.getAttribute('transform'),
      d: path.getAttribute('d') ?? '',
    };
  });
  expect(plane.name).toBe('jet');
  expect(plane.fill).toBe('#ff0066');
  expect(plane.scale).toBe('scale(0.4)'); // 40 px icon in a 100 unit box
  expect(plane.d.length).toBeGreaterThan(20);

  // ── 3D camera effect: perspective + tilt + floating route layer ──────────
  const camera = await page.evaluate(() => {
    const routes = document.querySelector('[data-rd-layer="routes"]') as HTMLElement;
    const borders = document.querySelector('[data-rd-layer="borders"]') as HTMLElement;
    const world = borders.parentElement!.parentElement as HTMLElement;
    return {
      perspective: getComputedStyle(document.getElementById('flat')!).perspective,
      world: world.style.transform,
      routes: routes.style.transform,
      borders: borders.style.transform,
    };
  });
  expect(camera.perspective).toBe('900px');
  expect(camera.world).toBe('rotateX(40.00deg) rotateZ(-12.00deg)');
  expect(camera.routes).toBe('translateZ(90.00px)');
  expect(camera.borders).toBe('translateZ(27.00px)');

  // Dragging orbits the camera (tilt / yaw).
  const before = await page.evaluate(() => (window as unknown as Hooks).__rd!.flat.getCamera3D()!);
  await page.mouse.move(320, 400);
  await page.mouse.down();
  await page.mouse.move(400, 440, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => (window as unknown as Hooks).__rd!.flat.getCamera3D()!);
  expect(after.yaw).toBeGreaterThan(before.yaw);
  expect(after.tilt).toBeGreaterThan(before.tilt);

  // Scrolling zooms, and the camera eases to follow the plane once it leaves
  // the (now much smaller) safe area.
  const zoomBefore = await page.evaluate(() =>
    (window as unknown as Hooks).__rd!.flat.getFlatMap()!.getViewState(),
  );
  await page.mouse.move(320, 400);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -120);
  const zoomed = await page.evaluate(() =>
    (window as unknown as Hooks).__rd!.flat.getFlatMap()!.getViewState(),
  );
  expect(zoomed.scale).toBeGreaterThan(zoomBefore.scale);
  await page.waitForTimeout(600);
  const chased = await page.evaluate(() =>
    (window as unknown as Hooks).__rd!.flat.getFlatMap()!.getViewState(),
  );
  expect(Math.hypot(chased.cx - zoomed.cx, chased.cy - zoomed.cy)).toBeGreaterThan(1);

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('3D globe: resolved styles report the customisation, and live updates apply', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(new URL('./fixtures/customize.html', import.meta.url).href);
  await page.waitForFunction(
    () => (window as unknown as Hooks).__rd?.globe.mode === 'webgl',
    undefined,
    { timeout: 30_000 },
  );

  // ── Resolved styles are readable — including the curve angles and dashes ─
  const resolved = await page.evaluate(() => {
    const globe = (window as unknown as Hooks).__rd!.globe;
    const style = globe.getRouteStyle()!;
    return {
      outbound: style.outbound,
      back: style.return,
      cities: globe.getCityStyle(),
      markers: globe.getCityMarkers(),
      options: globe.getOptions(),
    };
  });
  expect(resolved.outbound.angle).toBe(30);
  expect(resolved.back.angle).toBe(-30);
  expect(resolved.back.lift).toBe(0.45);
  expect(resolved.outbound.color).toBe('#0ea5e9');
  expect(resolved.outbound.dash?.color).toBe('#0ea5e9');
  expect(resolved.cities?.ripple.periodMs).toBe(900);
  expect(resolved.cities?.ripple.grow).toBe(5);
  expect(resolved.markers?.count).toBe(31);
  expect(resolved.markers?.resolvedStyle.ripple.periodMs).toBe(900);
  expect((resolved.options.route as { outbound: { angle: number } }).outbound.angle).toBe(30);

  // ── setColors / setOptions restyle the live scene ────────────────────────
  const live = await page.evaluate(() => {
    const globe = (window as unknown as Hooks).__rd!.globe;
    globe.setColors({ outbound: '#ffffff', cities: '#ffcc00' });
    globe.setOptions({
      route: { outbound: { angle: 0 }, return: { angle: 0, lift: 0.2 } },
      cities: { ripple: { periodMs: 3000, opacity: 0.9, size: 0.02 } },
      plane: { icon: 'arrow', size: 0.05 },
    });
    const style = globe.getRouteStyle()!;
    return {
      outbound: style.outbound,
      back: style.return,
      cities: globe.getCityStyle()!,
      route: globe.getRoute(),
      mode: globe.mode,
    };
  });
  expect(live.outbound.color).toBe('#ffffff');
  expect(live.outbound.angle).toBe(0);
  expect(live.back.lift).toBe(0.2);
  expect(live.cities.ripple.periodMs).toBe(3000);
  expect(live.cities.ripple.size).toBe(0.02);
  expect(live.route?.from.code).toBe('LHR');
  expect(live.mode).toBe('webgl');

  // ── Switching worlds keeps the route and mounts the flat world ───────────
  const switched = await page.evaluate(() => {
    const globe = (window as unknown as Hooks).__rd!.globe;
    globe.setWorld('flat');
    return {
      mode: globe.mode,
      hasFlat: globe.getFlatMap() !== null,
      camera3d: globe.getCamera3D(),
      route: globe.getRoute(),
      layers: document.querySelectorAll('#globe [data-rd-layer]').length,
    };
  });
  expect(switched.mode).toBe('flat');
  expect(switched.hasFlat).toBe(true);
  expect(switched.route?.to.code).toBe('DXB');
  expect(switched.layers).toBe(4);
  // The 3D camera effect stays off until it is asked for.
  expect(switched.camera3d?.enabled).toBe(false);

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});
