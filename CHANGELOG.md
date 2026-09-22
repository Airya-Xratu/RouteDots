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
