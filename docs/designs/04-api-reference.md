# Design brief: RouteDots API reference

Design an API reference experience for the RouteDots JavaScript library. Follow `docs/designs/design.md` and preserve the shared documentation shell, typography, spacing, controls, and color semantics.

## Purpose

Help developers quickly locate a constructor option or method, understand accepted values and defaults, and copy a correct example. Favor scanability and accuracy over decorative complexity.

## Information architecture

Provide a documentation header and a persistent left navigation on wide screens, with a clear active state. Organize the reference into compact, discoverable groups:

- Constructor and options.
- Route methods: `setRoute`, `getRoute`, and `clearRoute`.
- Theme and live styling: `setTheme`, `setColors`, `resetColors`, and `setOptions`.
- Rendering mode and view controls, including `setWorld` where documented.
- Events, route style, camera access, and disposal.
- Configuration areas for palette, route arcs/dashes, plane, cities, labels, airports, flat map, and 3D camera.

Use a strong article hierarchy and provide a small in-page contents list or sticky table of contents where useful. Include an obvious search affordance as a visual design element, but do not imply search behavior or API details that are not available in the actual implementation.

## API entry presentation

Give each method or option a consistent, compact structure: signature, concise purpose, parameter/property table, defaults or valid values when known, return value or event behavior when relevant, and a realistic example. Distinguish required and optional values clearly. Use real names and types from the RouteDots public API; do not invent methods, option keys, defaults, or events. When exact detail is uncertain, present an explicit placeholder for verified documentation rather than fabricating a value.

Code examples should be syntax-highlighted, labeled, copyable, and based on practical TypeScript or JavaScript snippets. Use semantic outbound/return colors in route examples. Add links between related concepts, such as a method entry to its relevant options and a route example to the playground.

## Visual and interaction details

Use subtle borders, quiet metadata, and dark code surfaces as described in the design system. Make signatures easy to scan and anchor links easy to target. Include hover and focus treatments for navigation and copy controls, copied confirmation, and a clear selected section. Render long tables responsively without making essential columns inaccessible.

## Accessibility and responsive notes

Support keyboard navigation for the side navigation, anchors, and controls. Use semantic tables with headers, visible focus rings, sufficient contrast, and descriptive labels. On mobile, turn the side navigation into an accessible disclosure and keep signatures/code readable with controlled horizontal scrolling.
