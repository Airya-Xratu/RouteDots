# RouteDots — Architecture

## Design principles

1. **Pure core, thin renderers.** Everything that is geometry or timing lives
   in `src/core` and `src/routes/*Model/Scheduler` — no DOM, no three.js. It
   runs in Node and is covered by unit tests. The three.js layers are thin
   adapters around that core.
2. **Determinism.** All time-dependent code takes explicit time parameters
   (frame timestamps, `nowMs`), never reads clocks internally. That makes
   tweens, schedulers and animations testable and reproducible.
3. **Graceful degradation.** `RouteDots` probes WebGL once and either mounts
   the 3D globe or the flat 2D map. The public API is identical in both modes.

## Module map

```
src/
├── types.ts                  LatLon, City
├── cities.ts                 Default city dataset + resolveCity()
├── RouteDots.ts              Public facade: mode selection, routing, events
├── core/
│   ├── topojson.ts           Minimal TopoJSON decoder → PolygonRings
│   ├── landRaster.ts         Even-odd scanline land raster → LatGrid
│   ├── dotPattern.ts         Dot lattice over land (buildDotGrid)
│   └── greatCircle.ts        lat/lng ↔ vec3, slerp, distances, lifted arcs
├── globe/                    three.js scene
│   ├── cameraRig.ts          Point-of-view state machine (pure)
│   ├── dotTexture.ts         Dot-lattice → equirectangular canvas texture
│   ├── atmosphere.ts         Fresnel rim glow shader
│   └── GlobeRenderer.ts      Scene/camera/RAF loop, resize, interaction
├── routes/                   Route layer
│   ├── RouteModel.ts         buildRoute: arc specs (lifts, order) — pure
│   ├── GreatCircleCurve.ts   three.js Curve for TubeGeometry
│   ├── routeShader.ts        Arc tube GLSL (draw-on, dashes, fades)
│   ├── RouteLayer.ts         Tubes, markers, pulses; update(time)
│   ├── PlaneScheduler.ts     Flight/pause/repeat timing — pure
│   ├── planeSilhouette.ts    Airplane path data (pure) + canvas renderer
│   └── PlaneLayer.ts         Sprite following the outbound arc
├── flat/
│   └── FlatRouteMap.ts       No-WebGL fallback (canvas dots + SVG routes)
└── data/
    └── land-110m.ts          Bundled world land mask (world-atlas, generated)
```

## The dot texture pipeline

1. `land-110m.json` (world-atlas, Natural Earth 1:110m, public domain) is
   committed as a typed TS module so the library works offline. Regenerate:
   `node tools/generate-land.mjs`.
2. `decodeRings` turns the quantized topology into rings (delta-decoded arcs,
   shared/reversed arcs, ring closing).
3. `rasterizeLand` fills a lat/lng grid with the classic even-odd parity
   scanline (edge crossings per row, fill between pairs — holes included).
4. `buildDotGrid` samples a regular lattice (default 1.5° → 8,431 dots, ~40 ms)
   and keeps the land centres.
5. `createDotTexture` paints the dots on an equirectangular canvas (opaque
   ocean base + dots) → `CanvasTexture`. The same lattice powers the flat
   fallback, so both modes look consistent.

## Route geometry

- A route between A and B is the **shorter great circle**: `slerp` of the two
  surface vectors. Antipodal pairs have no unique great circle and throw.
- The rendered arc lifts the path off the surface with
  `radius(t) = 1 + lift·sin(πt)` — endpoints on the surface, peak at the
  midpoint (the airline-map "bulge").
- Round trips: `outboundLift` 0.18 vs `returnLift` 0.34. Same great circle,
  different lift ⇒ two non-overlapping curves that read as "there and back".
- `GreatCircleCurve` evaluates the same math directly (no sampled arrays) and
  feeds `TubeGeometry(128 segments, radius 0.0035)`.

## The arc shader (tube UVs)

`TubeGeometry` UVs run `uv.x` 0→1 along the route, which drives everything in
`routeShader.ts`:

```
alpha = uOpacity
      · (1 - smoothstep(uProgress - 0.015, uProgress, x))  // draw-on
      · smoothstep(0, 0.03, x) · (1 - smoothstep(0.97, 1, x))  // end fades
      · (1 - smoothstep(uDashSolid, +0.05, fract(x·uDashCount - t·uFlow)))  // flowing dashes
```

`uProgress` eases 0→1 over `drawDurationMs` (return arc staggered by
`staggerMs`); `uTime` advances the dash phase so dashes travel origin →
destination.

## Camera & framing

`CameraRig` (pure) holds `{lat, lng, altitude}` and advances it per frame:
auto-rotation (eastward, deg/s) or an ease-out-cubic tween with shortest-way
longitude interpolation. On `setRoute`, `RouteDots.frameRoute` tweens to the
route's great-circle midpoint at an altitude that grows with route length
(1.35 + dist°/90, clamped 1.4–2.4) — this is the "globe moves to the
destination" behaviour.

## The plane

`PlaneScheduler` (pure) maps time → progress: fly `flightMs`, pause `pauseMs`,
repeat. `PlaneLayer` positions a sprite on the outbound arc
(`slerp` + `lift + clearance`), and orients it by projecting a short tangent
into camera space (`rotation = atan2(dy, dx) - 90°`). The sprite is hidden
during the pause phase and behind the globe (depth test on).

## Flat fallback

`FlatRouteMap` is a self-contained DOM component: a canvas with the same dot
lattice (equirectangular), an SVG overlay (two quadratic-Bézier dashed routes
— outbound up, return down — plus endpoint markers), and a plane moved along
`getPointAtLength`. A stage div with an explicit pixel size keeps canvas,
SVG-viewBox and framing math in one coordinate space; `frameRoute` pans/zooms
it (CSS transform, 700 ms ease-out) to centre the route.

## Testing strategy

| Layer                                           | How it's tested                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Core geo (slerp, distances, raster, dots)       | Vitest unit tests with independent references (haversine, known land/ocean points, synthetic polygons)                                 |
| Camera rig, schedulers, route model, silhouette | Vitest unit tests (pure, deterministic)                                                                                                |
| WebGL rendering, shaders, sprite, showcase      | Playwright (headless Chromium): pixel sampling, camera tween landing, draw-on completion, plane monotonic progress, form-driven routes |
| Flat fallback                                   | Playwright: DOM structure + animated plane transform                                                                                   |

CI (`.github/workflows/ci.yml`): format → lint → typecheck → unit tests →
build → Playwright (chromium).
