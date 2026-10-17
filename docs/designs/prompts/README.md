# Design briefs — RouteDots UI

Each file in this folder is a **self-contained brief** for the AI designer.
Work through them **in order** — the later briefs build on the decisions made
in the earlier ones.

```
docs/designs/
├── design.md          ← read this first, always
└── prompts/
    ├── README.md      ← you are here
    ├── 01-foundations.md
    ├── 02-scene-grammar.md
    ├── 03-component-library.md
    ├── 04-hero-surface.md
    ├── 05-search-experience.md
    ├── 06-studio-panel.md
    ├── 07-itinerary-route-summary.md
    ├── 08-flat-and-responsive.md
    └── 09-marketing-and-footer.md
```

## The order, and why

| Brief                   | Establishes                                               | Feeds                        |
| ----------------------- | --------------------------------------------------------- | ---------------------------- |
| 01 · Foundations        | colour, type, space, radius, elevation, motion, icons     | everything                   |
| 02 · Scene grammar      | how the map itself reads — arcs, endpoints, ripples, pins | the legend, the itinerary    |
| 03 · Component library  | every chrome component and its states                     | every surface that uses them |
| 04 · Hero surface       | the first screen a visitor sees                           | 05, 06, 08                   |
| 05 · Search experience  | the flight-search form in depth                           | 04, 07                       |
| 06 · Studio panel       | the live customisation sheet                              | 04, 08                       |
| 07 · Itinerary summary  | the route result — rows, stats, legend                    | 05, 08                       |
| 08 · Flat & responsive  | the no-WebGL world and the small-screen layouts           | 04, 06, 07                   |
| 09 · Marketing & footer | the supporting marketing bands                            | —                            |

## Rules of engagement

1. **Read `../design.md` first.** Every brief assumes it. If a brief and
   `design.md` disagree, `design.md` wins and you flag the conflict in your
   hand-over notes.
2. **One brief at a time.** Each brief is a complete, self-contained unit of
   work. Finish it, hand it over, then pick up the next.
3. **Tokens only.** No literal hex values, no off-scale radii, no invented
   durations. If something is missing, extend the token set and say so.
4. **Ship real HTML/CSS.** The repo is plain HTML + inline CSS + vanilla JS —
   no Tailwind, no React, no icon font, no webfont, no network requests.
   A prototype must open in a browser and look right with no build step.
5. **Keep the library honest.** Any mock of the map must use the library's
   real option names (`colors.outbound`, `route.outbound.angle`,
   `airports.source`, …) and the real values from `src/theme.ts`. The
   designer is documenting the product, not inventing a fantasy API.
6. **Both themes.** Every surface is delivered in light and dark chrome, and
   the map is shown in its light and dark scene palettes.
7. **State the assumption.** If a brief leaves something open, decide, build
   it, and list the decision in the hand-over notes rather than asking.
8. **Hand over with evidence.** Each deliverable ships with a short note
   covering: what you changed, the tokens you introduced, the states you
   covered, and anything you could not resolve.

## What "done" looks like for every brief

- A self-contained HTML file (plus any CSS/JS it needs) that renders with no
  console errors.
- The file honours the acceptance checklist in `design.md` §14.
- The file is annotated where a decision was non-obvious — a short comment
  above the rule, not a wall of prose.
- A hand-over note listing the tokens added and the open questions.
