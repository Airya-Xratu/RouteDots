/**
 * EndpointLabels — pin badges at route endpoints.
 *
 * A tiny DOM overlay that puts a pill badge with the city name at each end of
 * the route (plus a short stem and a dot on the globe surface). Badges are
 * re-projected every frame and fade out when their anchor rotates to the far
 * side of the globe, so they never float in empty space.
 *
 * The overlay layer is `position: absolute` inside the globe container and
 * `pointer-events: none`, so it never blocks camera interaction.
 */
import * as THREE from 'three';
import { latLngToVec } from '../core/greatCircle.js';
import { pinLabelCssVars, type ResolvedCityLabelStyle } from '../labels/textStyle.js';

/** A labelled endpoint. */
export interface PinPoint {
  /** Text shown on the badge (usually the city name). */
  name: string;
  lat: number;
  lng: number;
  /**
   * Colour of this pin's surface dot — the resolved airport colour of the
   * endpoint (source / destination), when the `airports` option customizes it.
   */
  dotColor?: string;
}

/** Result of projecting one pin for the current camera. */
export interface PinProjection {
  /** x in container CSS pixels. */
  x: number;
  /** y in container CSS pixels. */
  y: number;
  /** False when the anchor sits on the far side of the globe. */
  visible: boolean;
}

/** Below this facing value the anchor is considered behind the globe. */
export const HIDE_BEHIND_EPS = 0.12;

/** Badge colours (usually taken from the RouteDots palette). */
export interface PinPalette {
  /** Pill background. */
  background?: string;
  /** Pill text. */
  label?: string;
  /** Dot on the globe surface (and its ring). */
  dot?: string;
}

const PIN_CSS = `
.rd-pin {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
  will-change: transform;
}
.rd-pin-dot {
  position: absolute;
  left: 0;
  top: 0;
  width: 7px;
  height: 7px;
  margin: -3.5px 0 0 -3.5px;
  border-radius: 50%;
  background: var(--rd-pin-dot);
  box-shadow: 0 0 0 2.5px var(--rd-pin-ring);
}
.rd-pin-stem {
  position: absolute;
  left: -0.5px;
  top: -15px;
  width: 1px;
  height: 14px;
  background: var(--rd-pin-stem);
}
.rd-pin-label {
  position: absolute;
  left: 0;
  top: -15px;
  transform: translate(-50%, -100%);
  padding: 3px 9px 4px;
  border-radius: 999px;
  font-family: var(--rd-pin-font, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif);
  font-size: var(--rd-pin-size, 12px);
  font-weight: var(--rd-pin-weight, 600);
  letter-spacing: var(--rd-pin-spacing, 0.01em);
  line-height: 1.35;
  white-space: nowrap;
  color: var(--rd-pin-fg);
  background: var(--rd-pin-bg);
  box-shadow: var(--rd-pin-shadow, 0 1px 6px rgba(10, 18, 32, 0.22));
}
/* labels.background: false — bare text, no pill and no shadow. */
.rd-pin-plain {
  --rd-pin-shadow: none;
}
.rd-pin-light {
  --rd-pin-bg: #ffffff;
  --rd-pin-fg: #141b26;
  --rd-pin-stem: rgba(20, 27, 38, 0.5);
  --rd-pin-dot: #141b26;
  --rd-pin-ring: rgba(255, 255, 255, 0.65);
}
.rd-pin-dark {
  --rd-pin-bg: #edf2f9;
  --rd-pin-fg: #0b1220;
  --rd-pin-stem: rgba(237, 242, 249, 0.55);
  --rd-pin-dot: #edf2f9;
  --rd-pin-ring: rgba(255, 255, 255, 0.4);
}
`;

let cssInjected = false;

function injectStyles(): void {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const style = document.createElement('style');
  style.textContent = PIN_CSS;
  document.head.appendChild(style);
}

const _camDir = new THREE.Vector3();
const _view = new THREE.Matrix4();
const _clip = new THREE.Vector3();

/**
 * Projects a globe-surface point (unit vector) to container pixels for the
 * given camera, and decides whether it is on the visible (near) hemisphere.
 *
 * The point is first transformed into camera (view) space using the inverse
 * of the camera's world transform — so the camera's *orientation* matters,
 * not just its position — then through the projection matrix.
 *
 * Pure math — no DOM — so it is unit-testable in Node.
 */
