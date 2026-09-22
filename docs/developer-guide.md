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

| Option        | Type                                                                              | Default                                  | Description                                                              |
| ------------- | --------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| `theme`       | `'light' \| 'dark'`                                                               | `'light'`                                | Colour theme (globe, dots, arcs, markers, atmosphere).                   |
| `view`        | `{ lat, lng, altitude }`                                                          | `{ 30, 45, 1.9 }`                        | Initial camera view (altitude = globe radii, 1.05–4).                    |
| `autoRotate`  | `{ enabled?, speed? }`                                                            | on, 0.4°/s                               | Gentle idle rotation.                                                    |
| `interactive` | `boolean`                                                                         | `false`                                  | Allow pointer drag + wheel zoom.                                         |
| `texture`     | `{ stepDeg?, resDeg?, dotSizeDeg?, width? }`                                      | 2 / auto / 0.62 / 2048                   | Dot lattice & texture options.                                           |
| `borders`     | `{ enabled?, color?, opacity?, width? }`                                          | on, theme colour, 0.55 / 1 px            | Country border lines. `opacity` = globe, `width` = flat-map stroke (px). |
| `route`       | `{ outboundLift?, returnLift?, arcRadius?, drawDurationMs?, staggerMs?, pulse? }` | 0.10 / 0.20 / 0.0022 / 1100 / 350 / true | Arc geometry & animation.                                                |
| `plane`       | `PlaneLayerOptions & { enabled? }`                                                | on                                       | Animated plane (see below).                                              |
| `frameRoute`  | `boolean`                                                                         | `true`                                   | Pan/zoom the camera to frame each new route.                             |
| `fallback`    | `{ enabled? }`                                                                    | `true`                                   | Use the flat map when WebGL is unavailable.                              |
| `flat`        | `FlatRouteMapOptions`                                                             | —                                        | Options for the flat fallback.                                           |
| `land`        | `TopoLand`                                                                        | bundled 110m mask                        | Replace the land mask.                                                   |

`PlaneLayerOptions`: `{ size?, color?, clearance?, flightMs?, pauseMs?, startDelayMs? }`.

### Methods

| Method                                        | Description                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `setRoute(from, to, { roundTrip? }): boolean` | Draws the route (arc(s) + markers + pulse + plane), pans the camera to frame it.         |
| `getRoute(): RouteDotsRouteInfo \| null`      | Resolved `{ from, to, roundTrip }` of the current route.                                 |
| `clearRoute()`                                | Removes arcs/markers/pulses/plane.                                                       |
| `setTheme('light' \| 'dark')`                 | Switches theme at runtime (re-renders the current route).                                |
| `resize()`                                    | Re-fits the renderer to the container (also handled automatically via `ResizeObserver`). |
| `dispose()`                                   | Tears everything down (RAF, listeners, GPU resources, DOM).                              |

### Events

Subscribe with `rd.on(event, handler)` (returns an unsubscribe fn);
`rd.off(event, handler)` to remove.

| Event           | Payload                       | When                                                       |
| --------------- | ----------------------------- | ---------------------------------------------------------- |
| `ready`         | `{ mode: 'webgl' \| 'flat' }` | Renderer mounted.                                          |
| `route:updated` | `RouteDotsRouteInfo`          | A new route was set.                                       |
| `route:drawn`   | `RouteDotsRouteInfo`          | The draw-on animation finished (webgl mode).               |
| `route:invalid` | `{ from, to }`                | A setRoute call was rejected.                              |
| `route:cleared` | —                             | `clearRoute()` was called.                                 |
| `mode:changed`  | `{ from, to }`                | WebGL construction failed and the flat fallback took over. |

### Statics

- `RouteDots.CITIES: readonly City[]` — the default city dataset (31 cities).
- `RouteDots.VERSION: string`
- Theme tables: `GLOBE_THEMES`, `ROUTE_THEMES`, `FLAT_THEMES` — override
  individual colours via the `colors` option (webgl) or by cloning and
  supplying your own theme.

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
  but never overlap.
- **Frame routing.** On `setRoute`, the camera tweens (1.4 s, ease-out) to the
  great-circle _midpoint_ of the route; altitude grows with route length so
  long-haul routes are framed from higher up.
- **Plane.** Flies the _outbound_ arc only: `flightMs` (default 4800 ms in the
  showcase, 4500 in the library), then `pauseMs`, then repeats.
- **Antipodes.** Endpoints within 0.01° are rejected; true antipodal pairs
  have no unique great circle and throw from the geometry layer.
- **Flat fallback.** Without WebGL, `FlatRouteMap` renders the same dot
  lattice as a 2D equirectangular map with curved SVG routes (outbound up,
  return down) and an animated plane — the public API is unchanged.
- **Endpoint pins.** In WebGL mode each endpoint gets a DOM pin badge
  (pill + stem + dot, `.rd-pin-*` classes) that is re-projected every frame
  and fades out when it rotates to the far hemisphere. In flat mode the city
  name renders as a haloed SVG label next to the marker. Badge colours follow
  the active theme.

## Customisation recipes

**Colours (webgl):**

```ts
new RouteDots(el, {
  theme: 'light',
  colors: { globe: '#fbfbfd', dots: '#7d8593', atmosphere: '#a8b6cc' },
});
```

Arc/marker colours follow `ROUTE_THEMES[theme]`; for fully custom arc colours,
use the lower-level `GlobeRenderer` + `RouteLayer` directly (they are exported
too).

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
