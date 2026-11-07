import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Smoke test for `examples/showcase/index.html`.
 *
 * The studio is a plain inline script with no bundler and no tests: one
 * eagerly-evaluated mistake (a `const` used before it is initialised inside a
 * slider's formatter, say) throws before the studio's own listeners are
 * attached, and the panel silently stops opening. The e2e suite needs Playwright
 * browsers to catch that; this runs the real page's script in jsdom against a
 * permissive stand-in for the library and checks that it survives from top to
 * bottom — and that the studio still opens.
 */

const SHOWCASE = resolve(__dirname, '../../examples/showcase/index.html');

/** The page's own inline script (the one that builds the studio). */
function inlineScript(html: string): string {
  const match = /<script>\n([\s\S]*?)<\/script>/.exec(html);
  const script = match?.[1];
  if (!script) throw new Error('showcase: inline script not found');
  return script;
}

/** Any member, callable and coercible, so the page never trips over the stub. */
function standIn(): unknown {
  const stub: unknown = new Proxy(function () {}, {
    get: (_target, property) => {
      if (property === 'mode') return 'flat';
      if (property === 'then') return undefined;
      if (property === Symbol.toPrimitive) return () => '';
      if (property === 'toString' || property === 'valueOf') return () => '';
      if (property === 'length' || property === 'size') return 0;
      return stub;
    },
    apply: () => stub,
  });
  return stub;
}

let dom: JSDOM | null = null;

afterEach(() => {
  dom?.window.close();
  dom = null;
});

function openShowcase(): { window: Window; document: Document } {
  const html = readFileSync(SHOWCASE, 'utf8');
  const page = new JSDOM(html, {
    url: 'https://example.test/examples/showcase/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  dom = page;
  const library = standIn();
  (page.window as unknown as { RouteDots: unknown }).RouteDots = new Proxy(
    function () {
      return library;
    },
    {
      get: (_target, property) =>
        property === 'fromConfig' ? () => library : (library as object)[property as never],
    },
  );
  page.window.eval(inlineScript(html));
  return { window: page.window as unknown as Window, document: page.window.document };
}

describe('showcase', () => {
  it('runs its inline script from top to bottom', () => {
    expect(() => openShowcase()).not.toThrow();
  });

  it('opens the customization studio when the toggle is clicked', () => {
    const { document } = openShowcase();
    const studio = document.getElementById('studio')!;
    const toggle = document.getElementById('studio-toggle')!;

    expect(studio.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();

    expect(studio.hidden).toBe(false);
    expect(document.body.classList.contains('studio-open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // Every section is built, not just the first one.
    expect(document.querySelectorAll('#studio .row').length).toBeGreaterThan(40);

    toggle.click();
    expect(studio.hidden).toBe(true);
    expect(document.body.classList.contains('studio-open')).toBe(false);
  });

  it('offers the route-zoom floor and ceiling as sliders', () => {
    const { document } = openShowcase();
    const floor = document.getElementById('zoom-min') as HTMLInputElement | null;
    const ceiling = document.getElementById('zoom-max') as HTMLInputElement | null;
    expect(floor).not.toBeNull();
    expect(ceiling).not.toBeNull();
    // Multiples of the world view: 1× is the whole planet.
    expect(floor!.value).toBe('1');
    expect(ceiling!.value).toBe('4');
    expect(Number(floor!.min)).toBeLessThan(1);
    expect(Number(ceiling!.max)).toBeGreaterThanOrEqual(8);
  });

  it('writes the zoom window into the exported config snippet', () => {
    const { document } = openShowcase();
    const code = document.getElementById('studio-code')!.textContent ?? '';
    expect(code).toContain('setOptions');
    expect(code).toContain('"minRouteZoom": 1');
    expect(code).toContain('"maxRouteZoom": 4');
  });
});
