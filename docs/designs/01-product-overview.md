# Design brief: RouteDots product overview

Design a polished, responsive product overview page for **RouteDots**, an embeddable JavaScript library that renders flight routes on an interactive dot globe or flat world map. Follow the shared visual and interaction system in `docs/designs/design.md`.

## Purpose

Help a frontend developer understand what RouteDots does within moments, see the experience it creates, and find a clear path to try the playground or start integrating the package. Make the actual route visualization the hero, not a stock airplane or generic travel photograph.

## Page direction

Create a confident editorial landing experience with a light neutral canvas, restrained teal actions, and vivid outbound/return route accents. Include a compact top navigation with RouteDots branding and links to Overview, Playground, Docs, and Examples. Mark Overview as active and make the primary actions visually obvious.

The hero should pair a concise headline such as **“See the journey before the booking.”** with short supporting copy that correctly describes RouteDots as a visualization library. Include a large, high-quality globe scene showing a plausible city-to-city route, endpoint labels, a moving plane cue, and a clear outbound/return legend. Place a compact, legible route-search demonstration near the visualization: origin and destination, swap control, one-way/round-trip choice, and a prominent “Explore the playground” action. Treat it as a product demo, not a booking form; do not imply ticket search or inventory.

Below the hero, create a deliberate content sequence that explains the value through visual storytelling:

- Curved great-circle routes and readable outbound/return separation.
- Globe and flat-map rendering, including graceful flat fallback without WebGL.
- Live customization of palette, plane icon, labels, markers, route dashes, and camera.
- A small integration preview with a practical install command and compact real API snippet.
- A closing call to action to open the playground or read the documentation.

Use concise sections, descriptive headings, small product UI details, and well-composed map visuals. Avoid generic feature-card grids when an annotated visualization or short technical example communicates the capability better. Include footer navigation and repository/documentation destinations without inventing pages or product services.

## Responsive and interaction notes

On desktop, keep the globe and hero copy balanced with enough breathing room for the route. On mobile, stack copy before the visualization and keep route labels legible without covering key map content. Include visible focus states, keyboard-accessible navigation and controls, and a reduced-motion-friendly presentation. All claims and examples must match the existing RouteDots library; no account, checkout, pricing, live flight tracking, or booking features.
