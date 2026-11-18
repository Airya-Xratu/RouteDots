// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { resolvePalette } from '../theme.js';

vi.mock('../flat/FlatRouteMap.js', () => ({
  FlatRouteMap: class {
    activePalette = resolvePalette('light');
    onDrawn = null;
    reframe = vi.fn();
    applyStyle = vi.fn();
    dispose = vi.fn();
  },
}));

import { RouteDots } from '../RouteDots.js';

describe('map padding', () => {
  it('applies live insets, merges sides, resets on replacement and preserves host content', () => {
    const host = document.createElement('div');
    host.innerHTML = '<button>Hero card</button>';
    document.body.appendChild(host);
    const rd = new RouteDots(host, { world: 'flat', padding: { left: 200, top: 10 } });
    const viewport = host.querySelector<HTMLElement>('[data-rd-viewport]')!;
    expect(viewport.style.left).toBe('200px');
    expect(viewport.style.top).toBe('10px');
    expect(viewport.style.right).toBe('0px');
    const flat = rd.getFlatMap()!;
    rd.setOptions({ padding: { right: 30, top: -1 } });
    expect(viewport.style.left).toBe('200px');
    expect(viewport.style.right).toBe('30px');
    expect(viewport.style.top).toBe('0px');
    expect(flat.reframe).toHaveBeenCalledOnce();
    expect(flat.applyStyle).not.toHaveBeenCalled();
    expect(rd.getOptions().padding).toEqual({ left: 200, top: -1, right: 30 });
    rd.replaceOptions({ world: 'flat' });
    expect(viewport.style.left).toBe('0px');
    expect(viewport.style.right).toBe('0px');
    rd.dispose();
    expect(host.querySelector('[data-rd-viewport]')).toBeNull();
    expect(host.querySelector('button')?.textContent).toBe('Hero card');
    host.remove();
  });
});