export function projectPin(
  v: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  w: number,
  h: number,
): PinProjection {
  camera.updateMatrixWorld();
  _view.copy(camera.matrixWorld).invert();
  _camDir.copy(camera.position).normalize();
  const visible = v.dot(_camDir) >= HIDE_BEHIND_EPS;
  // View space, then projection space. Note: Vector3.applyMatrix4 performs
  // the homogeneous divide for us, so the result is already NDC — do NOT
  // divide by clip.z (or clip.w) again.
  _clip.copy(v).applyMatrix4(_view).applyMatrix4(camera.projectionMatrix);
  return {
    x: (_clip.x / 2 + 0.5) * w,
    y: (-_clip.y / 2 + 0.5) * h,
    visible,
  };
}

interface Pin {
  el: HTMLElement;
  v: THREE.Vector3;
}

/**
 * Dom overlay of pin badges.
 *
 * `host` must be an element that overlaps the rendered canvas exactly (the
 * RouteDots container works out of the box); `viewport` reports the canvas
 * size in CSS pixels.
 */
export class EndpointLabels {
  private readonly layer: HTMLDivElement;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly viewport: () => [number, number];
  private pins: Pin[] = [];
  private textStyleValue: ResolvedCityLabelStyle | null = null;

  constructor(
    host: HTMLElement,
    camera: THREE.PerspectiveCamera,
    viewport: () => [number, number],
    theme: 'light' | 'dark' = 'light',
    palette?: PinPalette,
  ) {
    this.camera = camera;
    this.viewport = viewport;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    this.layer = document.createElement('div');
    this.layer.className = `rd-pin-layer rd-pin-${theme}`;
    this.layer.style.cssText =
      'position: absolute; inset: 0; overflow: visible; pointer-events: none; z-index: 5;';
    host.appendChild(this.layer);
    injectStyles();
    if (palette) this.setPalette(palette);
  }

  /** The resolved label text style in use (null until `setTextStyle`). */
  get labelStyle(): ResolvedCityLabelStyle | null {
    return this.textStyleValue;
  }

  /** Applies the city-name text style (font, size, weight, colours…). */
  setTextStyle(style: ResolvedCityLabelStyle): void {
    this.textStyleValue = style;
    for (const [name, value] of Object.entries(pinLabelCssVars(style))) {
      this.layer.style.setProperty(name, value);
    }
    // No pill background: bare text without the drop shadow.
    this.layer.classList.toggle('rd-pin-plain', style.background === null);
  }

  /** Restyles the badges from the palette (theme switch / `setColors`). */
  setPalette(palette: PinPalette): void {
    const set = (name: string, value: string | undefined): void => {
      if (value) this.layer.style.setProperty(name, value);
    };
    set('--rd-pin-bg', palette.background);
    set('--rd-pin-fg', palette.label);
    set('--rd-pin-dot', palette.dot);
    set('--rd-pin-stem', palette.dot);
    // The halo behind the surface dot is the pill's own colour.
    set('--rd-pin-ring', palette.background);
  }

  /** (Re)creates the badges for the given endpoints. */
  setPoints(points: PinPoint[]): void {
    this.clear();
    for (const p of points) {
      const el = document.createElement('div');
      el.className = 'rd-pin';
      const label = document.createElement('span');
      label.className = 'rd-pin-label';
      label.textContent = p.name;
      const stem = document.createElement('span');
      stem.className = 'rd-pin-stem';
      const dot = document.createElement('span');
      dot.className = 'rd-pin-dot';
      el.append(label, stem, dot);
      // A customized endpoint (airports.source / airports.destination) colours
      // its own pin dot; the layer default applies otherwise.
      if (p.dotColor) el.style.setProperty('--rd-pin-dot', p.dotColor);
      this.layer.appendChild(el);
      this.pins.push({ el, v: new THREE.Vector3(...latLngToVec(p.lat, p.lng, 1)) });
    }
  }

  /** Projects the badges onto the current camera; hides far-side ones. */
  update(): void {
    const [w, h] = this.viewport();
    if (w <= 0 || h <= 0) return;
    for (const pin of this.pins) {
      const pr = projectPin(pin.v, this.camera, w, h);
      if (!pr.visible) {
        pin.el.style.opacity = '0';
        continue;
      }
      pin.el.style.opacity = '1';
      pin.el.style.transform = `translate(${pr.x}px, ${pr.y}px)`;
    }
  }

  /** Removes all badges. */
  clear(): void {
    for (const pin of this.pins) pin.el.remove();
    this.pins = [];
  }

  /** Switches the badge colour theme. */
  setTheme(theme: 'light' | 'dark'): void {
    this.layer.className = `rd-pin-layer rd-pin-${theme}`;
  }

  /** Removes the overlay layer from the host. */
  dispose(): void {
    this.clear();
    this.layer.remove();
  }
}
