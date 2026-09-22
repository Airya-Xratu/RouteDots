# Changelog

All notable changes to RouteDots are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
