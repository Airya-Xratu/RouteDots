# RouteDots — Design System

> The single source of truth for how RouteDots looks, moves and talks.
> Read this file **before** any design brief. Every prompt in
> [`prompts/`](./prompts/README.md) assumes the rules below are already
> understood.

---

## 0. How to use this document

1. Read this file end to end once. It is the contract.
2. Work through the briefs in [`prompts/`](./prompts/README.md) in order —
   foundations first, then components, then surfaces. Each brief is
   self-contained and cites this document by section.
3. **Never invent a value.** Colours, sizes, radii, durations and easings
   come from the token tables here. If a brief needs something that is not
   tokenised, add a token to this document first, then use it.
4. Deliverables are **HTML/CSS prototypes** that drop into the host page.
   The repo has no CSS framework and no build step for styles — the showcase
   (`examples/showcase/index.html`) is hand-written HTML + inline CSS + vanilla
   JS. Prototypes must match that reality: no Tailwind, no React, no
   component library, no icon font, no external network requests.
5. When a brief is finished, re-read §14 (Acceptance checklist) and self-check
   before handing the work over.

### 0.1 Vocabulary

| Term         | Meaning                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| **Scene**    | The map itself — globe or flat world, and everything drawn on it.       |
| **Chrome**   | The host app's UI around the scene: nav, panels, fields, buttons, copy. |
| **Arc**      | A single route leg, drawn as a lifted great circle.                     |
| **Endpoint** | The source or destination airport marker.                               |
| **Pin**      | The labelled city badge attached to an endpoint.                        |

---

## 1. Product context

**RouteDots** is a zero-config JavaScript library that draws flight routes on
a map. It renders a **dot globe** (a real 3D sphere, WebGL/three.js) or a
**flat map** (SVG + canvas, no WebGL needed) and animates a route across it:
a lifted great-circle arc, a travelling airliner, a pulse on both airports, a
breathing ripple on every city, and a labelled pin at each end.

**What it is for:** the hero of an airline site, a travel blog header, a
booking flow's route preview. It is _one_ module inside a larger product, and
it is usually the biggest thing on the page.

**Who it is for:** a developer who wants the visual in minutes, and an airline
brand team who will immediately try to restyle it. Both must be able to make it
look expensive without touching a line of geometry code.

**The one-line brand:** _see the journey before you book it._

### 1.1 The design tension

The map is beautiful because it is restrained: one ocean, one landmass tone,
one hairline border, one arc colour, one travelling dot. Every pixel of chrome
the host app adds is a pixel of that restraint spent.

**Therefore: the chrome is an instrument panel, not a poster.** It is quiet,
dense, precise, and gets out of the way. The scene is the subject; the chrome
is the cockpit around it.

### 1.2 What "enhanced UI" means here

Not "more decoration". It means:

- the **existing** showcase surfaces (nav, hero copy, search panel, corner
  controls, customization studio, feature grid, code block, footer) are
  redesigned into one coherent system with real states, real focus handling
  and real responsive behaviour;
- the map's own design language (dots, arcs, rings, the dark instrument
  panel) is extracted into **tokens** so a host app can reproduce it;
- the emoji, ad-hoc hex values and one-off radii in the current showcase are
  replaced by the token system defined here;
- the **flat fallback** and the **mobile** layout are designed as first-class
  states, not as an afterthought.

---

## 2. Design principles

1. **The map is the message.** Chrome is recessive. If an element competes
   with the scene for attention, it loses. No glows, no gradients on chrome
   surfaces, no drop shadows on things that sit _on_ the map.
2. **One accent, spent deliberately.** The accent is the _same hue as the
   outbound arc_ (§3.4). It marks action, not decoration. Everything else is
   neutral.
3. **Geometry is the vocabulary.** Dots, rings, arcs, pills, and the arc of
   the globe itself. Prefer a circle to a rectangle badge, a hairline to a
   filled chip, a radius to a border. Nothing square, nothing pointy.
4. **Depth by layering, not by shadow soup.** The map is the bottom layer;
   chrome floats above it with a surface tint plus a soft, wide, low-opacity
   shadow. Never a hard, small, dark shadow.
5. **Motion is the product.** The route drawing itself is the hero animation.
   All chrome motion is short (≤ 240 ms), eased, and never loops
   decoratively. If the map is animating, the chrome holds still.
6. **Honest data.** A drawn route must correspond to a real pair of airports.
   A legend appears whenever colour carries meaning. Outbound and return are
   distinguishable by **colour _and_ dash pattern _and_ lift**, never colour
   alone.
7. **Degradation is a design state.** No-WebGL, reduced motion, small screen
   and keyboard-only are all designed surfaces, not accidents.
8. **Tokens, not literals.** `#232428` appearing in a stylesheet is a bug. It
   is `var(--rd-panel)`.
9. **The library stays stable.** Visual work may not change the public API,
   the option names, the palette key names, or the semantics of any number
   (see §9.3).

---

## 3. Colour system

Colour comes in two families, and they must never be confused:

