# Brief 03 — The component library

**Goal:** design every piece of chrome RouteDots needs as a coherent,
state-complete component set — the library the rest of the UI is assembled
from.

This is the brief that pays off the most: once the components exist, every
surface after this is composition, not invention.

---

## Context

The library draws the map. Everything around it — nav, panels, fields,
buttons, chips, code blocks, itinerary rows — belongs to the host app and is
currently hand-rolled and inconsistent in `examples/showcase/index.html`.

The component inventory is specified in `design.md` §10, the state rules in
§11, and the accessibility rules in §12. This brief turns that inventory
into rendered components with every state drawn.

## Read first

- `docs/designs/design.md` — §10 (components), §11 (states), §12
  (accessibility), §4 (type), §6 (shape and elevation), §7 (iconography).
- `docs/designs/prompts/01-foundations.md` — the token set you are using.
- `examples/showcase/index.html` — the current implementations to improve on.
- `docs/developer-guide.md` — the option names, so the components speak the
  library's language.

---

## What to design

A **component sheet**: every component rendered as a specimen with its
variants, and with each state drawn side by side.

**Controls**

- **Primary button** — the pill CTA. Default, hover, active, focus-visible,
  disabled, loading (label replaced by a 14px spinner, width preserved).
- **Secondary / ghost button** — used inside the dark panel.
- **Icon button** — 32px circle with a hairline border; the studio toggle
  and the theme toggle are its use cases. Default, hover, active,
  focus-visible, disabled, and `aria-pressed` for the theme toggle.
- **Field** — label + control, as a unit. The label is uppercase
  `--type-label` in `--rd-ink-faint`; the control is a recessed
  `--rd-panel-field` input with a 1px `--rd-panel-edge` border and a 10px
  radius. States: default, hover, focus-visible, filled, invalid (danger
  border + linked message), disabled, and the native select's chevron
  replaced by an inline SVG.
- **Segmented control** — one-way / round-trip. Single-select, implemented
  as a `role="tablist"` with `aria-selected`. Default, hover, selected,
  focus-visible, and the keyboard behaviour (arrow keys move between the
  segments).
- **Swap button** — the 30px circle that sits between the two airport
  fields, with its two-arrow SVG. Default, hover, active, focus-visible.
- **Slider** — the studio's range control. Default, hover, focus-visible,
  active, and the value readout rendered in tabular numerals to the right.
  The accent of the slider track is `--rd-accent`.
- **Colour swatch input** — the 44×26 rounded swatch used to pick a palette
  colour, with a focus-visible ring that does not fight the swatch.
- **Checkbox / toggle** — for boolean studio options, styled to match the
  slider.

**Display**

- **Status line** — the `role="status"` line under the CTA. Neutral, error
  and success variants, with the reserved height demonstrated.
- **Chip / badge** — the pill used for "Interactive demo", round-trip labels,
  and the legend swatches. Neutral, accent, and return-coloured variants.
- **Code block** — the dark surface with the mono stack, 14px radius, a
  copy-to-clipboard affordance, and a highlighted-token treatment for the
  generated options snippet.
- **Itinerary row** — the route-result row: the plane glyph, the airport
  codes, the city names, the times, the duration. Outbound and return
  variants, with the return row using the return colour.
- **Feature card** — the 2px top rule, title and description pattern used in
  the marketing band.
- **Nav bar + logo lockup** — over the scene (transparent) and over a
  surface (solid), plus the mobile variant with a collapsed link list.
- **Footer** — the 1px top rule, muted text, the two-column arrangement.
- **Legend** — the component from brief 02, rebuilt as a chrome component so
  it can be dropped into any surface.
- **Panel** — the dark instrument panel shell, with its three inner surface
  levels (panel, field, raised) shown as a nesting diagram.

**The sheet itself**

- Group the specimens by category with `--type-h2` headings.
- Show each component's variants in a row, each state's states in a row, and
  put the spec (size, radius, padding, token names) in a small muted
  annotation under each specimen.
- Provide a live "theme" switch that flips the whole sheet between the
  light and dark chrome, and a "focus" toggle that applies
  `:focus-visible` to every focusable specimen at once, so the focus rings
  can be reviewed in one pass.

---

## Constraints

- Every component must honour the radius scale, the spacing scale and the
  type ramp from `design.md`.
- Every interactive component must show a **visible focus ring** and must
  never rely on hover alone.
- The dark instrument panel components are the reference for "dark on light";
  the same components must also work when the whole page is dark.
- Icons are inline SVG on the 24px grid, 1.5px stroke, `currentColor`.
- No emoji, no webfont, no icon font, no network requests.
- Keep the sheet itself restrained: neutral canvas, hairline separators,
  tabular metadata. It is an engineering document, not a portfolio piece.

## Deliverables

- A self-contained HTML component sheet.
- A hand-over note: the component list you built, the variants you chose to
  add beyond the inventory, and the accessibility decisions you made
  (keyboard behaviour, ARIA roles, focus order).

## Acceptance criteria

- Every component in `design.md` §10 is present.
- Every interactive component shows hover, focus-visible and disabled.
- The sheet is navigable with the keyboard alone, and the focus ring is
  visible on every stop.
- Flipping the theme flips every specimen, including the panel and the code
  block.
- The sheet is usable at 1280px and does not break at 480px.
