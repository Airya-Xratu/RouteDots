# Design brief: RouteDots interactive playground

Design the RouteDots playground, where developers can explore a route visualization and understand how configuration changes affect the result. Follow `docs/designs/design.md` and keep this experience visually consistent with the RouteDots product overview and documentation.

## Purpose

Make the library's visual output immediately explorable while exposing the useful customization options in a clear, practical control surface. The playground demonstrates the actual library; it is not an airline reservation product.

## Workspace composition

Use a calm, responsive application shell with RouteDots branding and navigation to Overview, Playground, Docs, and Examples. The workspace should prioritize a large interactive globe/map preview, with a clear route legend and city endpoint labels. Provide an obvious switch between automatic mode, globe, and flat map, and make the active mode apparent without suggesting the flat map is a failure state.

Pair the preview with a well-organized control panel. The controls should include:

- Origin and destination selectors, a swap action, and one-way/round-trip choice.
- World/surface selection and a theme appearance control.
- Color controls for the palette, with outbound and return independently recognizable.
- Route controls for outbound/return curves and flowing dash appearance.
- Plane icon/size controls, city markers and ripple settings, endpoint labels, and airport markers.
- Optional 3D camera settings when the flat map's 3D camera is enabled.

Group controls into collapsible or clearly separated sections. Show value labels beside sliders and use examples of units. Make related per-leg settings visually distinguishable. Keep the common route and rendering controls easy to find; advanced options can be progressively disclosed. Include a reset-to-default action and a live, syntax-highlighted code panel that reflects the selected configuration, with copy feedback. Use authentic RouteDots API names such as `setRoute`, `setOptions`, `setColors`, and `setWorld` where relevant; avoid inventing API options.

## Interaction states

Show a credible initial route, plus design guidance for route changes, invalid endpoint selection, loading or initialization, cleared route, copied code, reset, and WebGL-unavailable flat mode. Controls should update the preview live. Keep feedback close to the action and do not let the code sample or controls obscure the map.

## Responsive and accessibility notes

At wide widths, allow the map and controls to coexist without crowding. On tablet and mobile, let the preview lead and present controls in a stacked or drawer-style layout with a clear open/close state. Make all controls keyboard-operable with visible focus; provide text labels and values for sliders; use accessible names for icon-only actions. Preserve route meaning when motion is reduced and do not encode states only by color.