- **Scene palette** — the 13 keys the library itself owns
  (`src/theme.ts` → `RouteDotsPalette`). These are passed to `colors:` and
  drive everything drawn on the map.
- **UI palette** — the chrome around the map. These are host-app CSS custom
  properties (`--rd-*`) and are _not_ passed to the library.

The bridge between them is the rule in §3.4.

### 3.1 Scene palette (library-owned)

| Token             | Role                                      | Light     | Dark      |
| ----------------- | ----------------------------------------- | --------- | --------- |
| `ocean`           | Ocean sphere / page background of the map | `#f2f5f9` | `#0e131c` |
| `countries`       | Country fills                             | `#c3c9d4` | `#2b3442` |
| `dots`            | Dot-lattice surface (`surface: 'dots'`)   | `#8b93a1` | `#5b6b82` |
| `borders`         | Country border hairlines                  | `#ffffff` | `#ffffff` |
| `cities`          | City dot + ripple ring                    | `#39414e` | `#d7e0ee` |
| `atmosphere`      | Globe rim glow (3D only)                  | `#93a7c4` | `#3d5f8f` |
| `outbound`        | Outbound arc                              | `#4f5b6b` | `#cfd8e6` |
| `return`          | Return arc                                | `#8a94a6` | `#7c8798` |
| `marker`          | Endpoint dot                              | `#23262e` | `#e2e8f0` |
| `ring`            | Endpoint pulse ring                       | `#23262e` | `#e2e8f0` |
| `plane`           | Airliner sprite                           | `#14161a` | `#e2e8f0` |
| `label`           | City-name text                            | `#141b26` | `#0b1220` |
| `labelBackground` | City-name pin pill                        | `#ffffff` | `#edf2f9` |

The legacy aliases `globe` / `background` (→ `ocean`) and `land` (→
`countries`) still work. Use the modern names in new code.

### 3.2 UI palette (host-owned)

Define these once on `:root` and override them inside a
`[data-theme="dark"]` scope. Every chrome surface references them; nothing
hardcodes a colour.

**Light chrome**

| Token                 | Value     | Use                                            |
| --------------------- | --------- | ---------------------------------------------- |
| `--rd-canvas`         | `#f7f8fa` | Page background behind the scene               |
| `--rd-surface`        | `#ffffff` | Cards, popovers, raised surfaces               |
| `--rd-surface-sunken` | `#eef0f4` | Wells, track backgrounds, disabled fills       |
| `--rd-panel`          | `#232428` | The dark instrument panel (search panel)       |
| `--rd-panel-edge`     | `#34353b` | Panel hairline                                 |
| `--rd-panel-field`    | `#17181c` | Inputs _inside_ the dark panel                 |
| `--rd-panel-raised`   | `#2f3037` | Active segment, secondary button in panel      |
| `--rd-ink`            | `#1c1e22` | Primary text                                   |
| `--rd-ink-muted`      | `#6b7280` | Secondary text                                 |
| `--rd-ink-faint`      | `#9aa0aa` | Labels, hints, placeholders (on dark surfaces) |
| `--rd-ink-inverse`    | `#e8e9ec` | Primary text on dark surfaces                  |
| `--rd-line`           | `#e5e7eb` | Default hairline                               |
| `--rd-line-strong`    | `#d3d7de` | Emphasised hairline, input borders             |
| `--rd-accent`         | `#0b6bcb` | Primary action                                 |
| `--rd-accent-ink`     | `#ffffff` | Text on the accent                             |
| `--rd-accent-soft`    | `#e8f1fc` | Selected row, active tab wash                  |
| `--rd-danger`         | `#fca5a5` | Error text (on dark surfaces)                  |
| `--rd-danger-strong`  | `#dc2626` | Error text (on light surfaces)                 |

**Dark chrome**

| Token                 | Value     | Notes                                               |
| --------------------- | --------- | --------------------------------------------------- |
| `--rd-canvas`         | `#0b0f16` | Matches the dark scene's ocean closely              |
| `--rd-surface`        | `#141a23` | Cards                                               |
| `--rd-surface-sunken` | `#0e131c` | Wells                                               |
| `--rd-panel`          | `#1b1f26` | The panel becomes a _shade_ of the page, not a hole |
| `--rd-panel-edge`     | `#2b313a` |                                                     |
| `--rd-panel-field`    | `#11151b` |                                                     |
| `--rd-panel-raised`   | `#262b33` |                                                     |
| `--rd-ink`            | `#e6eaf0` |                                                     |
| `--rd-ink-muted`      | `#98a2b3` |                                                     |
| `--rd-ink-faint`      | `#6b7280` |                                                     |
| `--rd-ink-inverse`    | `#e8e9ec` |                                                     |
| `--rd-line`           | `#232a33` |                                                     |
| `--rd-line-strong`    | `#333c47` |                                                     |
| `--rd-accent`         | `#7dd3fc` |                                                     |
| `--rd-accent-ink`     | `#04121c` | Text on the accent in dark mode                     |
| `--rd-accent-soft`    | `#12283a` |                                                     |
| `--rd-danger`         | `#fca5a5` |                                                     |
| `--rd-danger-strong`  | `#f87171` |                                                     |

