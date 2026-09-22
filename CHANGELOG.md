# Changelog

All notable changes to RouteDots are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- CI: `ci.yml` was rejected by GitHub at dispatch time — the e2e job used
  `hashFiles()` in a job-level `if`, which is only allowed on steps, so every
  workflow run failed in 0 s without executing a single job (quality
  included). Dropped the tautological guard; `playwright.config.ts` is
  committed, so the e2e job always runs.

### Added

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

- Route arcs are thinner and hug the globe more closely for a more accurate
  look: default tube radius `0.0035 → 0.0022` and default lifts
  `0.18 / 0.34 → 0.10 / 0.20` (outbound / return).
- The airplane silhouette is a friendlier, fully rounded outline (quad-curve
  fuselage, swept wings with rounded tips, rounded tail) — applied to the
  WebGL sprite texture and the flat-fallback SVG path.
- `RouteLayer` now takes its default lift/radius from the shared
  `RouteModel` constants instead of duplicating the numbers.

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
