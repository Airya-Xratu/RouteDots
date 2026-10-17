# Brief 02 — The scene grammar

**Goal:** document and render the map's own visual language — the rules that
make a RouteDots scene legible — so the chrome around it can speak the same
language.

Most UI briefs only design the frame around the picture. This one designs the
**picture's grammar**: what an arc means, why the two legs of a round trip
differ, what an endpoint dot promises, when a pin badge appears, how a legend
has to be drawn so it matches the thing it describes.

---

## Context

RouteDots draws flight routes on a real 3D sphere. The visual system is
already decided in code and in `design.md` §9 — this brief turns it into
something a designer can use, and something the chrome can echo.

The one rule that matters most: **outbound and return must be distinguishable
by three independent cues** (colour, dash pattern, lift) so the pair reads
without colour perception, and so a legend is honest.

## Read first

- `docs/designs/design.md` — §9 (data-visualisation grammar) in full, plus
  §3.1 (scene palette) and §3.4 (the accent bridge).
- `src/theme.ts` — the scene palette and the theme tables derived from it.
- `src/routes/routeStyle.ts` — dash defaults, widths, lifts, angles.
- `src/routes/RouteModel.ts` — the arc specs and the outbound/return lifts.
- `src/markers/rippleStyle.ts` — the city dot and ripple numbers.
- `src/routes/airportStyle.ts` — the endpoint dot and pulse ring.
- `src/labels/textStyle.ts` — the pin badge's type.
- `src/globe/layerRadii.ts` — the layer stack.

---

## What to design

**A scene specimen** — a reference sheet that renders each element of the map
in isolation, at the real values, in both scene palettes.

- **The layer stack**, drawn as an exploded diagram: ocean → country fills →
  borders → city pulses → endpoint markers → endpoint pulses → route arcs →
  plane → pin badges → atmosphere, with the shell radii from
  `src/globe/layerRadii.ts` noted beside each band.
- **Arc anatomy**: a single outbound arc annotated with its lift (0.10), its
  curve-angle mechanism, its dash pattern (14 dashes, 55% duty, 4.9 dashes/s)
  and its width. Show the same arc in the return style (18 dashes, 45% duty,
  3.96/s, lift 0.20) so the difference is visible side by side.
- **The round trip**: outbound and return drawn together, with the three
  separating cues annotated — colour, dash, lift. This is the money shot of
  the whole system.
- **The one-way route**: the same arc alone, deliberately _not_ looking like
  half a pair.
- **Curve angle**: the same route drawn at a few different `angle` values,
  including the ±12° minimum for a visible round trip, and the ±85° extreme.
- **Endpoint anatomy**: the source and destination dots, their one-shot pulse
  ring, and the difference in styling that `airports.source` /
  `airports.destination` allows. Show the styled-asymmetric version (tinted
  departure, neutral arrival) and the neutral version.
- **The city cluster**: the solid breathing dot, its dim floor (0.45), and
  the ripple ring at its real growth (×2.6) and peak opacity (0.55).
- **The pin badge**: the city-name pill at its real type (12px / 600 /
  0.01em), with and without the pill background, and the halo behaviour used
  by the flat map.
- **The plane**: the `airliner`, `jet`, `arrow` and `dot` presets, plus the
  custom painter variant, at the real sprite scale.
- **A legend** that describes the scene honestly: dashed line samples that
  reproduce the actual dash patterns (not solid approximations), dot swatches
  for endpoints, and the arc swatch in the right colour. Show the legend
  with one leg, with two legs, and with a custom endpoint colour scheme.

**The chrome echo.** A short section showing how the scene's rules translate
into UI: the same outbound/return colour pairing in a legend chip, the same
pin-pill treatment for a UI tooltip, the same dot geometry for a status
indicator.

---

## Constraints

- Every number shown must come from the source files above — no invented
  values, no approximations.
- The specimen may be a static illustration, but it must use the **real**
  palette values so the chrome built on it matches the real product.
- Keep the specimen legible: annotations in `--type-micro` / `--type-sm`,
  hairlines at `--rd-line`, generous space from the spacing scale.
- Respect the rule that the map's colours and the chrome's colours are
  different families, and that the accent follows the outbound arc.
- No emoji. No gradients on chrome surfaces.

## Deliverables

- A self-contained HTML specimen file.
- A hand-over note: the numbers you took from each source file, the legend
  pattern you settled on, and any place where the code's defaults and
  `design.md` disagree.

## Acceptance criteria

- The round-trip specimen shows three genuinely different cues between the
  two legs, and the legend samples reproduce the real dash patterns.
- Every numeric annotation traces to a source file.
- The specimen works in both the light and the dark scene palette.
- A reader who has never seen the product can tell which leg is outbound and
  which is return, in greyscale.