**Verified contrast** (WCAG 2.1):

| Pair                                       | Ratio | Verdict        |
| ------------------------------------------ | ----- | -------------- |
| `--rd-ink` on `--rd-canvas`                | 15.7  | AAA            |
| `--rd-ink-muted` on `--rd-canvas`          | 4.55  | AA (body text) |
| `--rd-ink` on `--rd-surface`               | 16.7  | AAA            |
| `--rd-ink-muted` on `--rd-surface`         | 4.83  | AA (body text) |
| `--rd-ink-inverse` on `--rd-panel`         | 12.8  | AAA            |
| `--rd-ink-inverse` on `--rd-panel-field`   | 14.6  | AAA            |
| `--rd-ink-faint` on `--rd-panel`           | 5.89  | AA             |
| `--rd-accent` on `--rd-surface` (light)    | 5.28  | AA             |
| `--rd-accent` on `--rd-canvas` (light)     | 4.97  | AA             |
| `--rd-accent` on `--rd-panel-field` (dark) | 10.6  | AAA            |
| `--rd-danger` on `--rd-panel`              | 8.17  | AAA            |

### 3.3 Semantic status colours

`--rd-success` `#16a34a`, `--rd-warning` `#d97706`, `--rd-info` = `--rd-accent`,
`--rd-danger` as above. Status colours appear **only** in text, dots and
borders — never as a large fill, never on the map. On the map, a green or
red airport dot is a lie: the library has one `marker` colour.

### 3.4 The accent bridge (the most important colour rule)

> **The UI accent and the outbound arc are the same colour.**

When a host app sets `colors.outbound`, the CTA, the selected state and the
focus ring use that same hue. The scene is the brand; the chrome agrees with
it. Concretely:

- `--rd-accent` is derived from the app's `outbound` arc colour, or is
  hand-picked to match it (`#0b6bcb` light / `#7dd3fc` dark are the shipped
  defaults for the showcase, where the outbound arc is a blue-grey).
- The **return** arc colour is reserved for round-trip UI: the "Return" chip,
  the second leg in the itinerary, the return date field's active marker.
  It never becomes a button.
- Status colours never touch the scene palette.
- When the host changes `outbound` at runtime, the chrome follows. (In the
  showcase this is demonstrated live in the customization studio.)

### 3.5 Rules

- No pure `#000` or `#fff` in chrome (the map's `borders: '#ffffff'` is the
  one exception, and only because it is a hairline over a grey landmass).
- Never place body text directly on the map. Text over the scene needs a
  surface, a scrim, or the map's own pin pill.
- No colour gradients on chrome surfaces. The only gradient in the product is
  the globe's radial background and the atmosphere rim.
- Colour is never the only carrier of meaning: pair it with shape, dash,
  label, or position.

---

## 4. Typography

### 4.1 Families

| Role        | Stack                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI / labels | `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` — the library's own default, kept identical so chrome and map labels match |
| Code        | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`                                                                                                                    |
| Display     | The UI stack, tracked tighter. No webfont.                                                                                                                                    |

No webfonts, no icon fonts, no emoji in shipped UI (see §7.3).

### 4.2 Type ramp

| Token            | Size   | Line height | Weight | Tracking  | Use                                                  |
| ---------------- | ------ | ----------- | ------ | --------- | ---------------------------------------------------- |
| `--type-display` | 40px   | 1.12        | 700    | `-0.02em` | Hero headline (max)                                  |
| `--type-h1`      | 32px   | 1.15        | 700    | `-0.02em` | Page title                                           |
| `--type-h2`      | 26px   | 1.2         | 700    | `-0.01em` | Section title                                        |
| `--type-h3`      | 18px   | 1.3         | 600    | `-0.01em` | Card / panel title                                   |
| `--type-lead`    | 17px   | 1.55        | 400    | `0`       | Hero sub-copy                                        |
| `--type-body`    | 15.5px | 1.55        | 400    | `0`       | Default body text                                    |
| `--type-sm`      | 13.5px | 1.5         | 400    | `0`       | Secondary body, descriptions                         |
| `--type-label`   | 11.5px | 1.2         | 600    | `0.08em`  | Field labels, uppercase, `text-transform: uppercase` |
| `--type-code`    | 13px   | 1.6         | 400    | `0`       | Code blocks                                          |
| `--type-micro`   | 11px   | 1.4         | 500    | `0.02em`  | Badges, chips, status                                |

`--type-display` and `--type-h1` are fluid:
`clamp(26px, 3.4vw, 40px)` and `clamp(24px, 2.6vw, 32px)`.

### 4.3 Rules

- Two weights in chrome body copy: **400** and **600**. **700** is reserved
  for the logo, headlines and the primary button.
- Uppercase is only for `--type-label` and `--type-micro` chips. Never for
  sentences.
- Measure: 60–72 characters max (`max-width: 34rem` ≈ 544px for lead text).
  The current hero paragraph is 520px — keep it at or below 560px.
- Tabular numerals (`font-variant-numeric: tabular-nums`) for any number the
  user can compare: durations, distances, prices, slider values.
- Never centre long text; never justify.

---

## 5. Space, grid and layout

### 5.1 Spacing scale

Base unit **4px**. Legal steps: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 72`.
Anything not on the scale is a bug. Expose them as `--space-1` … `--space-11`
(or use the raw px values in a single `:root` block).

