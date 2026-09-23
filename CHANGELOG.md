# Changelog

All notable changes to RouteDots are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Country fills: the map surface is now grey country shapes with white
  borders instead of the dot lattice — the flat-map look, on the sphere.
  - New `surface: 'countries' | 'dots'` option on `RouteDots`,
    `GlobeRenderer` and `FlatRouteMap` (`countries` is the default; `dots`
    keeps the classic lattice).
  - Pure seam handling in `src/core/antimeridian.ts`: rings are unwrapped
    into continuous longitudes and clipped at the meridian they overshoot,
    so Russia / Fiji / Antarctica fill correctly; enclaves (Lesotho) stay
    holes.
  - `CountrySurfaceLayer` (`src/globe/countrySurface.ts`): earcut
    triangulation projected onto the sphere and subdivided until no chord
    sags below its shell — the whole world in one ~15k-triangle draw call.
  - Flat fallback paints the same polygons on its canvas
    (`flat/countryPaths.ts`, even-odd fill, seam copies duplicated).
  - Unit tests for the seam clipping, the triangulation (land/ocean
    coverage, watertightness, determinism) and the path data; E2E asserts
    grey fills + white borders in both modes.

### Changed

- Border lines default to white at full opacity and every surface-hugging
  layer now takes its radius from one table (`src/globe/layerRadii.ts`:
  ocean → country fills → borders → city pulses → markers → pulses) so the
  stack never z-fights; route endpoint markers and pulse rings were lifted
  accordingly.
- Theme colours: `GlobeThemeColors.countries` (the fill) is new, the light
  ocean tone moves `#ffffff → #f2f5f9` so white borders read, and
  `FLAT_THEMES` gains `land`; `dots` keeps the legacy lattice colour.

### Added

- Camera tracking: the globe follows the plane. While a route is set, idle
  auto-rotation pauses and the camera eases back toward the plane whenever
  its ground position leaves the visible disc — the threshold is the visible
  horizon for the current camera altitude minus 5°, and the chase is an
  exponential ease (`1 − e^(−k·dt)`), so the plane can never slip behind the
  limb. Manual drags and `setView` tweens always win; `clearRoute` resumes
  idle rotation.
  - Pure, unit-tested policy in `src/routes/cameraTracking.ts`
    (`trackCamera`, `visibleHorizonDeg`, `trackingThresholdDeg`).
  - New public API (WebGL mode): `RouteDots.getCameraState()` and
    `RouteDots.setView(view, durationMs?)`.
  - New `e2e/tracking.spec.ts` + fixture covering hold, tween priority,
    ease-back and rotation resume on a real WebGL canvas.

### Changed

- Routes read lighter and finer, per design feedback:
  - Arc tubes are thinner: default radius `0.0022 → 0.0015`.
  - Light-theme route colours are softened: outbound `#23262e → #4f5b6b`,
    return `#6b7280 → #8a94a6`.
  - Flat fallback strokes thin from 3 / 2.5 px to 1.8 / 1.4 px
    (outbound / return).
- The return arc now always renders above the outbound — depth-independent
  painter layering (`renderOrder` outbound 1 / return 2 / pulses 3 / plane 4)
  — so "there and back" stays readable where the arcs visually overlap; the
  shared route shader adds a soft fade near the globe's limb so arcs melt
  into the surface instead of clipping at the silhouette.
- The plane's motion is eased with `easeInOutCubic` (gentle take-off and
  landing; the fly/pause scheduler itself stays linear) and it flies a touch
  higher above the arc (clearance `0.006 → 0.02`).

### Added

- Country borders: a light border layer decoded from the bundled world-atlas
  `countries-110m` data (Natural Earth, public domain), drawn under the routes.
  - WebGL: a new `BordersLayer` lifts every shared TopoJSON arc to a sphere
    hugging the surface — each border drawn exactly once in a single
    `LineSegments` draw call (7,650 segments).
  - Flat fallback: hairline SVG polylines beneath the routes, split at the
    antimeridian so nothing is drawn across the map seam.
  - New `borders` option: `{ enabled?, color?, opacity? (globe) / width? (flat) }`.
