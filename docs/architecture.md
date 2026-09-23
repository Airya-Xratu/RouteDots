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
├── types.ts                  LatLon, City, WorldMode
├── cities.ts                 Default city dataset + resolveCity()
├── theme.ts                  One palette → GLOBE/ROUTE/FLAT theme tables
├── RouteDots.ts              Public facade: mode selection, routing, live styling, events
├── core/
│   ├── topojson.ts           Minimal TopoJSON decoder → PolygonRings
│   ├── antimeridian.ts       Seam-safe ring splitting (unwrap + clip) — pure
│   ├── landRaster.ts         Even-odd scanline land raster → LatGrid
│   ├── dotPattern.ts         Dot lattice over land (buildDotGrid)
│   └── greatCircle.ts        lat/lng ↔ vec3, slerp, distances, lifted arcs
├── globe/                    three.js scene
│   ├── cameraRig.ts          Point-of-view state machine (pure)
│   ├── layerRadii.ts         Radii of the surface-hugging layer stack
│   ├── countrySurface.ts     Country fills: earcut + conforming subdivision
│   ├── dotTexture.ts         Dot-lattice → equirectangular canvas texture
│   ├── atmosphere.ts         Fresnel rim glow shader
│   └── GlobeRenderer.ts      Scene/camera/RAF loop, resize, interaction
├── markers/
│   ├── blinkPattern.ts       Ripple curve + phase offsets — pure
│   └── rippleStyle.ts        Resolve dots + ripple for both worlds — pure
├── routes/                   Route layer
│   ├── RouteModel.ts         buildRoute: arc specs (lifts, angles, order) — pure
│   ├── arcPath.ts            Banked great-circle arc maths (arcPoint) — pure
│   ├── routeStyle.ts         Resolve colours/lifts/angles/dashes — pure
│   ├── PlaneIcon.ts          Icon component: presets, SVG path, image, draw()
│   ├── GreatCircleCurve.ts   three.js Curve for TubeGeometry (lift + angle)
│   ├── routeShader.ts        Arc tube GLSL (draw-on, dashes, fades)
│   ├── RouteLayer.ts         Tubes, markers, pulses; update(time)
│   ├── PlaneScheduler.ts     Flight/pause/repeat timing — pure
│   ├── planeSilhouette.ts    Airplane path data (pure) + canvas renderer
│   ├── PlaneLayer.ts         Sprite following the outbound arc
│   └── EndpointLabels.ts     DOM pin badges + projection (projectPin, pure)
├── flat/
│   ├── layers.ts             Layer names/attributes of the flat DOM stack
│   ├── countryPaths.ts       Country polygons → SVG path data (pure)
│   ├── routePath.ts          Quadratic arcs + framing bounds — pure
│   ├── camera3d.ts           3D camera maths: transforms, zoom, follow — pure
│   └── FlatRouteMap.ts       Flat world (canvas fills + SVG routes + 3D camera)
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
4. `buildDotGrid` samples a regular lattice (default 2° → 4,855 dots, ~40 ms)
   and keeps the land centres.
5. `createDotTexture` paints the dots on an equirectangular canvas (opaque
   ocean base + dots) → `CanvasTexture`. The same lattice powers the flat
   fallback, so both modes look consistent.
6. `decodeBorderArcs` turns the bundled `countries-110m` topology (shared
   TopoJSON arcs) into country border polylines — each border exactly once —
   lifted to a `LineSegments` sphere just above the country fills
   (`BordersLayer`) and drawn as SVG polylines in the flat fallback (split at
   the antimeridian).

## The country fill pipeline

The default surface (`surface: 'countries'`) paints grey country shapes with
white borders instead of the dot lattice:

1. `decodeCountryPolygons` walks the `countries-110m` geometries into
   `[outer, ...holes]` polygons, then `core/antimeridian.ts` makes every ring
   seam-safe: longitudes are unwrapped into a continuous sequence (so a
   ±180° duplicate — Antarctica — is _not_ a crossing) and the ring is
   clipped against the meridian it overshoots, the clipped-off part wrapping
   back by a full turn (Russia, Fiji).
2. `countrySurface.triangulatePolygonOnSphere` triangulates each polygon in
   lng/lat space with three.js' earcut (`ShapeUtils.triangulateShape`) and
   projects every triangle onto the sphere.
3. Triangles longer than `DEFAULT_MAX_EDGE_DEG` (6°) are recursively split at
   their edge midpoints — midpoints are shared by neighbouring triangles, so
   the mesh stays watertight. The 6° budget keeps a chord's sag
   (`1 − cos 3° ≈ 0.0014`) inside the fill shell's lift (1.0025), so no
   triangle dips under the ocean sphere.
4. The ~15k triangles ship as one non-indexed `BufferGeometry` (one draw
   call), double-sided because earcut's winding varies per country.
5. The flat fallback paints the same polygons on its canvas via
   `flat/countryPaths.ts` (one SVG path datum per polygon, filled even-odd,
   seam copies duplicated by a map width).

The dot lattice stays available as `surface: 'dots'`.

## Route geometry

- A route between A and B is the **shorter great circle**: `slerp` of the two
  surface vectors. Antipodal pairs have no unique great circle and throw.
- The rendered arc lifts the path off the surface with
  `radius(t) = 1 + lift·sin(πt)` — endpoints on the surface, peak at the
  midpoint (the airline-map "bulge").
- Round trips: `outboundLift` 0.10 vs `returnLift` 0.20. Same great circle,
  different lift ⇒ two non-overlapping curves that read as "there and back".