### 5.2 Layout grid

- Content container: **1080px** max width, **32px** gutters (16px below
  760px). This matches the existing `.features` / `.integrate` sections.
- Section rhythm: 72px top / 40px bottom for the first band, 24px top /
  72px bottom for the closing band. Vertical gap between adjacent sections
  is never less than 64px.
- The hero is **full-bleed and full-height**: `height: 100vh`, `min-height:
640px`, `overflow: hidden`. The scene fills it edge to edge.

### 5.3 Overlay regions (hero)

| Region          | Placement               | Width      |
| --------------- | ----------------------- | ---------- |
| Nav bar         | top, 22px 40px inset    | full width |
| Hero copy       | left 40px, top 118px    | ≤ 520px    |
| Search panel    | left 40px, bottom 40px  | 360px      |
| Utility cluster | right 28px, bottom 28px | auto       |
| Studio sheet    | right 0, full height    | 348px      |

These are the current values and they work; keep them, but make them
token-driven (`--hero-gutter: 40px`).

### 5.4 Z-index scale

| Layer            | z-index |
| ---------------- | ------- |
| Scene canvas     | 0       |
| Scene overlays   | 2       |
| Nav, hero copy   | 3       |
| Studio sheet     | 4       |
| Utility cluster  | 5       |
| Toasts / popover | 20      |
| Tooltip          | 30      |

### 5.5 Responsive behaviour

| Breakpoint | Behaviour                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥ 1200px   | Full layout as specified above. Studio is a right sheet over the scene.                                                                                                                                                   |
| 1024–1199  | Hero copy width 440px; panel 340px; studio 320px.                                                                                                                                                                         |
| 760–1023   | Hero copy and panel stack; the scene is still full-bleed behind them.                                                                                                                                                     |
| < 760px    | Panel becomes a **bottom sheet** spanning the width (16px insets, 16px from the bottom). Hero copy moves to 16px/90px. Studio becomes a full-width sheet from the bottom. Nav collapses to the logo plus a single action. |
| < 480px    | Type drops to the small end of each ramp step; the utility cluster stacks vertically; touch targets grow to 44px.                                                                                                         |

Touch targets are **≥ 44 × 44px** on coarse pointers (`@media (pointer: coarse)`),
even when the visual control is smaller — pad with a transparent hit area.

---

## 6. Shape, elevation and surfaces

### 6.1 Radii

| Token           | Value | Use                                      |
| --------------- | ----- | ---------------------------------------- |
| `--radius-xs`   | 6px   | Code-inline, tiny chips                  |
| `--radius-sm`   | 10px  | Inputs, small buttons, segmented control |
| `--radius-md`   | 14px  | Code blocks, popovers                    |
| `--radius-lg`   | 18px  | The search panel, cards                  |
| `--radius-full` | 999px | Pills, avatars, the primary CTA          |
| `--radius-dot`  | 50%   | Dots, city markers, ripple rings         |

Rule: the CTA is a **pill**, the panel is a **large radius**, inputs are
**small radius**. Nothing in the product is a hard 0px corner.

### 6.2 Elevation

Three levels, all soft and wide:

| Level | Use      | Light                                                          | Dark                                                    |
| ----- | -------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| 0     | Flat     | none                                                           | none                                                    |
| 1     | Resting  | `0 1px 2px rgba(16,20,28,.06), 0 4px 12px rgba(16,20,28,.05)`  | `0 1px 2px rgba(0,0,0,.5), 0 4px 12px rgba(0,0,0,.35)`  |
| 2     | Floating | `0 12px 28px rgba(16,20,28,.10), 0 2px 6px rgba(16,20,28,.06)` | `0 12px 28px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.4)` |
| 3     | Overlay  | `0 24px 60px rgba(20,22,28,.28)`                               | `0 24px 60px rgba(0,0,0,.6)`                            |

The search panel sits at level 3 (it is a foreground object over a busy
scene). Utility chips and the code block sit at level 1–2.

### 6.3 Glass surfaces

The floating utility cluster and any chip that sits directly on the scene
uses a **glass** treatment:

```css
background: color-mix(in srgb, var(--rd-surface) 70%, transparent);
backdrop-filter: blur(4px);
border: 1px solid var(--rd-line);
border-radius: var(--radius-full);
```

Keep the blur at 4–8px and the tint at 70–80%. Heavy blur over a WebGL
canvas is expensive — do not exceed it, and always test the frame rate.

### 6.4 The dark instrument panel (signature)

The flight-search panel is **dark on both themes** — a cockpit instrument
panel sitting on a light page. This is deliberate: it separates the tool from
the map, and it is the single most recognisable part of the current design.

Rules:

- Panel background `--rd-panel`, fields inside it `--rd-panel-field`
  (one step darker — inputs read as recessed), active segments
  `--rd-panel-raised` (one step lighter).
