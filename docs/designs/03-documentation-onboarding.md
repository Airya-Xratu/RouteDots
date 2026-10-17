# Design brief: RouteDots documentation onboarding

Design the developer documentation entry experience for RouteDots, focused on helping a developer install the package and render a first route. Follow `docs/designs/design.md` and use the same navigation and visual language as the product overview and playground.

## Purpose

Turn a first visit into a successful first implementation. Keep explanations direct and ordered: what the package does, how to install it, how to mount a renderer, how to set a route, and where to go next.

## Documentation structure

Create a documentation shell with a compact header, RouteDots branding, and navigation to Overview, Playground, Docs, and Examples. On wide screens, use a persistent left navigation with clear active state, a comfortable central article column, and a small contextual table of contents only if it improves orientation. On narrow screens, collapse the navigation accessibly and keep the article readable.

The onboarding article should include:

- A clear page title and a short statement of the library's purpose.
- An installation block for `npm install routedots three`, with a visible copy action and success feedback.
- A short setup sequence using a container element and `new RouteDots(...)`.
- A practical `setRoute` example using city codes and a round-trip option.
- A compact preview or illustration of the resulting globe and route, paired with a route description for nonvisual access.
- A small section explaining that the library can render a globe or flat map and includes a graceful flat fallback where WebGL is unavailable.
- Links to the API reference, playground, examples, and relevant developer guide.

Keep the examples faithful to the real public API. Use short code blocks with language labels, syntax highlighting, copy feedback, and safe horizontal overflow. Distinguish inline code from prose. Avoid presenting RouteDots as a booking tool, live flight-data service, or map-tile provider.

## Tone and states

Use a knowledgeable, encouraging voice suitable for frontend developers. Explain why a step matters, then show the code. Include a visible but unobtrusive navigation state, code-copy feedback, and a helpful not-found or unavailable-example treatment where needed. Use sentence-case headings and avoid excessive promotional language.

## Accessibility and responsive notes

Use semantic heading order, keyboard navigation, visible focus, properly named buttons, and accessible copy feedback. Keep body text in a readable measure and ensure code blocks, tables, and navigation work on small screens. Avoid making the route preview the sole source of information; include a textual summary of the example.
