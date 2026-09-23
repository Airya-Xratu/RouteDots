/**
 * GlobeRenderer — three.js scene for the dot globe.
 *
 * Owns the renderer, scene, camera rig and animation loop. Route layers
 * (arcs, planes, markers) are added on top via `globeGroup` or the frame
 * callbacks, and animated by the same loop.
 */
import * as THREE from 'three';
import landTopo from '../data/land-110m.js';
import { buildDotGrid } from '../core/dotPattern.js';
import { decodeRings, type TopoLand } from '../core/topojson.js';
import { CameraRig, type ViewState } from './cameraRig.js';
import { createDotTexture } from './dotTexture.js';
import { createAtmosphere } from './atmosphere.js';
import { BordersLayer } from './BordersLayer.js';
import type { MapSurface } from '../types.js';
import { CountrySurfaceLayer } from './countrySurface.js';
import { LAYER_RADIUS } from './layerRadii.js';

/** Which map surface the globe wears (see {@link MapSurface}). */
export type GlobeSurface = MapSurface;

export interface GlobeThemeColors {
  /** Base sphere colour (ocean). */
  globe: string;
  /** Country fill colour (the `countries` surface). */
  countries: string;
  /** Dot colour (the legacy `dots` surface). */
  dots: string;
  /** Country border line colour. */
  borders: string;
  /** Atmosphere halo colour. */
  atmosphere: string;
}

export const GLOBE_THEMES: Record<'light' | 'dark', GlobeThemeColors> = {
  light: {
    globe: '#f2f5f9',
    countries: '#c3c9d4',
    dots: '#8b93a1',
    borders: '#ffffff',
    atmosphere: '#93a7c4',
  },
  dark: {
    globe: '#0e131c',
    countries: '#2b3442',
    dots: '#5b6b82',
    borders: '#ffffff',
    atmosphere: '#3d5f8f',
  },
};

export interface GlobeRendererOptions {
  theme?: 'light' | 'dark';
  /**
   * Map surface: grey country fills with white borders (`countries`, the
   * default) or the legacy dot lattice (`dots`).
   */
  surface?: GlobeSurface;
  /** Override individual colours. */
  colors?: Partial<GlobeThemeColors>;
  /** Texture / dot lattice options. */
  texture?: {
    stepDeg?: number;
    resDeg?: number;
    dotSizeDeg?: number;
    width?: number;
  };
  /** Initial camera view (altitude = globe radii). */
  view?: ViewState;
  /** Field of view in degrees (default 42). */
  fov?: number;
  /** Gentle idle rotation. */
  autoRotate?: {
    enabled?: boolean;
    /** Degrees of longitude per second (default 0.4). */
    speed?: number;
  };
  /** Allow pointer drag + wheel zoom (default false — hero background). */
  interactive?: boolean;
  /** Replace the bundled land mask. */
  land?: TopoLand;
  /** Country border lines (default enabled). */
  borders?: {
    enabled?: boolean;
    /** Line colour (default: the theme's border colour). */
    color?: string;
    /** Line opacity, 0..1 (default 0.55). */
    opacity?: number;
  };
}