- Panel text is `--rd-ink-inverse`; labels are `--rd-ink-faint`.
- The panel's border is a 1px `--rd-panel-edge` hairline, and it carries
  elevation level 3.
- The panel never uses the accent as a fill for anything other than the
  primary CTA.
- In **dark** chrome the panel becomes a shade of the page rather than a
  different world (see §3.2).

### 6.5 Hairlines

Borders are **1px** and always `--rd-line` / `--rd-panel-edge`. A 2px border
exists only on the feature grid's top rules. Focus rings are 2px.

---

## 7. Iconography

### 7.1 Stroke icons

- Grid: **24 × 24** viewBox, 20px rendered in controls, 16px inline.
- Stroke: **1.5px**, round cap, round join, `stroke: currentColor`,
  `fill: none`.
- Optical alignment: icons sit on the text baseline with a 2px nudge; a
  glyph inside a 20px button is centred on a 24px grid.

### 7.2 The plane

The plane is a **component**, not an icon set: `plane.icon` accepts
`'airliner' | 'jet' | 'arrow' | 'dot'`, raw SVG path data, a raster image, or
a custom canvas painter. In the UI, the plane is used for:

- the map's travelling sprite (the library draws it);
- a 16px inline glyph in the itinerary row, matching the active icon
  component's silhouette so chrome and scene agree.

### 7.3 Emoji ban

The current showcase uses `🎛`, `🌙`, `🌍`, `➰`, `⇄`, `✈` in the interface.
Emoji render differently on every OS, break the 1.5px stroke rule, cannot be
recoloured with `currentColor`, and read as placeholders. **Replace every
emoji in shipped UI with an inline SVG.** The one deliberate exception is a
single `✈` inside the itinerary row if it is styled as text — prefer SVG
there too.

### 7.4 Icon inventory for the chrome

`menu`, `close`, `swap` (⇄ drawn as two opposing arrows), `sun`, `moon`,
`sliders` (the studio toggle), `search`, `chevron-down`, `chevron-right`,
`calendar`, `user`, `plane`, `check`, `alert`, `info`, `copy`, `external-link`,
`reset`.

Each must exist as an inline SVG in the prototype (no icon font, no CDN).

---

## 8. Motion

### 8.1 Durations and easings (tokens)

| Token           | Value                         | Use                      |
| --------------- | ----------------------------- | ------------------------ |
| `--dur-instant` | 90ms                          | Hover on small controls  |
| `--dur-fast`    | 120ms                         | Colour / border changes  |
| `--dur-base`    | 180ms                         | Panel, sheet, tooltip    |
| `--dur-slow`    | 240ms                         | Larger surfaces          |
| `--ease-out`    | `cubic-bezier(.22,.61,.36,1)` | Anything entering        |
| `--ease-in-out` | `cubic-bezier(.65,.05,.36,1)` | Anything moving in place |
| `--ease-linear` | `linear`                      | Continuous rotation only |

The camera and the route draw-on use the library's own easing
(`easeInOutCubic`) — see `src/routes/easing.ts`.

### 8.2 The library's canonical timings

These are **not** UI durations — they are the product's voice. Chrome should
borrow their _rhythm_, not their length.

| Thing             | Value                                                    |
| ----------------- | -------------------------------------------------------- |
| Arc draw-on       | `route.drawDurationMs` — 1100ms per leg                  |
| Leg stagger       | `route.staggerMs` — 350ms between outbound and return    |
| Outbound dash     | 14 dashes, 55% duty, `speed` 4.9 dashes/s                |
| Return dash       | 18 dashes, 45% duty, `speed` 3.96 dashes/s               |
| City ripple cycle | `cities.periodMs` — 2600ms, grow ×2.6, peak opacity 0.55 |
| Endpoint pulse    | one-shot on `setRoute`                                   |
| Plane loop        | `plane.flightMs` travel + `plane.pauseMs` dwell          |
| Camera frame      | eased pan/zoom when a route is set (`frameRoute`)        |

### 8.3 Rules

- Chrome animation never exceeds **240ms** except the scene's own drawing.
- Never animate layout-affecting properties (`width`, `height`, `top`);
  animate `transform` and `opacity`.
- Respect `@media (prefers-reduced-motion: reduce)`: disable the plane loop,
  the ripple, the dash flow and the camera easing; keep an instant draw-on so
  the route is still legible.
- The scene's motion and the chrome's motion never overlap: a sheet opening
  over a moving globe reads as noise.

---

## 9. Data-visualisation grammar (the scene)

This is the part a general UI designer usually gets wrong. The map has its
own rules, and they are as binding as the chrome's.

### 9.1 The layer stack

Surfaces are concentric shells, a hair apart, so nothing z-fights. Reading
order is fixed:

```
ocean → country fills → borders → city pulses → endpoint markers
      → endpoint pulses → route arcs (lifted) → plane → pin badges → atmosphere
```

### 9.2 Arcs

- An arc is a **lifted great circle**: `1 + lift·sin(πt)`. Never a straight
  line, never a two-point polyline.
