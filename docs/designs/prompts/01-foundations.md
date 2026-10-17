# Brief 01 — Design foundations

**Goal:** turn the design system in `design.md` into a rendered, inspectable
foundation: the colour, type, space, shape, elevation, motion and icon
vocabulary, shown as a specimen a designer (or a developer) can point at.

This brief produces the shared vocabulary. Every later brief inherits it.

---

## Context

RouteDots is a JavaScript library that draws flight routes on a dot globe
(3D/WebGL) or a flat map (SVG fallback). The host application wraps it in
chrome — navigation, a flight-search panel, a customisation studio, a
marketing band, a footer.

Today that chrome is hand-written inside a single file
(`examples/showcase/index.html`) with ad-hoc hex values, mixed radii and
emoji used as icons. The goal of this project is a coherent, token-driven
system that a host app can reproduce, and that the showcase can be rebuilt
from.

The system is fully specified in [`../design.md`](../design.md). This brief
does not invent a new visual language — it **renders** the one that is
already specified, and flags any place where the specification is unclear or
self-contradictory.

## Read first

- `docs/designs/design.md` — the whole file, especially §3 (colour),
  §4 (typography), §5 (space & layout), §6 (shape & elevation),
  §8 (motion), §7 (iconography), §16 (token reference).
- `src/theme.ts` — the scene palette, the one the library owns.
- `examples/showcase/index.html` — the current chrome, so the improvements
  are recognisable as _this_ product.

---

## What to design

A **foundations board** — a single scrollable page that renders the system
rather than describing it.

**Colour**

- The full UI token set from `design.md` §3.2, rendered as labelled swatches
  with their hex value and a contrast note.
- The scene palette from `design.md` §3.1, rendered as labelled swatches too
  — the map's colours are tokens as well, they just live in the library.
- Both chrome themes shown side by side so the relationship is obvious.
- A demonstration of the accent bridge (`design.md` §3.4): the accent swatch
  next to the outbound-arc swatch, visually paired.

**Typography**

- The type ramp from `design.md` §4.2, each step rendered in real text
  ("Dubai to London") with its size, line-height, weight and tracking
  printed as metadata.
- The UI stack and the mono stack, with the fallback chain made explicit.

**Space, shape and elevation**

- The spacing scale rendered as nested bars, so the rhythm is visible.
- The radius scale rendered as corner samples.
- The elevation scale rendered as cards on a neutral plane.

**Motion**

- The duration and easing tokens, each demonstrated as a short, replayable
  motion sample (a chip that slides, a sheet that eases in, a value that
  counts up). Add a "replay" control, and make every sample respect
  `prefers-reduced-motion`.

**Iconography**

- The icon inventory from `design.md` §7.4 drawn as inline SVG on the 24px
  grid: each icon at 16px, 20px and 24px, with the stroke weight visible.
- The plane silhouette from the library's own presets, shown beside the
  chrome's plane glyph so the two agree.

---

## Constraints

- Use **only** the tokens in `design.md` §16 (plus any new token you add and
  declare in the hand-over note).
- Every swatch, type sample and motion sample must be labelled with the
  token name — the board is a reference, so it must be copyable.
- The board must not look like a marketing page. It is a working document:
  a dense, calm, technical layout on a `--rd-canvas` background, with the
  section headings in `--type-h2`.
- The board must render correctly in the dark theme as well.
- No emoji. No icon font. No webfont. No network requests.

## Deliverables

- A self-contained HTML file (plus its CSS/JS) that renders the board.
- The hand-over note: tokens added, any place where `design.md` was
  ambiguous and what you decided, and any token you think should be dropped.

## Acceptance criteria

- Every token in `design.md` §16 appears somewhere on the board, and every
  token on the board exists in `design.md` §16 or is declared in the note.
- Swatch labels show the exact value, so a developer can copy them into
  CSS.
- The type ramp shows real product copy, not lorem ipsum.
- The motion samples honour `prefers-reduced-motion`.
- No console errors, no horizontal scroll at 1280px, usable at 480px.
