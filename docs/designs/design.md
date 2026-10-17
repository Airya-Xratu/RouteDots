# RouteDots Design System

A practical visual and interaction foundation for redesigning the RouteDots product website, interactive playground, and developer documentation. Treat this file as the shared source of truth for every design brief in this directory.

## Product and audience

**RouteDots** is an embeddable JavaScript library for visualizing flight journeys on an interactive globe or flat map. It draws curved great-circle routes, separates outbound and return legs, animates a plane along the outbound route, labels endpoints, and offers a flat fallback when WebGL is unavailable. Its palette, map mode, markers, labels, route curves, dashes, plane icon, and camera can be customized live.

The product serves frontend developers evaluating or integrating the library, as well as designers and product teams prototyping travel experiences. The interface should feel immediately visual to newcomers while staying precise and credible to technical users.

## Design direction

**Editorial cartography meets a polished developer tool.** Make the globe and the journey the visual signature. Surround them with a calm, well-structured interface that feels crafted and useful rather than like a generic SaaS dashboard.

- Lead with a memorable route visualization, not abstract gradients or stock travel photography.
- Pair expressive map imagery with restrained, legible UI and code examples.
- Balance travel warmth and exploration with engineering clarity.
- Use whitespace to create hierarchy; reserve saturated color for routes, selected controls, and meaningful status.
- Keep all product claims grounded in the actual RouteDots capabilities described here and in the repository.

## Color system

Use semantic roles and maintain strong contrast. The palette below is the default light presentation; dark surfaces are appropriate for code, map overlays, and an optional dark appearance.

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | `#F7F8FA` | Main page background |
| `surface` | `#FFFFFF` | Cards, documentation content, form fields |
| `surface-muted` | `#F0F2F5` | Secondary panels and subtle grouped areas |
| `ink` | `#171B22` | Primary text and headings |
| `ink-muted` | `#606A78` | Supporting copy, labels, metadata |
| `ink-subtle` | `#858E9B` | Tertiary annotations; never use for essential copy |
| `line` | `#E2E6EB` | Borders, separators, control outlines |
| `accent` | `#176B63` | Primary actions, focus, links, active state |
| `accent-hover` | `#10564F` | Hover state for primary actions |
| `accent-soft` | `#E4F2EF` | Selected chips, quiet callouts |
| `route-outbound` | `#F07845` | Outbound route emphasis |
| `route-return` | `#7668D8` | Return route emphasis |
| `success` | `#287A50` | Positive confirmation |
| `warning` | `#A96316` | Caution and non-blocking notices |
| `danger` | `#B83A3A` | Errors and destructive actions |
| `night` | `#111923` | Dark code/map surfaces |
| `night-raised` | `#1B2632` | Raised elements on dark surfaces |
| `night-line` | `#303C49` | Dark-mode borders |

Use the outbound/return colors consistently in legends, route controls, and code examples. Do not depend on color alone to distinguish the route legs: also use labels, line styles, or directional cues. Globe and map colors may be tuned for legibility while preserving the semantic colors.

## Typography

- **UI and body:** `Inter`, then system sans-serif. Use a neutral, highly legible sans-serif.
- **Code:** `ui-monospace`, `SFMono-Regular`, `Menlo`, `monospace`.
- Headings use a compact, confident scale with slightly negative tracking; body text stays open and readable.
- Suggested scale: display `48–64px`, page title `36–44px`, section title `24–30px`, card title `16–20px`, body `15–17px`, UI label `12–14px`, code `13–14px`.
- Suggested line heights: display 1.05–1.12, headings 1.15–1.3, body 1.5–1.7, code 1.55–1.7.
- Use sentence case. Reserve uppercase, tracked labels for short eyebrow text or compact metadata only.

## Layout and spacing

- Use a responsive centered content frame, with a comfortable maximum width around `1200px` for marketing pages and `1440px` for full-width interactive workspaces.
- Use a 12-column desktop grid when useful. Keep readable text columns near `65–75ch`.
- Base spacing on a 4px unit. Common gaps: `8`, `12`, `16`, `24`, `32`, `48`, `64`, and `96px`.
- Use generous vertical rhythm between major sections and tighter spacing inside control groups.
- Cards use `16–20px` corner radii, fine borders, and restrained shadows. Controls and chips use `8–12px` radii. Avoid excessive pill shapes; reserve full rounding for tags and compact segmented controls.
- Align documentation navigation, article content, and table of contents consistently. Keep the current section visible in long technical pages.

## Signature visual language

