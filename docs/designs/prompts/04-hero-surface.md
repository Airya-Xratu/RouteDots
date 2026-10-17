# Brief 04 — The hero surface

**Goal:** design the first screen a visitor sees: the full-bleed scene with
the chrome arranged around it.

This is the brief where the chrome has to prove it can stay out of the way.
The map is the subject; the panel, the headline and the nav are the cockpit
around it.

---

## Context

`examples/showcase/index.html` already ships a hero: a full-height dot globe
with a nav bar, a headline block, a dark flight-search panel anchored bottom
left, a floating utility cluster bottom right, and a customisation sheet
sliding in from the right.

That hero works, but it is currently one fixed arrangement. This brief
rebuilds it as a designed surface: anchored, proportioned, responsive, and
built from the component library.

## Read first

- `docs/designs/design.md` — §1 (product context), §2 (principles),
  §5 (layout, overlay regions, responsive), §6.4 (the dark instrument
  panel), §9.7 (what the chrome must never do to the scene).
- `docs/designs/prompts/01-foundations.md`, `02-scene-grammar.md` and
  `03-component-library.md` — the tokens, the scene grammar and the
  components you are assembling.
- `examples/showcase/index.html` — the current hero, its CSS and its markup.
- `docs/developer-guide.md` — the options the scene is configured with.

---

## What to design

**The hero, in the light chrome.** A full-height composition:

- **The scene** — a RouteDots globe showing a round trip (London ⇄ Dubai) as
  the backdrop: ocean, country fills, hairline borders, the two arcs with
  their different lifts and dash patterns, the travelling plane, the city
  ripples, the pin badges at both ends, the atmosphere rim. The camera frames
  the route, with the visible disc placed so the arcs read against the
  darker side of the sphere.
- **The nav** — logo lockup (the dotted brand mark + wordmark) on the left,
  a small link group in the centre or right, and one primary action. The nav
  is transparent over the scene; it gains a hairline and a blur only when the
  page scrolls.
- **The hero copy** — the headline and the lead paragraph, top-left, no wider
  than 520px. The headline is the product promise, not a feature list.
- **The search panel** — the dark instrument panel, bottom-left, 360px wide,
  with the anatomy from `design.md` §10.1: the passenger row, the From/To
  pair with the swap button between them, the departure date and the
  round-trip segment, the pill CTA, and the status line.
- **The utility cluster** — bottom-right: the "Interactive demo" badge, the
  customisation toggle, and the theme toggle, as glass chips.

**The same hero in the dark chrome**, with the scene in its dark palette.

**The hero with the customisation sheet open**, so the two foreground objects
(panel, sheet) and the scene are seen together and their relationship is
clear.

**A small-screen hero** — the panel becomes a bottom sheet spanning the
width, the hero copy moves above it, the scene stays full-bleed behind, and
the utility cluster stacks.

**A no-WebGL hero** — the flat world in the same composition, with the same
chrome, so the fallback is designed rather than accidental.

---

## Constraints

- The globe's visible disc is the focal area. The headline, the panel and
  the sheet must not overlap it — check at 1440px and 1024px.
- The panel is **dark on both themes** (`design.md` §6.4). The nav, the
  headline and the utility cluster are theme-aware; the panel is not.
- The scene is never obscured by a scrim. No overlay covers the globe's
  centre.
- Overlay geometry follows `design.md` §5.3 — nav 22px/40px, copy 118px from
  the top, panel 40px from the left and the bottom, cluster 28px from the
  right and the bottom, sheet 348px wide.
- The chrome uses only the tokens and the components already designed.
- The scene's own configuration (the palette, the arc styles) is set through
  the library's real options — show the option snippet in the hand-over note.
- Both themes, all breakpoints, `prefers-reduced-motion` honoured.

## Deliverables

- A self-contained HTML prototype of the hero, with the scene replaced by a
  faithful static stand-in if the library cannot be loaded — and the real
  library wired in if it can.
- A hand-over note: the composition decisions (why the copy sits where it
  does, how the focal area is protected at each breakpoint), and the
  library options used for the scene.

## Acceptance criteria

- The headline, the panel, the sheet and the cluster never cover the route.
- The panel reads as a cockpit instrument on the light page, and the
  difference between the panel and the page is intentional rather than
  accidental.
- The theme toggle flips the whole hero, including the scene palette.
- The small-screen layout keeps the CTA above the fold and the scene
  visible.
- Everything is built from the components in brief 03 — no new one-off
  styles.
