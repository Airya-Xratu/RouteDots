import { describe, expect, it } from 'vitest';
import { buildPlanePath, planePathData, segmentsToPathData } from '../planeSilhouette.js';
import { PLANE_ICON_NAMES, PLANE_ICON_PRESETS, PLANE_ICON_SIZE, PlaneIcon } from '../PlaneIcon.js';

describe('segmentsToPathData', () => {
  it('serializes every segment kind into SVG path data', () => {
    const d = segmentsToPathData([
      { op: 'move', x: 0, y: -50 },
      { op: 'line', x: 10, y: 0 },
      { op: 'quad', cx: 5, cy: 5, x: 0, y: 10 },
      { op: 'close' },
    ]);
    expect(d).toBe('M0,-50 L10,0 Q5,5 0,10 Z');
  });

  it('rounds and normalizes negative zero', () => {
    const d = segmentsToPathData([{ op: 'move', x: -0.001, y: 1.239 }], 2);
    expect(d).toBe('M0,1.24');
  });

  it('serializes the default airliner outline', () => {
    const d = planePathData();
    expect(d).toBe(segmentsToPathData(buildPlanePath()));
    expect(d.startsWith('M0,-50')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    // one subpath per fuselage / wing / tail piece (1 + 2 + 2)
    expect(d.split('M').length - 1).toBe(5);
  });
});

describe('PlaneIcon', () => {
  it('defaults to the airliner preset', () => {
    const icon = PlaneIcon.from();
    expect(icon.name).toBe('airliner');
    expect(icon.path).toBe(PLANE_ICON_PRESETS.airliner.path);
    expect(icon.viewBox).toBe(PLANE_ICON_SIZE);
    expect(icon.isCustom).toBe(false);
  });

  it('resolves every built-in preset by name', () => {
    for (const name of PLANE_ICON_NAMES) {
      const icon = PlaneIcon.from(name);
      expect(icon.name).toBe(name);
      expect(icon.path).toBeTruthy();
      expect(icon.viewBox).toBeGreaterThan(0);
    }
  });

  it('falls back to the airliner for unknown names', () => {
    // @ts-expect-error — runtime robustness for JS callers
    expect(PlaneIcon.from('spaceship').name).toBe('airliner');
  });

  it('accepts custom SVG path data', () => {
    const icon = PlaneIcon.from({ path: 'M0,-40 L20,20 L-20,20 Z', viewBox: 80 });
    expect(icon.path).toBe('M0,-40 L20,20 L-20,20 Z');
    expect(icon.viewBox).toBe(80);
    expect(icon.name).toBe('custom');
  });

  it('accepts a custom draw function (a fully custom component)', () => {
    const icon = PlaneIcon.from({
      name: 'triangle',
      draw: () => undefined,
    });
    expect(icon.isCustom).toBe(true);
    expect(icon.name).toBe('triangle');
  });

  it('accepts a raster image', () => {
    const image = { width: 32, height: 32 } as unknown as CanvasImageSource;
    const icon = PlaneIcon.from({ name: 'logo', image });
    expect(icon.image).toBe(image);
    expect(icon.path).toBeNull();
  });

  it('passes PlaneIcon instances straight through', () => {
    const icon = PlaneIcon.from('jet');
    expect(PlaneIcon.from(icon)).toBe(icon);
  });

  it('renders standalone SVG markup (path presets and rasters)', () => {
    const markup = PlaneIcon.from('dot').toSVG({ size: 32, color: '#f00', className: 'rd-icon' });
    expect(markup).toContain('class="rd-icon"');
    expect(markup).toContain('width="32"');
    expect(markup).toContain(`d="${PLANE_ICON_PRESETS.dot.path}"`);
    expect(markup).toContain('fill="#f00"');
  });
});
