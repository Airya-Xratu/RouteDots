import { expect, test } from '@playwright/test';

type Hooks = {
  __rd: {
    getRoute: () => { from: { code: string }; to: { code: string }; roundTrip: boolean } | null;
    setRoute: (f: string, t: string, o?: { roundTrip?: boolean }) => boolean;
    mode: string | null;
  } | null;
};

test('showcase hero: form drives the globe route', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  const here = new URL('../examples/showcase/index.html', import.meta.url);
  await page.goto(here.href);

  await page.waitForFunction(
    () => {
      const rd = (window as unknown as { __rd?: { mode: string | null } }).__rd;
      return Boolean(rd && rd.mode !== null);
    },
    undefined,
    { timeout: 30_000 },
  );

  // Default route is LHR → DXB round trip.
  const route = await page.evaluate(() => (window as unknown as Hooks).__rd!.getRoute());
  expect(route?.from.code).toBe('LHR');
  expect(route?.to.code).toBe('DXB');
  expect(route?.roundTrip).toBe(true);

  // Changing the destination updates the route live.
  await page.selectOption('#to', 'SIN');
  await page.waitForTimeout(300);
  const route2 = await page.evaluate(() => (window as unknown as Hooks).__rd!.getRoute());
  expect(route2?.to.code).toBe('SIN');

  // One-way toggle drops the return arc; swap exchanges endpoints.
  await page.click('#one-way');
  await page.waitForTimeout(300);
  const route3 = await page.evaluate(() => (window as unknown as Hooks).__rd!.getRoute());
  expect(route3?.roundTrip).toBe(false);

  await page.click('#swap');
  await page.waitForTimeout(300);
  const route4 = await page.evaluate(() => (window as unknown as Hooks).__rd!.getRoute());
  expect(route4?.from.code).toBe('SIN');
  expect(route4?.to.code).toBe('LHR');

  // Selecting the same city twice is rejected gracefully.
  await page.selectOption('#from', 'LHR');
  await page.selectOption('#to', 'LHR');
  await page.waitForTimeout(200);
  const hint = await page.textContent('#hint');
  expect(hint).toContain('two different cities');

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});
