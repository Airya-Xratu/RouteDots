# RouteDots — design docs

The design system and the briefs for redesigning RouteDots' user interface.

| File                                                                               | What it is                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`design.md`](./design.md)                                                         | **The design system.** Colour, type, space, shape, elevation, motion, iconography, the scene's visual grammar, components, states, accessibility, voice, and a copy-paste token block. Read this first. |
| [`prompts/README.md`](./prompts/README.md)                                         | How to run the briefs: the order, the rules of engagement, and what a finished brief looks like.                                                                                                        |
| [`prompts/01-foundations.md`](./prompts/01-foundations.md)                         | Colour, type, space, shape, elevation, motion and icon specimen.                                                                                                                                        |
| [`prompts/02-scene-grammar.md`](./prompts/02-scene-grammar.md)                     | How the map itself reads — arcs, endpoints, ripples, pins, legend.                                                                                                                                      |
| [`prompts/03-component-library.md`](./prompts/03-component-library.md)             | Every chrome component, with its states.                                                                                                                                                                |
| [`prompts/04-hero-surface.md`](./prompts/04-hero-surface.md)                       | The full-bleed hero and the chrome around it.                                                                                                                                                           |
| [`prompts/05-search-experience.md`](./prompts/05-search-experience.md)             | The flight-search form and its states.                                                                                                                                                                  |
| [`prompts/06-studio-panel.md`](./prompts/06-studio-panel.md)                       | The live customisation sheet.                                                                                                                                                                           |
| [`prompts/07-itinerary-route-summary.md`](./prompts/07-itinerary-route-summary.md) | The route result — rows, stats, legend.                                                                                                                                                                 |
| [`prompts/08-flat-and-responsive.md`](./prompts/08-flat-and-responsive.md)         | The flat world, the small screens, the edge states.                                                                                                                                                     |
| [`prompts/09-marketing-and-footer.md`](./prompts/09-marketing-and-footer.md)       | The supporting bands and the footer.                                                                                                                                                                    |

## The short version

1. An AI designer reads [`design.md`](./design.md) and picks up the brief
   it is working on.
2. The brief describes the surface to design, the tokens to use, the states
   to cover, and the deliverable to hand back.
3. The work comes back as a self-contained HTML prototype built from the
   tokens — no framework, no webfont, no external request.
4. The next brief inherits the decisions from the previous one.

## Why the split

The library's UI is not one screen — it is a **system** spread over a hero,
a form, a sheet, a result view, a fallback and a set of marketing bands.
Redesigning it in one pass produces a page; redesigning it system-first
produces a product. The briefs are ordered so the vocabulary (01), the
scene's grammar (02) and the components (03) exist before any surface is
composed (04–09).
