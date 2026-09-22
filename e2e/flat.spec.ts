import { expect, test } from '@playwright/test';

type Hooks = {
  __state: { ready: boolean; error: string | null };
  __flat: { dispose: () => void } | null;
};

test('flat fallback draws both routes and flies the plane', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  const here = new URL('./fixtures/flat.html', import.meta.url);
  await page.goto(here.href);
  const state = await page.evaluate(() => (window as unknown as Hooks).__state);
  expect(state.error, `fixture error: ${state.error}`).toBeNull();

  // Two route paths (outbound + return) and two endpoint markers.
  const counts = await page.evaluate(() => {
    const svg = document.querySelector('svg');
    const routes = svg?.querySelectorAll('path[stroke]') ?? [];
    return {
      paths: routes.length,
      markers: svg?.querySelectorAll('circle').length ?? 0,
      dashed: Array.from(routes).every((p) => p.getAttribute('stroke-dasharray')?.includes(' ')),
    };
  });
  expect(counts.paths).toBe(2);
  expect(counts.markers).toBe(2);
  expect(counts.dashed).toBe(true);

  // The plane animates along the outbound path.
  const readPlaneTransform = () =>
    page.evaluate(() => {
      const groups = document.querySelectorAll('svg g');
      return groups.length >= 2 ? (groups[1] as SVGGElement).getAttribute('transform') : null;
    });
  const t1 = await readPlaneTransform();
  await page.waitForTimeout(700);
  const t2 = await readPlaneTransform();
  expect(t1).not.toBeNull();
  expect(t2).not.toBeNull();
  expect(t1).not.toBe(t2);

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});