- Sparser, chunkier dot lattice for a cleaner hero look: grid step 1.5° → 2°
  (8,431 → 4,855 dots) with dot radius 0.45° → 0.62°, in both the WebGL
  texture and the flat fallback.
- `tools/generate-countries.mjs` regenerates the border data module.
- Showcase: a light/dark theme switcher (bottom-right of the hero) wired to
  `RouteDots.setTheme`, so the demo exercises live theme switching.
- Showcase: a friendly overlay (scoped to the hero) explains to run
  `npm run build` when the page is opened before the IIFE bundle exists (the
  bundle is a build artifact, not committed).
- `npm run dev` — builds the bundle, then serves the repo with a
  zero-dependency static server (`tools/serve.mjs`) so the showcase works
  straight out of the box at `http://localhost:5173` (the root redirects to
  the showcase page).
- Endpoint pin badges: each route endpoint now carries a labelled pin (pill +
  stem + dot) with the city name.
  - WebGL mode: a `EndpointLabels` DOM overlay (`src/routes/EndpointLabels.ts`)
    re-projects the badges every frame and fades them out when their anchor
    rotates to the far hemisphere. Projection is a pure, unit-tested function
    (`projectPin`) with an independent ray-caster round-trip test.
  - Flat fallback: city names render as haloed SVG labels next to the markers
    (`FlatRoutePoint.name`).
  - E2E asserts the pin names for the default LHR → DXB route and that they
    follow destination changes.

### Changed

- Showcase: the search form now reports the drawn route in a live status
  hint under the search button (`London → Dubai · round trip · Sep 22`), kept
  in sync with the from/to selects, the trip toggle and the departure date;
  the hint is exposed as `role="status"`/`aria-live="polite"`, and the
  invalid-pair error restores the last valid status instead of clearing it.
- Route arcs are thinner and hug the globe more closely for a more accurate
  look: default tube radius `0.0035 → 0.0022` and default lifts
  `0.18 / 0.34 → 0.10 / 0.20` (outbound / return).
- The airplane silhouette is a friendlier, fully rounded outline (quad-curve
  fuselage, swept wings with rounded tips, rounded tail) — applied to the
  WebGL sprite texture and the flat-fallback SVG path.
- `RouteLayer` now takes its default lift/radius from the shared
  `RouteModel` constants instead of duplicating the numbers.

### Fixed

- CI: `ci.yml` was rejected by GitHub at dispatch time — the e2e job used
  `hashFiles()` in a job-level `if`, which is only allowed on steps, so every
  workflow run failed in 0 s without executing a single job (quality
  included). Dropped the tautological guard; `playwright.config.ts` is
  committed, so the e2e job always runs.

## [0.1.0] - 2026-09-22

### Added

- Initial repository bootstrap: README, roadmap, contributing guide, LICENSE (MIT),
  changelog, PR/issue templates.
- Pure geo core (`src/core/`):
  - Minimal TopoJSON decoder that turns the bundled world land mask into polygon
    rings (quantized arcs, shared/reversed arcs, ring closing).
  - Even-odd scanline land rasterizer onto a regular lat/lng grid
    (`rasterizeLand`, `isLandAt`).
  - Dot-lattice builder for the "dot map" look (`buildDotGrid` — 8,431 dots at
    the default 1.5° spacing, built in ~40 ms).
  - Great-circle geometry: lat/lng ↔ 3D vector conversion, `slerp`, central
    angle, distance (km), midpoint, and lifted arc sampling
    (`greatCircleArc` with a `1 + lift·sin(πt)` radius profile — endpoints on
    the surface, peak at the midpoint).
- Bundled world land mask `src/data/land-110m.ts` (world-atlas 110m,
  Natural Earth data, public domain) plus `tools/generate-land.mjs` to
  regenerate it.
- Unit tests for all core modules (vector round-trips, slerp invariants,
  reference distances LHR–DXB / THR–DXB / JFK–SYD, known land/ocean points,
  even-odd fill with holes, lattice regularity, determinism).