/** True when the current environment can create a WebGL context. */
export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export class GlobeRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Everything attached here rotates/positions with the globe. */
  readonly globeGroup: THREE.Group;
  readonly rig: CameraRig;
  /** Country border lines (null when borders are disabled). */
  readonly borders: BordersLayer | null;
  /** Grey country fills (null when the `dots` surface is used). */
  readonly countries: CountrySurfaceLayer | null;

  private readonly container: HTMLElement;
  private readonly globeMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly atmosphere: THREE.Mesh;
  private readonly dotTexture: THREE.CanvasTexture | null;
  private readonly frameCallbacks = new Set<(time: number, dt: number) => void>();
  private readonly onResize: () => void;
  private resizeObserver: ResizeObserver | null = null;
  private rafId = 0;
  private lastFrameMs = 0;
  private ready = false;
  private disposed = false;
  private pointerDown = false;
  private lastPointer = { x: 0, y: 0 };

  constructor(container: HTMLElement, options: GlobeRendererOptions = {}) {
    this.container = container;

    const themeColors = { ...GLOBE_THEMES[options.theme ?? 'light'], ...options.colors };
    const view: ViewState = options.view ?? { lat: 30, lng: 45, altitude: 1.9 };

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      // preserveDrawingBuffer lets demos/tests read back the canvas.
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(options.fov ?? 42, 1, 0.05, 100);

    // Ocean sphere + surface layer. An unlit material keeps the flat, minimal
    // aesthetic (the surface carries the land colours) and makes rendering
    // deterministic across GPU vendors.
    const surface = options.surface ?? 'countries';
    if (surface === 'dots') {
      const topo = options.land ?? (landTopo as TopoLand);
      const pattern = buildDotGrid(decodeRings(topo), {
        stepDeg: options.texture?.stepDeg,
        resDeg: options.texture?.resDeg,
      });
      // The dot texture paints its own ocean base, so the material stays white.
      this.dotTexture = createDotTexture(pattern, {
        bgColor: themeColors.globe,
        dotColor: themeColors.dots,
        dotSizeDeg: options.texture?.dotSizeDeg,
        width: options.texture?.width,
      }).texture;
    } else {
      this.dotTexture = null;
    }
    const globeMaterial = new THREE.MeshBasicMaterial({
      color: this.dotTexture ? 0xffffff : new THREE.Color(themeColors.globe),
      map: this.dotTexture,
    });
    this.globeMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), globeMaterial);
    this.globeGroup = new THREE.Group();
    this.globeGroup.add(this.globeMesh);
    this.scene.add(this.globeGroup);

    this.atmosphere = createAtmosphere({ color: themeColors.atmosphere });
    this.scene.add(this.atmosphere);

    this.countries =
      surface === 'countries'
        ? new CountrySurfaceLayer(this.globeGroup, { color: themeColors.countries })
        : null;

    this.borders =
      options.borders?.enabled === false
        ? null
        : new BordersLayer(this.globeGroup, {
            color: options.borders?.color ?? themeColors.borders,
            opacity: options.borders?.opacity,
            radius: LAYER_RADIUS.borders,
          });

    this.rig = new CameraRig({
      initial: view,
      autoRotateSpeed:
        options.autoRotate?.enabled === false ? 0 : (options.autoRotate?.speed ?? 0.4),
    });
    this.rig.setAutoRotate(options.autoRotate?.enabled !== false);

    if (options.interactive) this.bindInteraction();

    this.onResize = () => this.resize();
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(container);
    }

    this.lastFrameMs = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** True while the user is actively dragging the globe (interaction wins over tracking). */
  get isDragging(): boolean {
    return this.pointerDown;
  }

  /** Registers a per-frame callback; returns an unsubscribe function. */
  onFrame(callback: (time: number, dt: number) => void): () => void {
    this.frameCallbacks.add(callback);
    return () => this.frameCallbacks.delete(callback);
  }

  /** Animates the camera to a new point of view. */
  setView(view: ViewState, durationMs = 1200): void {
    this.rig.startTween(view, performance.now(), { durationMs });
  }

  getCameraState(): ViewState {
    return this.rig.state;
  }

  setAutoRotate(enabled: boolean): void {
    this.rig.setAutoRotate(enabled);
  }

  resize(width?: number, height?: number): void {
    const w = width ?? this.container.clientWidth ?? 1;
    const h = height ?? this.container.clientHeight ?? 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Reads a pixel from the last rendered frame (for tests/demos). */
  readPixel(x: number, y: number): [number, number, number, number] {
    const copy = document.createElement('canvas');
    const ctx = copy.getContext('2d');
    if (!ctx) throw new Error('readPixel: 2D canvas context unavailable');
    copy.width = this.renderer.domElement.width;
    copy.height = this.renderer.domElement.height;
    ctx.drawImage(this.renderer.domElement, 0, 0);
    const d = ctx.getImageData(x, y, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.frameCallbacks.clear();
    this.borders?.dispose();
    this.countries?.dispose();
    this.globeMesh.geometry.dispose();
    this.globeMesh.material.dispose();
    (this.atmosphere.material as THREE.Material).dispose();
    this.atmosphere.geometry.dispose();
    this.dotTexture?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.lastFrameMs) / 1000);
    this.lastFrameMs = now;

    this.rig.update(dt, now);
    const pos = this.rig.position(1);
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.lookAt(0, 0, 0);

    for (const cb of this.frameCallbacks) cb(now, dt);
    this.renderer.render(this.scene, this.camera);
    this.ready = true;
  };

  private bindInteraction(): void {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      this.pointerDown = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      this.rig.setAutoRotate(false);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.pointerDown) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      const s = this.rig.state;
      const zoom = s.altitude - 1;
      const k = 0.12 * (1 + zoom * 0.5);
      this.rig.snapTo({
        lat: s.lat + dy * k,
        lng: s.lng - dx * k * 1.2,
        altitude: s.altitude,
      });
    });
    el.addEventListener('pointerup', (e) => {
      this.pointerDown = false;
      el.releasePointerCapture(e.pointerId);
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const s = this.rig.state;
      const nextAlt = s.altitude * (1 + Math.sign(e.deltaY) * 0.06);
      this.rig.startTween({ lat: s.lat, lng: s.lng, altitude: nextAlt }, performance.now(), {
        durationMs: 120,
      });
    });
  }
}
