# RouteDots — Developer Guide

Everything you need to integrate and extend RouteDots.

## Installation

```bash
npm install routedots three
```

`three` (≥ 0.150) is a peer dependency. For usage without a bundler, use the
IIFE build (three.js included) — see [No-bundler usage](#no-bundler-usage).

## Quick start

```ts
import { RouteDots } from 'routedots';

const rd = new RouteDots(document.getElementById('hero-globe')!, {
  theme: 'light',
  autoRotate: { enabled: true, speed: 0.4 },
});

rd.setRoute('LHR', 'DXB', { roundTrip: true });
```

`setRoute` accepts **IATA codes** (from `RouteDots.CITIES`, case-insensitive),
full `City` objects, or bare `{ lat, lng }` points. It returns `false` (and
emits `route:invalid`) when a city can't be resolved or both endpoints are the
same point.

### No-bundler usage

```html
<script src="routedots.browser.global.js"></script>
<!-- three.js included -->
<script>
  const rd = new RouteDots.RouteDots(document.getElementById('hero-globe'));
  rd.setRoute('THR', 'DXB', { roundTrip: true });
</script>
```

Or import the ESM build from a CDN:

```html
<script type="module">
  import { RouteDots } from 'https://cdn.jsdelivr.net/npm/routedots@0.1.0/dist/routedots.js';
  // RouteDots.CITIES, RouteDots.VERSION, …
</script>
```

## API reference

### `new RouteDots(container: HTMLElement, options?: RouteDotsOptions)`

| Option        | Type                                         | Default                | Description                                                                           |
| ------------- | -------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `theme`       | `'light' \| 'dark'`                          | `'light'`              | Base palette (ocean, countries, dots, arcs, cities, atmosphere).                      |
| `colors`      | `RouteDotsColors`                            | —                      | Override any palette colour (see below); merges with the theme.                       |
| `world`       | `'auto' \| 'globe' \| 'flat'`                | `'auto'`               | Renderer: `auto` = WebGL globe, flat map when WebGL is unavailable.                   |
| `surface`     | `'countries' \| 'dots'`                      | `'countries'`          | Map surface: grey country fills with white borders, or the dot lattice.               |
| `view`        | `{ lat, lng, altitude }`                     | `{ 30, 45, 1.9 }`      | Initial camera view (altitude = globe radii, 1.05–4).                                 |
| `autoRotate`  | `{ enabled?, speed? }`                       | on, 0.4°/s             | Gentle idle rotation.                                                                 |
| `interactive` | `boolean`                                    | `false`                | Allow pointer drag + wheel zoom (globe).                                              |
| `texture`     | `{ stepDeg?, resDeg?, dotSizeDeg?, width? }` | 2 / auto / 0.62 / 2048 | Dot lattice & texture options.                                                        |
| `borders`     | `{ enabled?, color?, opacity?, width? }`     | on, white, 1 / 1 px    | Country border lines. `opacity` = globe, `width` = flat-map stroke (px).              |
| `route`       | `RouteStyleOptions`                          | see below              | Per-leg colour, opacity, lift, **curve angle**, width and **dash pattern**.           |
| `cities`      | `CityMarkersOptions`                         | see below              | City markers: colour, period, dot size/dim, **ripple** size/thickness/growth/opacity. |
| `plane`       | `PlaneLayerOptions & { enabled? }`           | on                     | Animated plane — **icon component**, size, colour, timing (see below).                |
| `camera3d`    | `FlatCamera3DOptions`                        | off                    | The flat world's **3D camera effect** (perspective, tilt, yaw, depth, orbit).         |
| `frameRoute`  | `boolean`                                    | `true`                 | Pan/zoom the camera to frame each new route.                                          |
| `fallback`    | `{ enabled? }`                               | `true`                 | Use the flat map when WebGL is unavailable.                                           |
| `flat`        | `FlatRouteMapOptions`                        | —                      | Options for the flat world (surface, plane, camera3d, width…).                        |
| `land`        | `TopoLand`                                   | bundled 110m mask      | Replace the land mask.                                                                |

#### Colour palette

`colors` takes any subset of `RouteDotsPalette`
(`src/theme.ts`) — `ocean`, `countries`, `dots`, `borders`, `cities`,
`atmosphere`, `outbound`, `return`, `marker`, `ring`, `plane`, `label`,
`labelBackground` — and the whole scene follows: globe _and_ flat world, arcs,
plane sprite, city ripple and endpoint pins. The legacy single-world aliases
`globe` / `background` (→ `ocean`) and `land` (→ `countries`) still work.

```ts
new RouteDots(el, {
  theme: 'dark',
  colors: {
    ocean: '#06121f',
    countries: '#12212f',
    outbound: '#38bdf8',
    return: '#a78bfa',
    plane: '#f8fafc',
    cities: '#22d3ee',
  },
});
```

#### Route style (`route`)

| Key                                    | Default                                 | Description                                                            |
| -------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| `color`, `opacity`                     | theme                                   | Shared defaults for both legs.                                         |
| `lift`                                 | outbound 0.10 / return 0.20             | Bulge above the sphere (globe).                                        |
| `angle`                                | `0`                                     | **Curve angle**, in degrees, ±85 — banks the arc off its great circle. |
| `width`, `strokeWidth`                 | 0.0015 / 1.8 px, 1.4 px                 | Tube radius (globe) / stroke width (flat).                             |
| `dash`                                 | 14 dashes · 55 % duty (out) — see below | `{ color?, length?, gap?, speed?, width?, enabled? }`.                 |
| `outbound`, `return`                   | —                                       | Per-path overrides of any key above (plus their own `dash`).           |
| `drawDurationMs`, `staggerMs`, `pulse` | 1100 / 350 / true                       | Draw-on timing and endpoint pulses.                                    |

`dash.length` and `dash.gap` are **fractions of the whole route** (outbound
defaults: `1/14 · 0.55` and `1/14 · 0.45`; return: `1/18 · 0.45` and
`1/18 · 0.55`), so a pattern looks the same on the globe and on the flat map;
`speed` is dashes per second (`0` freezes them) and `dash: false` (or
`enabled: false`) draws a solid line. Legacy top-level `outboundLift`,
`returnLift` and `arcRadius` keys still work.

```ts
new RouteDots(el, {
  route: {
    outbound: { angle: 32, dash: { length: 0.04, gap: 0.02, speed: 2, width: 2.4 } },
    return: { angle: -32, lift: 0.28, dash: { length: 0.02, gap: 0.01, speed: 1 } },
  },
});
```

#### City markers (`cities`)

| Key        | Default                                               | Description                                                                             |
| ---------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `enabled`  | `true`                                                | Draw the markers at all.                                                                |
| `color`    | theme `cities`                                        | Shared colour for dot + ripple.                                                         |
| `periodMs` | 2600                                                  | Blink / ripple cycle.                                                                   |
| `radius`   | shell radius                                          | Marker shell radius (globe radii).                                                      |
| `dot`      | `size .006`, `dim .45`                                | `{ enabled?, size?, color?, dim? }` — the solid, breathing dot.                         |
| `ripple`   | `size .011`, `width .0025`, `grow 2.6`, `opacity .55` | `{ enabled?, color?, size?, width?, grow?, opacity?, periodMs? }` — the expanding ring. |
| `list`     | `RouteDots.CITIES`                                    | Replace the marked cities.                                                              |

`grow` is how far the ring expands over one cycle (as a multiple of its own
radius) and `size`/`width` are outer radius / thickness in globe radii; the
flat world scales the same numbers into px.

#### Plane (`plane`)

`{ icon?, size?, color?, clearance?, flightMs?, pauseMs?, startDelayMs?, enabled? }`.
`icon` is a **component**: a preset `'airliner' | 'jet' | 'arrow' | 'dot'`,
raw SVG path data `{ path, viewBox }`, a raster image `{ image, size? }`, an
existing `PlaneIcon`, or `{ draw: (ctx, size) => void }` for a fully custom
canvas painting. `size` is globe units in the 3D world (default 0.024) and px
in the flat world (default 30). `PLANE_ICON_PRESETS` lists the built-ins and
`PlaneIcon.from()` normalises anything else.

```ts
import { RouteDots, PlaneIcon } from 'routedots';

new RouteDots(el, {
  plane: { icon: { path: 'M0,-40 L18,26 L-18,26 Z', viewBox: 80 }, size: 0.03 },
});

const icon = PlaneIcon.from({ image: planePng, size: 64 });
icon.toDataUrl(64); // or .toSVG() / .toCanvas(64)
```

#### Flat 3D camera (`camera3d`)

`{ enabled?, perspective?, tilt?, yaw?, depth?, interactive?, follow? }` —
default off, so the flat world stays flat. When enabled the map becomes a CSS
3D scene: `perspective` (300–6000 px), `tilt` / `yaw` (±78° / ±70°) rotate the
world, `depth` (0–400 px) floats the route + plane layer above the map with
the border and city layers at 30 % / 55 % of it (real parallax), and with
`interactive: true` dragging orbits and the wheel zooms. `follow` (default
true) eases the framing so the plane cannot leave the viewport.

### Methods

| Method                                        | Description                                                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `setRoute(from, to, { roundTrip? }): boolean` | Draws the route (arc(s) + markers + pulse + plane), pans the camera to frame it.                                                             |
| `getRoute(): RouteDotsRouteInfo \| null`      | Resolved `{ from, to, roundTrip }` of the current route.                                                                                     |
| `clearRoute()`                                | Removes arcs/markers/pulses/plane.                                                                                                           |
| `getCameraState(): ViewState \| null`         | Current camera `{ lat, lng, altitude }` (WebGL mode; `null` in flat mode).                                                                   |
| `setView(view, durationMs?)`                  | Animates the camera to a view (WebGL mode; no-op in flat mode). Overrides tracking while it runs.                                            |
| `setColors(colors)`                           | Merges colour overrides and restyles the live scene.                                                                                         |
| `resetColors()`                               | Drops every colour override (back to the theme).                                                                                             |
| `setOptions(options)`                         | Merges and applies options live (route style, dashes, angles, cities, plane, camera3d…); remounts only when the world/surface/theme changes. |
| `setWorld('auto' \| 'globe' \| 'flat')`       | Switches renderer, keeping the route.                                                                                                        |
| `setTheme('light' \| 'dark')`                 | Switches theme at runtime (re-renders the current route).                                                                                    |
| `getOptions()`                                | Deep copy of the merged options in use.                                                                                                      |
| `getRouteStyle()`                             | Resolved styles (colour, lift, **angle**, width, dash) per leg; `null` before mount.                                                         |
| `getCityStyle()`                              | Resolved city dot + ripple numbers; `null` before mount.                                                                                     |
| `getCamera3D()`                               | Resolved flat-world 3D camera (flat mode only).                                                                                              |
| `getFlatMap()`                                | The `FlatRouteMap` instance (flat mode only).                                                                                                |
| `getCityMarkers()`                            | The WebGL city-marker layer (globe mode only).                                                                                               |
| `resize()`                                    | Re-fits the renderer to the container (also handled automatically via `ResizeObserver`).                                                     |
| `dispose()`                                   | Tears everything down (RAF, listeners, GPU resources, DOM).                                                                                  |

### Events

Subscribe with `rd.on(event, handler)` (returns an unsubscribe fn);
`rd.off(event, handler)` to remove.

| Event           | Payload                       | When                                                                                           |
| --------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `ready`         | `{ mode: 'webgl' \| 'flat' }` | Renderer mounted.                                                                              |
| `route:updated` | `RouteDotsRouteInfo`          | A new route was set.                                                                           |
| `route:drawn`   | `RouteDotsRouteInfo`          | The draw-on animation finished (webgl mode).                                                   |
| `route:invalid` | `{ from, to }`                | A setRoute call was rejected.                                                                  |
| `route:cleared` | —                             | `clearRoute()` was called.                                                                     |
| `mode:changed`  | `{ from, to }`                | The renderer changed: WebGL failed (`fallback`), or `setWorld()` / `world` picked another one. |

### Statics

- `RouteDots.CITIES: readonly City[]` — the default city dataset (31 cities).
- `RouteDots.VERSION: string`
- Palette: `PALETTES.light` / `PALETTES.dark` (`RouteDotsPalette`) and
  `resolvePalette(theme, colors)`.
- Theme tables: `GLOBE_THEMES`, `ROUTE_THEMES`, `FLAT_THEMES` — all derived
  from the palette; prefer `colors` over editing them.
- `PlaneIcon`, `PLANE_ICON_PRESETS`, `PlaneIcon.from(source)` — the plane icon
  component.
- Style helpers: `resolveRouteStyle`, `resolveCityMarkers`, `arcPoint`,
  `normalizeArcAngleDeg`, `MAX_ARC_ANGLE_DEG`, `dashUniforms`, `dashArrayPx`,
  `flatArcGeometry`, `resolveFlatCamera3D`, `flatCamera3DTransforms`.

## React

```tsx
import { useEffect, useRef } from 'react';
import { RouteDots } from 'routedots';

export function HeroGlobe({
  from,
  to,
  roundTrip,
}: {
  from: string;
  to: string;
  roundTrip: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rdRef = useRef<RouteDots | null>(null);

  useEffect(() => {
    const rd = new RouteDots(ref.current!, { theme: 'light' });
    rdRef.current = rd;
    return () => rd.dispose();
  }, []);

  useEffect(() => {
    rdRef.current?.setRoute(from, to, { roundTrip });
  }, [from, to, roundTrip]);

  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}
```

Vue/Svelte/plain JS: same pattern — construct on mount, `setRoute` on form
changes, `dispose()` on unmount.

## Behaviour notes

- **Outbound/return separation.** Round trips render two arcs with different
  lifts (`outboundLift` 0.10 vs `returnLift` 0.20 of the globe radius). Both
  follow the `1 + lift·sin(πt)` great-circle profile, so they share endpoints
  but never overlap. Each leg can additionally be **banked** by its own curve
  angle (`-85°…85°`), which rotates the whole arc about its chord — endpoints
  stay exactly on the surface, and the plane flies the banked curve.
- **Frame routing.** On `setRoute`, the camera tweens (1.4 s, ease-out) to the
  great-circle _midpoint_ of the route; altitude grows with route length so
  long-haul routes are framed from higher up.
- **Plane.** Flies the _outbound_ arc only: `flightMs` (default 4800 ms in the
  showcase, 4500 in the library), then `pauseMs`, then repeats.
- **Antipodes.** Endpoints within 0.01° are rejected; true antipodal pairs
  have no unique great circle and throw from the geometry layer.
- **Flat world.** Without WebGL (or with `world: 'flat'`) `FlatRouteMap`
  renders an equirectangular map with curved SVG routes (outbound up, return
  down), a plane flying the outbound path and the same city ripple as CSS
  keyframes — the public API is unchanged. With `camera3d.enabled` the same map
  becomes a 3D scene (perspective + tilt/yaw + depth layers), so "flat world"
  and "3D camera" are independent choices.
- **Endpoint pins.** In WebGL mode each endpoint gets a DOM pin badge
  (pill + stem + dot, `.rd-pin-*` classes) that is re-projected every frame
  and fades out when it rotates to the far hemisphere. In flat mode the city
  name renders as a haloed SVG label next to the marker. Badge colours follow
  the active theme.

## Customisation recipes

**Colours:**

```ts
const rd = new RouteDots(el, {
  theme: 'light',
  colors: { outbound: '#0ea5e9', return: '#6366f1', plane: '#0ea5e9', cities: '#0ea5e9' },
});

rd.setColors({ ocean: '#f8fafc' }); // live, merges
rd.resetColors(); // back to the theme
```

**Everything, live (this is what the showcase studio drives):**

```ts
rd.setOptions({
  route: {
    outbound: { angle: 30, dash: { length: 0.04, gap: 0.02, speed: 2, width: 2.4 } },
    return: { angle: -30, lift: 0.28, dash: { length: 0.02, gap: 0.01, speed: 1 } },
  },
  cities: {
    periodMs: 1200,
    dot: { size: 0.008, dim: 0.2 },
    ripple: { size: 0.02, width: 0.004, grow: 4, opacity: 0.8 },
  },
  plane: { icon: 'jet', size: 40 },
  camera3d: { enabled: true, perspective: 900, tilt: 40, yaw: -12, depth: 90, interactive: true },
});

rd.setOptions({ camera3d: { tilt: 55 } }); // partial updates merge
rd.setWorld('flat'); // and the route is re-drawn there
```

**A one-way trip with a custom plane and a fine dash:**

```ts
new RouteDots(el, {
  route: { outbound: { angle: 40, dash: { length: 0.02, gap: 0.012, speed: 3 } } },
  plane: {
    icon: PlaneIcon.from({
      draw: (ctx, size) => {
        /* … */
      },
    }),
    flightMs: 3000,
  },
});
rd.setRoute('LHR', 'DXB', { roundTrip: false });
```

**Different cities:**

```ts
rd.setRoute({ code: 'SVO', name: 'Moscow', country: 'Russia', lat: 55.75, lng: 37.62 }, 'DXB');
```

**Bigger dots / coarser lattice:**

```ts
new RouteDots(el, { texture: { stepDeg: 2, dotSizeDeg: 0.55 } });
```

## Extending the source

Module map and design decisions live in [architecture.md](./architecture.md);
contribution workflow in [contributing.md](./contributing.md).