- **Outbound** (origin → destination) and **return** must be told apart by
  **three** independent cues:
  1. colour — `outbound` vs `return`;
  2. dash pattern — outbound is coarser (14 dashes, 55% duty) and faster
     (4.9/s); return is finer (18, 45%) and slower (3.96/s);
  3. lift — outbound `0.10`, return `0.20`, so the return floats above the
     outbound and the pair never overlaps.
- A round trip therefore reads as _one ribbon of two strands_. A one-way
  route has one strand and must not look like half of a pair.
- Curve `angle` (±85°) banks the arc out of its great-circle plane. When
  both legs are visible keep `|angle| ≥ 12°` for each, and never give both
  legs the same sign — the whole point is separation.
- Widths: outbound `1.8px`, return `1.4px` on the flat map. The globe
  converts the same px number into a tube radius.

### 9.3 Endpoint semantics

- The **source** is the departure; the **destination** is the arrival.
- They may be styled independently (`airports.source` /
  `airports.destination`) — colour, size, ring colour, ring on/off.
- A common pattern is a tinted source and a neutral destination, but the
  **pin badge must always carry the city name** so the map is readable
  without colour.
- The endpoint pulse is a **one-shot** ring on `setRoute`, not a loop.

### 9.4 City markers

- A solid dot (radius 0.006 globe radii) plus an expanding ring (outer
  0.011, thickness 0.0025) that grows ×2.6 and fades to 0 over a 2600ms
  cycle.
- The dot breathes between full opacity and `dim` (0.45). It is a
  _background texture_, not a focal point — city markers must never be
  louder than the route.

### 9.5 Pin badges

- A pill containing the city name, anchored to the endpoint, sticking to the
  globe as it rotates and fading on the far side.
- Type: 12px, weight 600, tracking `0.01em`, colour `label`, pill
  `labelBackground`.
- The pill's ring/hairline takes the pill's own colour.
- One pin per endpoint. No leader lines.

### 9.6 Legend

Whenever colour carries meaning (outbound vs return, a custom airport
colour), a **legend** is required. Legend swatches are 10px dots or 18px
dashed line samples — they must reproduce the actual dash pattern, not a
solid approximation.

### 9.7 What the chrome must never do to the scene

- Never draw over the globe with a scrim that kills the atmosphere glow.
- Never set a background on the container that fights `ocean` — the scene's
  own background is the canvas colour.
- Never animate the scene's canvas with CSS transforms; the camera owns it.
- Never place a `position: sticky` header over the scene with an opaque
  background — the scene is the hero.

---

## 10. Components (host chrome)

The library draws the map; the host app draws everything else. These are the
components the system ships.

| Component             | Variants                                 | Notes                                                      |
| --------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Top nav               | default, transparent-over-scene, mobile  | Logo lockup + 3 links + one action                         |
| Logo lockup           | —                                        | A 14px dot with a soft ring, then the wordmark at 17px/700 |
| Hero copy             | headline + lead                          | ≤ 520px, never centred over the globe                      |
| Search panel          | one-way, round-trip                      | The signature dark instrument panel (§6.4)                 |
| Field (label+control) | select, text, date                       | Label is `--type-label`, uppercase, `--rd-ink-faint`       |
| Segmented control     | one-way / round-trip, single-select      | 3px inset padding, 8px radius inside                       |
| Swap button           | —                                        | 30px circle, sits _between_ two fields                     |
| Primary CTA           | default, hover, disabled, loading        | Pill, full width in the panel                              |
| Icon button           | default, hover, active                   | 32px circle, hairline border                               |
| Status line           | neutral, error, success                  | `role="status"`, `aria-live="polite"`                      |
| Utility cluster       | badges + icon buttons                    | Glass surface, bottom-right                                |
| Studio sheet          | open, closed, mobile                     | Right sheet, 348px, grouped controls, live code preview    |
| Control row           | slider, colour, select, checkbox, toggle | Label / control / value, 3-column grid                     |
| Code block            | default, copyable                        | `--rd-panel-field` bg, 14px radius, 13px mono              |
| Feature card          | —                                        | 2px top rule, no border box                                |
| Itinerary row         | outbound, return                         | Plane glyph, airport codes, times, duration                |
| Legend                | arc swatch, dot swatch                   | Required when colour carries meaning                       |
| Footer                | —                                        | 1px top rule, muted text                                   |

### 10.1 The search panel — anatomy

```
┌──────────────────────────────────────┐
│ PASSENGERS                2 Adults · 1 Child
│ ┌────────────┐  ⇄  ┌────────────┐    │   FROM / TO  (2 cols + swap)
│ │ From       │     │ To         │    │
│ └────────────┘     └────────────┘    │
│ ┌────────────┐     ┌────────────┐    │   DEPARTURE / ROUTE
│ │ date       │     │ ( ) ( )    │    │
│ └────────────┘     └────────────┘    │
│           ( Search Flights )         │   primary CTA, pill
│             status line              │   role=status
└──────────────────────────────────────┘
```

Rules: fields are equal width; the swap button is exactly the height of the
fields it sits between; the CTA spans the full inner width; the status line
has a **reserved height** so it never shifts the layout when it appears.

