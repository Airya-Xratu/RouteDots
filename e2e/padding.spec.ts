import { expect, test } from '@playwright/test';

type Instance = {
  mode: string | null;
  setOptions: (options: Record<string, unknown>) => void;
  replaceOptions: (options: Record<string, unknown>) => void;
  getOptions: () => { padding?: Record<string, number> };
  getRoute: () => unknown;
  dispose: () => void;
};
type Hooks = { __rd: { flat: Instance; globe: Instance }; __state: { error: string | null } };

test('padding updates both worlds, survives remounts, and preserves overlay content', async ({
  page,
}) => {
  await page.goto(new URL('./fixtures/customize.html', import.meta.url).href);
  expect(await page.evaluate(() => (window as unknown as Hooks).__state.error)).toBeNull();
  for (const world of ['flat', 'globe'] as const) {
    const host = page.locator(`#${world}`);
    const viewport = host.locator('[data-rd-viewport]');
    await page.evaluate((name) => {
      const host = document.getElementById(name)!;
      const card = document.createElement('div');
      card.id = `${name}-card`;
      host.appendChild(card);
      (window as unknown as Hooks).__rd[name].setOptions({
        padding: { left: 120, right: 40, top: 30, bottom: 50 },
      });
    }, world);
    const outer = (await host.boundingBox())!;
    const inner = (await viewport.boundingBox())!;
    expect(inner.x - outer.x).toBeCloseTo(120);
    expect(inner.y - outer.y).toBeCloseTo(30);
    expect(inner.width).toBeCloseTo(outer.width - 160);
    expect(inner.height).toBeCloseTo(outer.height - 80);
    expect(
      await page.evaluate((name) => (window as unknown as Hooks).__rd[name].getRoute(), world),
    ).toBeTruthy();
    await page.evaluate(
      (name) =>
        (window as unknown as Hooks).__rd[name].setOptions({
          padding: { left: 60 },
          surface: 'dots',
        }),
      world,
    );
    await expect(viewport).toHaveCSS('left', '60px');
    await expect(viewport).toHaveCSS('right', '40px');
    await page.evaluate(
      (name) => (window as unknown as Hooks).__rd[name].replaceOptions({ world: 'flat' }),
      world,
    );
    await expect(viewport).toHaveCSS('left', '0px');
    await expect(viewport).toHaveCSS('right', '0px');
    await page.evaluate((name) => (window as unknown as Hooks).__rd[name].dispose(), world);
    await expect(host.locator(`#${world}-card`)).toHaveCount(1);
    await expect(viewport).toHaveCount(0);
  }
});