- Project foundation & tooling: TypeScript (strict) source layout, ESM/CJS +
  type-declaration library build via tsup, convenience IIFE browser bundle with
  three.js inlined, Vitest unit-test setup, ESLint + Prettier, GitHub Actions CI
  (lint, typecheck, test, build, and Playwright E2E once present).
- Globe renderer (`src/globe/`):
  - `CameraRig` — pure, deterministic point-of-view state machine: lat/lng/altitude
    clamping, shortest-way longitude tweening (`easeOutCubic`), auto-rotation.
  - `createDotTexture` — equirectangular dot-map canvas texture (opaque ocean base
    - dot lattice) with `projectDotToPx` projection helper.
  - `createAtmosphere` — soft fresnel halo shader (BackSide sphere) that reads as a
    subtle rim on light hero backgrounds.
  - `GlobeRenderer` — three.js scene/camera/animation loop around the unit sphere:
    theme colours (`GLOBE_THEMES` light/dark), `setView()` camera animation,
    optional pointer drag + wheel zoom, `ResizeObserver`-driven resizing,
    per-frame callbacks for route layers, `readPixel()` for tests, `dispose()`,
    and a `supportsWebGL()` feature probe.
  - Core + globe modules are now exported from the package root.
- Playwright E2E setup with a WebGL smoke test: the dot globe renders in
  headless Chromium (opaque globe surface, transparent background) and the
  camera tween lands on the requested view.
- Route arcs (`src/routes/`):
  - `buildRoute` — pure route model: one-way = 1 arc, round trip = 2 arcs with
    _different lifts_ (outbound 0.18, return 0.34) so the curves never
    overlap; return endpoints reversed; rejects (near-)identical endpoints
    across the antimeridian.
  - `GreatCircleCurve` — three.js `Curve` evaluating the lifted great circle
    (slerp + `1 + lift·sin(πt)`), used by the tube geometry.
  - `RouteLayer` — renders one tube per arc with a custom shader: draw-on
    animation (origin → destination, staggered for the return), flowing dashes
    that travel in the arc's direction, end fades into the surface, endpoint
    markers and pulse rings. Driven by the renderer's frame loop via
    `update(time)`, with `onDrawn` callback and clean `dispose()`.
  - `ROUTE_THEMES` (light/dark arc + marker colours); route modules exported
    from the package root.
- E2E: round-trip route renders in WebGL and reports `drawn`.
- Plane animation (`src/routes/`):
  - `PlaneScheduler` — pure, clock-free timing: fly `flightMs`, pause
    `pauseMs`, repeat (delay, reset, degenerate-option handling).
  - `planeSilhouette` — pure, symmetric top-view airliner path data plus
    `drawPlane` canvas renderer.
  - `PlaneLayer` — sprite that repeatedly flies the outbound arc (same lifted
    great circle + clearance), oriented along its ground track in camera
    space, hidden during the pause phase.
- No-WebGL fallback (`src/flat/FlatRouteMap`): a flat equirectangular dot map
  (same dot lattice as the 3D globe) with an SVG overlay — two curved dashed
  routes (outbound up, return down), endpoint markers, a plane flying the
  outbound path, and a smooth pan/zoom that frames the route. Works in any
  DOM (no WebGL, no network).
- E2E: plane flight progress is monotonic in WebGL; the flat fallback draws
  both routes and animates the plane. Plane + flat modules exported from the
  package root.
- Public API (`src/RouteDots.ts`): the `RouteDots` facade with city
  resolution (`resolveCity`, 31-city bundled dataset), `setRoute` with
  automatic camera framing (great-circle midpoint, altitude scaled by route
  length), live theme switching, event emitter
  (`ready`, `route:updated`, `route:drawn`, `route:invalid`, `route:cleared`,
  `mode:changed`), `colors` passthrough, and clean `dispose()`.
- Showcase project (`examples/showcase/`): a full airline hero with the dark
  search panel (passengers, from/to grouped city selects, swap, date,
  one-way/round-trip, Search Flights) driving the globe live; features strip
  and integration snippet.
- Docs: developer guide (full API reference + React example), architecture
  guide (module map, texture pipeline, arc math, shaders, testing strategy),
  README with screenshots.
