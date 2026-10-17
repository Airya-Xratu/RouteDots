# Design brief: RouteDots examples gallery

Design an examples gallery for developers who want to see how RouteDots can fit into different interfaces. Follow `docs/designs/design.md` and maintain the same product navigation, typography, spacing, and route color semantics.

## Purpose

Make the visual possibilities and integration patterns easy to compare, then lead each developer to a useful code example. Examples should demonstrate RouteDots as an embeddable visualization library, not as a travel booking service.

## Gallery experience

Create an examples landing page with a concise introduction and a useful filter or category treatment. Feature examples grounded in supported library capabilities, such as:

- An airline-style route hero with a globe and search-form demonstration.
- A dark-theme route visualization.
- A flat-map experience and a graceful no-WebGL fallback.
- A round-trip route with separately styled outbound and return arcs.
- A customization showcase for colors, plane icon, labels, city ripples, route dashes, and the optional 3D camera on the flat map.

Present each example with a strong visual preview, a short explanation, relevant tags, and a clear “View example” or “Open playground” action. Use previews that show actual route behavior and map form; avoid generic photos and invented product states. A featured example may occupy more space than supporting entries, but keep the page focused on exploring actual implementations.

For an example detail presentation, use a large live-preview area, a compact summary of what it demonstrates, relevant controls or a link to the playground, and a practical copyable code sample. Include a clear path back to the gallery, documentation, and API reference. Do not introduce user accounts, purchases, live flight tracking, or other unsupported services.

## Visual and interaction details

Use clean, editorial cards with restrained borders and subtle depth. Keep previews large enough to understand geography and route direction. Use outbound/return labels as well as semantic colors. Filters and category controls must show selected state and remain keyboard accessible. Add copy feedback to code samples and maintain consistent empty and no-results states if filters are included.

## Responsive and accessibility notes

Use a flexible preview grid that rearranges cleanly on tablet and mobile. Keep example titles and actions reachable, and never crop important endpoints or route context from map previews. Provide text summaries for visual examples, visible keyboard focus, semantic headings, accessible filter labels, and reduced-motion-friendly previews.