### 10.2 The studio sheet — anatomy

Groups, top to bottom, separated by a 1px hairline with 16px of space above:

1. **World** — renderer, surface, camera3d.
2. **Colours** — one row per palette key, with a colour swatch.
3. **Plane** — icon preset, size, colour, timing.
4. **Cities** — dot, ripple, period.
5. **Labels** — font, size, weight, colours, halo.
6. **Airports** — shared, source, destination.
7. **Dashes** — length, gap, speed, width, per leg.
8. **Angles** — curve angle per leg.
9. **Live code** — the generated `setOptions` snippet, copyable.
10. **Reset** — back to defaults.

Rules: every control is wired to the public API (`setColors`, `setOptions`,
`setWorld`) — the studio is a demo of the API, not a private back door.
Values shown next to sliders are the **resolved** numbers, tabular-aligned.

---

## 11. States and feedback

Every interactive element defines: **default, hover, active, focus-visible,
disabled, loading, error** (and **selected** where relevant).

| State         | Treatment                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| Default       | As specified in §10                                                                                          |
| Hover         | 1–2% surface shift or border strengthening; `--dur-instant`                                                  |
| Active/press  | 1px shift down, or the surface goes one step darker                                                          |
| Focus-visible | 2px `--rd-accent` outline + 2px offset. **Never** `outline: none` without a replacement                      |
| Disabled      | 45% opacity, `cursor: not-allowed`, `aria-disabled="true"`                                                   |
| Loading       | The control keeps its width; a 14px spinner replaces the label; `aria-busy="true"`                           |
| Error         | `--rd-danger` text + 1px danger border on the offending field; the message is linked with `aria-describedby` |
| Success       | `--rd-success` check + short confirmation                                                                    |

### 11.1 Feedback rules

- The status line under the CTA is the single place for form feedback
  (`role="status"`, `aria-live="polite"`). It has a reserved min-height.
- Never rely on colour alone for validity — pair with an icon and text.
- Latency: the scene reacts immediately. If data is needed, the _chrome_
  shows a skeleton, the scene keeps animating.

---

## 12. Accessibility

Target: **WCAG 2.1 AA**.

- Contrast: 4.5:1 for body text, 3:1 for large text, UI borders and
  meaningful graphics. The map's dot lattice is decorative texture and is
  exempt; borders, arcs, endpoint dots and pins are not.
- The map is decorative-ish but meaningful: give the container an
  `aria-label` describing the route (`"Dot globe showing a round trip from
London to Dubai"`), and expose the route as text nearby.
- Keyboard: every control reachable; the segmented control is a proper
  `role="tablist"` with `aria-selected`; the studio is a `role="dialog"`-ish
  region that traps focus only if it is modal (it is not — it is a sheet, so
  it must **not** trap focus, but it must be `aria-expanded`-aware).
- Focus order follows the visual order: nav → hero copy → panel → utility
  cluster → studio.
- Touch: 44px targets, no hover-only affordances.
- Motion: honour `prefers-reduced-motion` (§8.3).
- The map's own `world: 'auto'` fallback is the accessible path when WebGL
  is unavailable — do not hide functionality behind WebGL.

---

## 13. Voice and copy

- **Confident and short.** "See your journey before you book it." — no
  exclamation marks, no "amazing", no "AI-powered".
- **Concrete, not clever.** Label the thing: `From`, `To`, `Departure`,
  `Search Flights`, `Round trip`, `Open the customization studio`.
- **Sentence case** for everything except the uppercase micro-labels.
- **Errors say what to do.** "Pick two different cities" beats "Invalid
  route". "We couldn't load departures" beats "Error 500".
- **Numbers are specific.** "2 h 55 m", "5,500 km", "7 h 40 m local".
- Capitalise airport codes in uppercase (`LHR`, `DXB`).
- Never write "the globe" in user-facing copy; write "your route".

---

## 14. Acceptance checklist

Every delivered screen is checked against this list:

- [ ] Only tokens from this document are used — no literal hex, px radius or
      duration outside the token blocks.
- [ ] The accent is the outbound arc colour (§3.4).
- [ ] Both light and dark chrome are shown.
- [ ] Every interactive element has hover, focus-visible, disabled and
      error states.
- [ ] Focus is visible and follows the visual order; no `outline: none`.
- [ ] Body text hits 4.5:1; borders and meaningful graphics hit 3:1.
- [ ] Nothing overlaps the scene's focal area (the globe's visible disc and
      the route) — check the 1024px and 480px widths.
- [ ] The layout survives a 200% zoom / 320px width.
- [ ] `prefers-reduced-motion` is honoured.
- [ ] No emoji, no webfont, no icon font, no external request.
- [ ] The HTML is valid, self-contained and opens in a browser with no
      console errors.
- [ ] Copy follows §13.

---

## 15. Anti-patterns

