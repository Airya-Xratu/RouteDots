# Brief 09 — The supporting bands and the footer

**Goal:** design the marketing surface beneath the hero — the feature grid,
the integration snippet, the trust strip and the footer — so the page reads
as one product from the first pixel to the last.

---

## Context

`examples/showcase/index.html` ends with three bands: a "Why RouteDots"
feature grid of six items (a 2px top rule, a title, a description), an
"Integrate in two minutes" section with a dark code block, and a footer with
a top rule and muted text.

They are the least designed part of the page, and they are the part a
developer actually reads. The copy currently leans on emoji in feature
titles (`🌍`, `➰`, `⇄`, `✈️`, `🎥`, `📍`) and the code block is a static
`<pre>` with no affordances.

## Read first

- `docs/designs/design.md` — §2 (principles), §5.2 (the container grid and
  section rhythm), §7 (iconography and the emoji ban), §10 (the code block
  and feature card components), §13 (voice and copy), §15 (anti-patterns).
- `docs/designs/prompts/03-component-library.md` — the feature card, the
  code block, the nav, the footer.
- `docs/developer-guide.md` — the API the integration snippet must be
  correct for.
- `README.md` — the installation and quick-start flow the section mirrors.

---

## What to design

**The feature band.** The grid of capabilities, rebuilt as a component
band. Decide and document:

- The number of columns at 1080px and how they collapse (the current rule
  is `repeat(auto-fit, minmax(220px, 1fr))`).
- The rhythm between the section heading, the lead line and the grid.
- The feature card itself — the 2px top rule, the title, the description —
  and whether an icon belongs above the title. If it does, it is an inline
  SVG on the 24px grid, never an emoji.
- The microcopy for each capability, rewritten per `design.md` §13: concrete,
  short, no superlatives, and the actual behaviour of the library (a real
  sphere, a lifted great circle, two separated legs, a plane that repeats the
  outbound arc, camera framing, endpoint pins, one dependency, offline data).

**The integration band.** The "integrate in two minutes" section: the
headline, the one-line promise, the install command, the TypeScript snippet,
and the actions around the snippet — copy, and a link to the full guide.
The snippet must be the real quick start from the README, correct for the
current API, with the syntax highlighted using the code block component's
treatment. Show the copied state of the copy button.

**The trust strip.** A quiet band of facts — one dependency, no API keys, no
map tiles, offline data, MIT licence, bundle size — rendered as a row of
small labelled facts or chips, not as marketing claims. Design its
placement: above the feature band, beside the code snippet, or as its own
band.

**The footer.** The closing band: the brand lockup, a short line of copy, the
useful links (documentation, examples, changelog, licence, source), and the
small print. It should feel like the end of a considered product, not a
legal afterthought.

**The whole page, in sequence.** The bands assembled in reading order with
the correct vertical rhythm, so the page's pace can be judged as a whole:
hero → trust strip → features → integration → footer.

**The dark and light versions** of the bands, and their behaviour below
760px where the grid collapses to a single column and the code block scrolls
horizontally.

---

## Constraints

- No emoji anywhere. The feature titles use either no icon or an inline SVG
  from the icon inventory.
- One sans and one mono. No display font, no gradient fills, no image
  assets — the bands are typographic.
- The container is 1080px with 32px gutters; the section rhythm comes from
  the spacing scale.
- Feature titles are `--type-h3`, descriptions are `--type-sm` in
  `--rd-ink-muted`; the section headings are `--type-h2`.
- The code block is the component from brief 03: `--rd-panel-field`
  background, 14px radius, mono at 13px, a copy button that confirms.
- The copy in the code block is the **real** API from
  `docs/developer-guide.md` — `new RouteDots(el, { theme: 'light' })`,
  `rd.setRoute('LHR', 'DXB', { roundTrip: true })` — not pseudocode.
- The footer is quiet: muted text, a hairline, no badge walls.
- Both themes, and the collapsed single-column layout at 760px.

## Deliverables

- A self-contained HTML prototype of the bands, in page order, that can be
  read as the lower half of a real page.
- A hand-over note: the rewritten microcopy for every capability, the
  placement decision for the trust strip, and the final reading order.

## Acceptance criteria

- The bands use the container grid and the spacing scale exactly; no
  off-scale gaps.
- No emoji; any icon is an inline SVG on the 24px grid.
- The code snippet is correct against the current API and would run.
- The copy is rewritten — short, concrete, no superlatives.
- The bands look like the same product as the hero, at a glance, in both
  themes.
