# Brief 05 — The search experience

**Goal:** design the flight-search form in depth — the component a visitor
uses to tell RouteDots which route to draw.

The form is the library's only real input. Everything it does should feel
like asking a departure board, not filling in a web form.

---

## Context

Today the form is a set of native `<select>` and `<input type="date">`
elements inside the dark panel, with a swap button between the two city
fields, a one-way / round-trip segmented control, a pill CTA and a status
line. It works. It is also unstyled by any real design system, it has no
suggestion behaviour, and its states are undefined.

This brief designs the form as a **complete interaction**, from the first
keystroke to the drawn route.

## Read first

- `docs/designs/design.md` — §10.1 (panel anatomy), §11 (states and
  feedback), §13 (voice and copy), §12 (accessibility).
- `docs/designs/prompts/03-component-library.md` — the field, the segmented
  control, the swap button, the CTA, the status line, the chip.
- `src/cities.ts` — the 31 bundled cities with their IATA codes, names and
  countries. The suggestion list is built from this data.
- `examples/showcase/index.html` — the current form and its behaviour.

---

## What to design

**The form at rest.** The panel's search area with the two airport fields,
the swap button, the departure date, the trip-type segment, the CTA and the
status line — in the state a first-time visitor sees: empty fields, the
segment on "Round trip", the CTA enabled but with no selection yet, and the
status line showing a short, useful prompt rather than being blank.

**The city field with suggestions.** A focused From field with a dropdown
list of matching cities — name, country and IATA code per row, keyboard
navigable, with the current selection highlighted. Show the states: no
matches, one match, many matches, and a match on the country name rather
than the city name. Suggestions are drawn from the bundled city list and
use the chip and row patterns from the component library.

**The filled state.** Both fields filled, the values shown as "City
(Country) · CODE", the swap button now meaningful, and the panel showing
the resolved trip summary: the passenger count, the trip type, and the
departure date.

**The error state.** The user picks the same city twice, or an unknown
airport. The offending field carries the danger border, a message is
rendered with an alert icon, and it is wired to the field through
`aria-describedby`. The status line under the CTA mirrors it.

**The loading and success states.** The CTA becomes a busy state while the
route is being drawn and the camera pans; on success the status line
confirms the route in words ("Round trip drawn — London to Dubai") and the
scene responds. Show the transition from loading to success.

**The trip-type behaviour.** How "One way" and "Round trip" change the
panel: the return date appearing, the return leg's colour entering the
chrome as a chip, and the panel's vertical rhythm shifting without a jump.

**The compact and small-screen forms.** The form inside the mobile bottom
sheet, where the field order and the target sizes change, and the date and
trip-type fields sit side by side without cramping.

**The microcopy.** The exact strings for: the empty prompt, the no-match
message, the same-city error, the unknown-airport error, the loading label,
and the success confirmation. Written per `design.md` §13 — specific, short,
and actionable.

---

## Constraints

- The form is **inside the dark instrument panel**. Its surfaces, labels and
  text come from the panel tokens, not the page tokens.
- Every message is linked to its field programmatically, and the status
  line is `role="status"` with `aria-live="polite"`.
- The panel must not reflow when the status line appears — its height is
  reserved.
- Touch targets are at least 44px on coarse pointers, even though the
  controls are visually smaller.
- The suggestion list must be operable with the keyboard alone, with the
  active option announced.
- Use the bundled city data as the source of truth for names, countries and
  codes.
- No emoji. The aircraft and calendar affordances are inline SVG.

## Deliverables

- A self-contained HTML prototype of the form, interactive where it helps:
  the suggestions, the swap, the trip-type toggle and the validation should
  actually work.
- A hand-over note: the microcopy strings, the validation rules and their
  order, and the keyboard interaction model.

## Acceptance criteria

- Every state listed above is reachable in the prototype and is visually
  distinct.
- The form is fully operable with the keyboard, and the focus ring is
  visible at every stop.
- The error message is announced correctly and is associated with its field.
- The panel height does not change when the status line appears.
- The small-screen form keeps the CTA reachable and the labels legible.