- **Curve angle.** `arcPoint(from, to, lift, angle)` banks the whole arc about
  its chord: the lifted point is rotated by `angle` around the chord axis
  (Rodrigues), so `t = 0` / `t = 1` are untouched — endpoints stay exactly on
  the surface — while the apex swings sideways by up to ±85°. Each leg has its
  own angle, so a round trip's arcs can be leaned independently. Both worlds
  fly the same geometry: `GreatCircleCurve` for the tube, `PlaneLayer.setArc`
  for the plane, `flat/routePath.ts` (a quadratic Bézier whose control point is
  rotated out of the perpendicular by the same angle) for the flat map.
- `GreatCircleCurve` evaluates the same math directly (no sampled arrays) and
  feeds `TubeGeometry(128 segments, radius 0.0015)`.
- `routeStyle.ts` turns `route` options + the palette into concrete per-leg
  styles (colour, opacity, lift, angle, width, dash). The dash is expressed as
  fractions of the whole route, which is what lets one definition drive the
  globe's shader uniforms (`uDashCount`, `uDashSolid`, `uFlow`) and the flat
  map's `stroke-dasharray` px identically.

## Endpoint pin badges

`EndpointLabels` overlays DOM pin badges (pill + stem + dot) at the route
endpoints. `projectPin(v, camera, w, h)` is pure math — world point → camera
(view) space → projection matrix — and returns NDC-derived container pixels
plus a `visible` flag. Two gotchas baked in:

- `Vector3.applyMatrix4` already performs the homogeneous divide, so the
  result is NDC directly — dividing again (by clip.z or clip.w) skews every
  off-centre position by the near/far-plane terms.
- Visibility is a facing test `dot(anchorDir, cameraDir) ≥ 0.12`, so a badge
  fades just before its anchor reaches the limb rather than floating in empty
  space.

The overlay layer is `pointer-events: none` and theme-scoped (`.rd-pin-light`
/ `.rd-pin-dark` CSS variables); the flat fallback renders the names as haloed
SVG `<text>` instead (same `FlatRoutePoint.name` input).

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

While a route is set, horizon-aware tracking (`cameraTracking.ts`, pure)
keeps the plane in view: idle auto-rotation pauses, and whenever the plane's
ground position leaves the visible disc (horizon for the camera altitude
minus a 5° margin) the camera eases back toward it by `1 − e^(−k·dt)`.
Manual drags and `setView` tweens always win; `clearRoute` stands the
tracker down and resumes idle rotation.

## The plane

`PlaneScheduler` (pure) maps time → progress: fly `flightMs`, pause `pauseMs`,
repeat. The schedule stays linear; `PlaneLayer` eases the _motion_ with
`easeInOutCubic` so the plane lifts off and lands gently, positions the sprite
on the outbound arc (`slerp` + `lift + clearance`), and orients it by
projecting a short tangent into camera space
(`rotation = atan2(dy, dx) - 90°`). The sprite is hidden during the pause
phase and behind the globe (depth test on).

## Route layering

Tubes are drawn depth-independent (no depth write) in explicit painter order:
outbound `renderOrder` 1, return 2 — so "there and back" stays readable where
the arcs overlap — pulses 3, plane sprite 4. The shared route shader adds a
soft limb fade near the globe's visible edge so arcs melt into the surface
instead of hard-clipping at the silhouette.

## Flat world

`FlatRouteMap` is a self-contained DOM component: a canvas with the same dot
lattice (equirectangular), an SVG overlay (two quadratic-Bézier dashed routes
— outbound up, return down — plus endpoint markers, labels and the plane), and
a plane moved along `getPointAtLength`. A stage div with an explicit pixel size
keeps canvas, SVG-viewBox and framing math in one coordinate space;
`frameRoute` pans/zooms it (CSS transform, 700 ms ease-out) to centre the
route.

The DOM is a four-level chain — container → viewport → world → stage — so the
**3D camera effect** (`camera3d`) is a pure styling concern: the container gets
a CSS `perspective`, the world a `rotateX(tilt) rotateZ(yaw)`, and the layer
SVGs `translateZ(depth)` (routes + plane), `· 0.55` (cities) and `· 0.3`
(borders) — real parallax, since the same map is still drawn flat underneath.
Dragging orbits (0.3°/px, clamped), the wheel zooms (`zoomStep`, 0.35×–6×) and
the chase eases the view centre whenever the plane leaves the safe area
(`followCentre`), all pure functions in `flat/camera3d.ts`.

## Testing strategy

| Layer                                                 | How it's tested                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core geo (slerp, distances, raster, dots)             | Vitest unit tests with independent references (haversine, known land/ocean points, synthetic polygons)                                                             |
| Camera rig, schedulers, route model, silhouette       | Vitest unit tests (pure, deterministic)                                                                                                                            |
| WebGL rendering, shaders, sprite, showcase            | Playwright (headless Chromium): pixel sampling, camera tween landing, draw-on completion, plane monotonic progress, form-driven routes                             |
| Flat fallback / flat world                            | Playwright: DOM structure, layer stack, dashes, ripple keyframes, animated plane transform, 3D camera transforms                                                   |
| Customisation (palette, angles, dashes, icon, camera) | Vitest: resolve/geometry maths. Playwright: `e2e/customize.spec.ts` (colours, dash px, banked arcs, ripples, 3D camera, live updates) and the showcase-studio spec |

CI (`.github/workflows/ci.yml`): format → lint → typecheck → unit tests →
build → Playwright (chromium).