| Don't                                                  | Do instead                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| Put a UI panel on top of the globe's centre            | Anchor panels to the corners; the centre belongs to the route |
| Give the CTA a different colour from the outbound arc  | Bind them (§3.4)                                              |
| Use red/green to mark departure vs arrival             | Use hue + size + label, and keep the map to one marker colour |
| Animate the chrome while the route is drawing          | Let the scene have the moment                                 |
| Blur the canvas heavily or drop a shadow on the scene  | Glass surfaces float _beside_ the scene, not on it            |
| Rebuild the map's look with CSS (fake arcs, fake dots) | Use the library's real `colors` / `route` options             |
| Ship emoji as icons                                    | Inline SVG (§7.3)                                             |
| Add a second font                                      | One sans + one mono                                           |
| Add gradients to chrome                                | Gradients belong to the globe                                 |
| Round the world's radius inconsistently                | Use the radius scale (§6.1)                                   |

---

## 16. Token reference (copy-paste)

```css
:root {
  /* colour — light chrome */
  --rd-canvas: #f7f8fa;
  --rd-surface: #ffffff;
  --rd-surface-sunken: #eef0f4;
  --rd-panel: #232428;
  --rd-panel-edge: #34353b;
  --rd-panel-field: #17181c;
  --rd-panel-raised: #2f3037;
  --rd-ink: #1c1e22;
  --rd-ink-muted: #6b7280;
  --rd-ink-faint: #9aa0aa;
  --rd-ink-inverse: #e8e9ec;
  --rd-line: #e5e7eb;
  --rd-line-strong: #d3d7de;
  --rd-accent: #0b6bcb;
  --rd-accent-ink: #ffffff;
  --rd-accent-soft: #e8f1fc;
  --rd-danger: #fca5a5;
  --rd-danger-strong: #dc2626;
  --rd-success: #16a34a;

  /* type */
  --font-ui:
    ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --type-display: 40px;
  --type-h1: 32px;
  --type-h2: 26px;
  --type-h3: 18px;
  --type-lead: 17px;
  --type-body: 15.5px;
  --type-sm: 13.5px;
  --type-label: 11.5px;
  --type-code: 13px;
  --type-micro: 11px;

  /* space */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-18: 72px;

  /* shape */
  --radius-xs: 6px;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 18px;
  --radius-full: 999px;

  /* elevation */
  --shadow-1: 0 1px 2px rgba(16, 20, 28, 0.06), 0 4px 12px rgba(16, 20, 28, 0.05);
  --shadow-2: 0 12px 28px rgba(16, 20, 28, 0.1), 0 2px 6px rgba(16, 20, 28, 0.06);
  --shadow-3: 0 24px 60px rgba(20, 22, 28, 0.28);

  /* motion */
  --dur-instant: 90ms;
  --dur-fast: 120ms;
  --dur-base: 180ms;
  --dur-slow: 240ms;
  --ease-out: cubic-bezier(0.22, 0.61, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0.05, 0.36, 1);

  /* layout */
  --container: 1080px;
  --gutter: 32px;
  --hero-gutter: 40px;
  --panel-width: 360px;
  --studio-width: 348px;
  --focus-ring: 0 0 0 2px var(--rd-accent), 0 0 0 4px var(--rd-surface);
}

[data-theme='dark'] {
  --rd-canvas: #0b0f16;
  --rd-surface: #141a23;
  --rd-surface-sunken: #0e131c;
  --rd-panel: #1b1f26;
  --rd-panel-edge: #2b313a;
  --rd-panel-field: #11151b;
  --rd-panel-raised: #262b33;
  --rd-ink: #e6eaf0;
  --rd-ink-muted: #98a2b3;
  --rd-ink-faint: #6b7280;
  --rd-ink-inverse: #e8e9ec;
  --rd-line: #232a33;
  --rd-line-strong: #333c47;
  --rd-accent: #7dd3fc;
  --rd-accent-ink: #04121c;
  --rd-accent-soft: #12283a;
  --rd-danger: #fca5a5;
  --rd-danger-strong: #f87171;
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.35);
  --shadow-2: 0 12px 28px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.4);
  --shadow-3: 0 24px 60px rgba(0, 0, 0, 0.6);
}
```

---

## 17. Where the truth lives in the code

When the design and the implementation disagree, the implementation wins and
the design is updated. These files are the authority:

| Concern               | File                                                  |
| --------------------- | ----------------------------------------------------- |
| Scene palette, themes | `src/theme.ts`                                        |
| Arc / dash / width    | `src/routes/routeStyle.ts`                            |
| City dot + ripple     | `src/markers/rippleStyle.ts`                          |
| Label / pin type      | `src/labels/textStyle.ts`                             |
| Endpoint styling      | `src/routes/airportStyle.ts`                          |
| Layer stack           | `src/globe/layerRadii.ts`                             |
| Plane icon + timing   | `src/routes/PlaneIcon.ts`, `src/routes/PlaneLayer.ts` |
| Flat 3D camera        | `src/flat/camera3d.ts`                                |
| Public options        | `src/RouteDots.ts` (`RouteDotsOptions`)               |
| Live showcase         | `examples/showcase/index.html`                        |
| Current product UI    | `examples/showcase/index.html`                        |
| Option reference      | `docs/developer-guide.md`                             |
