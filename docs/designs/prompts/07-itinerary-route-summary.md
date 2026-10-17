# Brief 07 — The itinerary and route summary

**Goal:** design what the visitor sees **after** they pick a route: the
journey spelled out in words and numbers, next to the map that drew it.

The scene shows the shape of the trip. The itinerary shows what it means.
They must agree.

---

## Context

RouteDots draws the route and pans the camera to frame it. That is a
beautiful, but a purely visual, answer. A traveller also wants to know:
when does it leave, how long is it, how far, which way, and what time is it
there.

The itinerary is the textual companion to the scene, and the place where the
scene's grammar (§9 of the design system) is translated into plain language —
including the outbound/return distinction, which must survive the
translation.

## Read first

- `docs/designs/design.md` — §9 (the scene grammar: arcs, endpoints, the
  three separating cues), §3.4 (the accent bridge), §10 (components),
  §13 (voice and copy).
- `docs/designs/prompts/02-scene-grammar.md` — the legend and the
  outbound/return treatment you designed there.
- `docs/designs/prompts/03-component-library.md` — the itinerary row, the
  chip, the legend component.
- `docs/developer-guide.md` — `setRoute`, `getRoute()` and the route events
  (`route:drawn`, `route:invalid`, `route:cleared`).
- `src/cities.ts` — the city data, and `src/core/greatCircle.ts` for the
  distance maths the library already computes.

---

## What to design

**The summary card.** A panel beside or below the scene, holding:

- The **route headline** — "London → Dubai" in `--type-h3`, with the trip
  type as a chip beneath it.
- The **itinerary rows** — one per leg. Each row carries the plane glyph,
  the departure and arrival codes with their city names, the local times,
  the duration, and the distance. The outbound row uses the outbound colour;
  the return row uses the return colour, and carries the same three cues the
  scene uses — colour, the row's own dash sample, and its label.
- The **stats strip** — total distance, total duration, and the number of
  stops, in tabular numerals so they align in a column.
- The **legend** — the component from brief 02, using the real dash samples,
  so the map and the list are visibly the same system.
- A **"share this route"** action — a secondary button with the copy-link
  affordance, since the route is describable as two codes and a date.

**The relationship to the scene.** The card shown alongside a live scene
showing the same route, so the reader can see that the outbound row in the
list is the lower arc in the map and the return row is the lifted one. Show
the moment a different leg is hovered or focused in the list — the
corresponding arc in the scene gets emphasis, and the others recede. That
is the point of the card.

**The one-way variant.** The same card without a return row, without the
return chip, and without a legend entry for the return leg. It must not look
like a half-filled two-legged form.

**The invalid and cleared states.** An invalid pair produces an inline
message in the card's place, not an empty card. A cleared route leaves the
card showing the empty state with a short prompt.

**The small-screen version.** The card becomes a sheet below the scene, and
the rows stack: the times and the codes stay on one line, the details wrap
underneath.

**The microcopy.** The exact strings for the route headline, the trip-type
chip, the duration format, the distance format, the empty state, the invalid
state, and the share confirmation. Specific numbers, no filler — per
`design.md` §13.

---

## Constraints

- The card is a **chrome surface** — it uses the page tokens, not the panel
  tokens — so it must read as a document, not as another instrument.
- The outbound/return distinction must be carried by colour **and** a dash
  sample **and** a text label. Never colour alone.
- Times are shown in the **local** time of each airport, with the offset
  made explicit, because "arrives 6:00" is ambiguous otherwise.
- Durations and distances use tabular numerals and a single unit format
  throughout.
- The legend's line samples reproduce the real dash patterns.
- The card must not compete with the scene: no heavy shadow, no saturated
  fill, a hairline border.
- The empty and invalid states have reserved heights, so nothing jumps.

## Deliverables

- A self-contained HTML prototype of the card, with realistic sample data
  drawn from the bundled cities, and the hover/focus linkage to the scene
  demonstrated with the real library where possible.
- A hand-over note: the field formats, the microcopy strings, and how the
  list-to-scene linkage is triggered.

## Acceptance criteria

- The card, the legend and the scene agree on which leg is outbound and
  which is return.
- Every number in the prototype is realistic and internally consistent
  (distance, duration and time zones).
- The one-way variant is a deliberate layout, not a missing half.
- The invalid state is specific and actionable.
- The list-to-scene emphasis works with the keyboard, not only with a mouse.
