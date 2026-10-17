# Brief 08 — The flat world, the small screens and the edge states

**Goal:** design the states that are usually left to chance: the no-WebGL
fallback, the tablet and phone layouts, the reduced-motion mode and the
degraded network.

The library promises graceful degradation. A promise like that has to be
designed, or it is only a claim.

---

## Context

RouteDots renders a 3D globe when WebGL is available and a flat SVG map when
it is not — the same API, the same palette, the same route model, the same
dash patterns, the same pins, scaled into a 2× map space. The flat world can
also opt into a CSS 3D camera (`camera3d`) that tilts the map and floats the
route layer above it.

The chrome around the scene is currently designed for a 1440px desktop and
patched at 760px. The phone layout, the tablet layout, the reduced-motion
mode and the flat world have no designed treatment at all.

## Read first

- `docs/designs/design.md` — §5.5 (responsive behaviour), §9 (the scene
  grammar, which must survive the flat world), §8.3 (reduced motion), §12
  (accessibility), §6.3 (glass surfaces and their cost on a canvas).
- `docs/designs/prompts/02-scene-grammar.md` — the rule that the flat map
  and the globe must read as the same product.
- `src/flat/FlatRouteMap.ts` and `src/flat/camera3d.ts` — the flat world
  and its 3D camera: perspective 1400px, tilt 32°, yaw −6°, depth 44px.
- `src/labels/textStyle.ts` — the flat map's own label scale (×2 into map
  space) and its halo.
- `examples/showcase/index.html` — the current single media query at 760px.

---

## What to design

**The flat world, in the hero composition.** The same hero as brief 04, but
with the SVG flat map instead of the globe: country fills, hairline borders,
the city dots with their ripples, the two arcs with the real dash patterns
in `stroke-dasharray` pixels, the travelling plane, the haloed city names,
and the endpoints. The chrome is unchanged — which is the point: the
fallback must not look like a different product.

**The flat world with the 3D camera.** The tilted map with the route layer
floating above it and the border and city layers at their true parallax
depths. The chrome stays flat and orthogonal on top of it, and the
relationship is designed rather than accidental.

**The tablet layout.** Between 760px and 1024px: the hero copy and the
panel stack, the studio becomes narrower, and the scene stays full-bleed
behind them. Show where the copy's measure, the panel's width and the
cluster's position change.

**The phone layout.** Below 760px: the panel becomes a bottom sheet
spanning the width with 16px insets, the hero copy moves to the top, the nav
collapses to the logo plus one action, the utility cluster stacks, and
every touch target grows to 44px. Show the search form and the globe
together in this layout, plus the phone version of the studio sheet and of
the itinerary card.

**The very narrow layout.** Below 480px, where the type ramp drops a step,
the panel's fields stack, and the CTA stays full width. The scene's framing
changes so the route is still legible on a narrow viewport.

**The reduced-motion layout.** The same composition with
`prefers-reduced-motion: reduce`: the plane does not loop, the ripples are
frozen at a legible phase, the dashes are static, the camera cuts instead of
pans, and the chrome transitions are removed. Show what still communicates
the route without motion — the arc, the lift difference, the pins.

**The degraded states.** A slow network (the scene loads late — show the
chrome before the scene exists, and the layout that keeps the copy and the
panel stable), and a scene that fails to initialise (a calm, designed
message and a plain fallback background rather than a blank rectangle).

---

## Constraints

- The flat world and the globe use the **same** palette, the same dash
  patterns, the same pin treatment and the same endpoint semantics. Any
  difference between them is one of _geometry_, never of language.
- The flat map renders in its own 2× pixel space — labels and strokes are
  scaled by the library. Do not compensate for that in the chrome; let the
  library do it.
- The phone layout must work with one hand: the CTA, the swap and the
  primary navigation sit in the lower half of the screen.
- Chrome never scales with the scene — no transform on the container, no
  `position: sticky` chrome over the scene.
- Glass surfaces over a WebGL canvas stay at 4–8px blur and 70–80% tint.
- Every layout in this brief must be reachable at a real viewport width —
  specify the width each layout is drawn at.
- `prefers-reduced-motion` is a designed state with its own visual, not just
  "the animation is off".

## Deliverables

- A self-contained HTML prototype covering the layouts and states described
  above, with a small viewport switcher so each layout can be inspected
  side by side.
- A hand-over note: the breakpoint behaviour, what was dropped or collapsed
  at each width, and how the reduced-motion state communicates the route.

## Acceptance criteria

- The flat world and the globe read as the same product at a glance.
- At every width the CTA, the swap and the primary navigation are reachable
  with a thumb.
- The reduced-motion state still communicates the outbound/return
  distinction.
- The degraded states look designed — no blank areas, no raw error text.
- The prototype ships with no console errors and no horizontal overflow at
  320px.
