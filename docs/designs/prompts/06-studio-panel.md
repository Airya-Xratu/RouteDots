# Brief 06 — The customisation studio

**Goal:** design the live customisation sheet — the panel that proves the
library is fully themeable, and that doubles as the product's own
documentation.

This is the densest surface in the product, and the easiest to get wrong: it
must feel like an instrument panel, not a settings dump.

---

## Context

`examples/showcase/index.html` ships a "customization studio": a 348px sheet
that slides in from the right, containing groups for the world, the colours,
the plane, the cities, the labels, the airports, the dashes and the angles,
followed by a live-generated code snippet and a reset button.

Every control calls the **public API** — `setColors()`, `setOptions()`,
`setWorld()` — so the sheet is a demonstration of the API, not a private back
door. That property must survive the redesign.

The sheet is currently a stack of raw `input` elements in a dark column.
This brief turns it into a designed instrument.

## Read first

- `docs/designs/design.md` — §10.2 (the sheet's anatomy and rules), §11
  (states), §6.3 (glass), §3.1 and §3.4 (the palette it edits, and the
  accent bridge), §12 (accessibility).
- `docs/designs/prompts/03-component-library.md` — the slider, the colour
  swatch, the checkbox, the control row, the code block, the group
  separator.
- `docs/developer-guide.md` — the full option reference, so every control
  maps to a real option and a real default.
- `examples/showcase/index.html` — the current studio, including the code
  it generates.

---

## What to design

**The sheet, open.** The full 348px column over the scene, with:

- A **header** — the title, a one-line explanation that every control calls
  the public API, and a close control.
- The **groups**, in the order set out in `design.md` §10.2, each separated
  by a hairline with space above it, each with an uppercase micro-heading.
- The **control row** as the repeating unit: a label on the left, the
  control in the middle, and the resolved value on the right in tabular
  numerals. Show the variant where the value is a unit (`0.011`), a
  percentage (`55%`), a boolean (`on` / `off`) or a colour chip.
- The **colour group**, where each of the 13 palette keys gets a row with a
  swatch that opens a picker, and the row shows the live hex value. The
  current swatch must be visually connected to the scene it changes.
- The **live code block** — the generated `setOptions()` snippet, updated as
  the controls move, with a copy affordance and a subtle highlight on the
  keys that were just changed.
- The **reset** action, visually separated at the bottom, with a
  confirmation that does not use a blocking `alert()`.

**The sheet, closed.** The utility cluster's toggle, with the
`aria-expanded` state visible and the sheet's absence leaving the scene
unobstructed.

**The sheet at work.** The sheet open over a scene that has visibly changed
— a different palette, a different plane icon, different dash values — so
the causality between the control and the scene is obvious.

**The mobile sheet.** The same content as a bottom sheet that can be dragged
or scrolled, with the group headings sticky so the user knows where they
are, and the live code block collapsed behind a disclosure.

**An empty/edge condition.** A group whose controls are irrelevant in the
current world (for example the flat world's options when the globe is
active) — show how it is hidden or disabled rather than silently wrong.

---

## Constraints

- The sheet's contents map **one-to-one** onto the library's public options.
  No invented settings. If a control is added, the corresponding option must
  exist in `docs/developer-guide.md`.
- The value shown beside a slider is the **resolved** number, not the raw
  input value.
- The sheet is a **sheet**, not a modal: it must not trap focus, and the
  scene stays interactive. Its `aria-expanded` on the toggle stays in sync.
- The sheet is a dark instrument in both chrome themes — it belongs to the
  scene, not to the page.
- Group headings use `--type-label` uppercase; the header uses `--type-h3`.
- Motion: the sheet eases in over `--dur-base` with `--ease-out`, and the
  utility cluster slides to make room — as it does today.
- `prefers-reduced-motion` disables the slide.

## Deliverables

- A self-contained HTML prototype of the sheet, with the controls actually
  driving a scene where possible, and the code block genuinely generated
  from the current values.
- A hand-over note: the control-to-option map, the resolved-value units you
  chose, and the mobile behaviour.

## Acceptance criteria

- Every control corresponds to a documented public option, and the
  generated snippet would work if pasted into a fresh app.
- The sheet is fully keyboard operable, with a visible focus ring and a
  logical group order.
- The sheet and the scene visibly agree — changing a colour changes the
  scene, and the swatch shows the new value.
- The mobile sheet keeps every control reachable and the code block
  collapsed by default.
- The sheet does not obscure the route in the scene behind it at any
  breakpoint.