- Use a detailed, high-contrast globe or flat world map as the distinctive hero and playground asset. Prefer RouteDots' real visual output or a faithful custom rendering over generic map tiles.
- Keep route arcs smooth and lifted, with a clear outbound/return distinction. Use endpoint pins with city labels and a small moving aircraft where motion is demonstrated.
- Give map scenes sufficient negative space for overlays; avoid placing essential text over busy geography.
- Treat control panels as quiet, tactile instrument panels: clear labels, visible values, sensible grouping, and a strong relationship to the map they affect.
- Use subtle latitude/longitude, coordinate, and flight-plan motifs sparingly. Do not turn every surface into a map grid or pseudo-aviation dashboard.
- Code examples should be real, syntax-highlighted, and copyable. Prefer short, practical examples that match the documented API.

## Components and states

### Navigation
Provide a compact brand mark and clear destinations such as **Overview**, **Playground**, **Docs**, and **Examples**. Show the active destination clearly. On narrow viewports, collapse navigation behind an accessible menu.

### Buttons and links
- Primary action: solid `accent`, white text, strong focus ring, concise verb-first label.
- Secondary action: white or transparent surface with a visible line border.
- Tertiary action: text link with a clear hover and focus state.
- Include default, hover, active, focus-visible, disabled, and loading treatments where relevant. Avoid icon-only actions without accessible names.

### Inputs and selectors
Use persistent labels, helpful examples, and clear selected values. Keep source and destination visually paired with a swap action between them. Provide visible focus, error, and disabled states. Use native controls where that improves keyboard and assistive-technology behavior.

### Map, route, and flight controls
- Keep the map the main canvas. Put route search and mode controls in an anchored, responsive panel rather than scattering them over the map.
- Show source and destination, one-way/round-trip state, and the selected map mode explicitly.
- Make route actions reversible and provide clear feedback for invalid city pairs, loading, cleared route, and successful route display.
- In the customization experience, group options by purpose: world/surface, colors, route and dashes, plane, cities and labels, and camera. Show live values and an example of the corresponding configuration.
- The flat map is a first-class option, not an error state. Indicate the active rendering mode without implying that one mode is broken.

### Documentation and code
Use a persistent left navigation on wide screens, a focused article column, and a contextual table of contents only when useful. Style inline code distinctly from prose. Code blocks need language labels, copy feedback, and horizontal overflow handling. Tables must remain readable on small screens. Explain API behavior with consistent terminology: **route**, **outbound**, **return**, **globe**, **flat map**, **plane**, **endpoint**, and **theme**.

### Feedback
Use concise status messages near the action that caused them. Error messages describe how to recover. Success feedback is brief and does not obscure the visualization. Provide empty, loading, error, and reduced-motion states where applicable.

## Motion and interaction

- Motion should reinforce geography and state change: a route draws on, the plane advances, a globe eases to frame the route, and controls update the visualization.
- Prefer short, smooth transitions (roughly `140–240ms`) for UI feedback. Camera and route animations may take longer when they communicate travel or framing.
- Honor `prefers-reduced-motion`; keep route and map meaning available when animation is reduced or disabled.
- Provide keyboard-operable controls and visible focus. Do not rely on drag, hover, or animation as the sole way to access information.
- Keep touch targets at least `44px` where practical. Support responsive rearrangement without hiding essential map controls or developer navigation.

## Accessibility and responsive behavior

- Target WCAG 2.2 AA contrast for text and controls. Check contrast independently on map overlays and both light and dark surfaces.
- Use semantic landmarks, correctly nested headings, associated form labels, keyboard navigation, focus management for menus/dialogs, and accessible names for icon buttons.
- Provide text equivalents for routes and map state, including origin, destination, route type, and rendering mode. Do not communicate state through color alone.
- At tablet widths, collapse secondary columns and keep the primary map or article prominent. On mobile, stack panels, make code blocks scroll safely, and keep key actions reachable without covering the route visualization.

## Content and voice

Write with an inviting, knowledgeable, developer-friendly voice. Be direct and specific. Explain the benefit before the implementation detail, then show the API or example. Prefer **“See the route before you build it”** and similarly concrete language over vague claims. Never imply that RouteDots books tickets, supplies live airline inventory, or fetches tile data: it is a visualization library with bundled geography and a public API.

## Consistency checklist

Before finalizing any designed experience, verify that it:

- Clearly identifies RouteDots as a flight-route visualization library.
- Uses the globe/route visual as a meaningful product element rather than decoration alone.
- Preserves the semantic outbound and return colors and labels.
- Uses the same typography, spacing, radii, controls, and navigation language as the other design briefs.
- Includes responsive, keyboard, focus, error, and reduced-motion considerations appropriate to the interface.
- Uses real capabilities and API names; does not invent booking, account, pricing, or live flight-tracking features.
