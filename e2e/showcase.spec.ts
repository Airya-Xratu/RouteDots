import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

type Hooks = {
  __rd: {
    getRoute: () => { from: { code: string }; to: { code: string }; roundTrip: boolean } | null;
    setRoute: (f: string, t: string, o?: { roundTrip?: boolean }) => boolean;
    mode: string | null;
  } | null;
};

const showcasePath = fileURLToPath(new URL('../examples/showcase/index.html', import.meta.url));

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

  // Default route is LHR → DXB round trip — and the form reports it.
  const route = await page.evaluate(() => (window as unknown as Hooks).__rd!.getRoute());
  expect(route?.from.code).toBe('LHR');
  expect(route?.to.code).toBe('DXB');
  expect(route?.roundTrip).toBe(true);
  expect(await page.textContent('#hint')).toContain('London → Dubai');

  // Pin badges show the city names at both endpoints.
  await page.waitForFunction(
    () => {
      const pins = Array.from(document.querySelectorAll('.rd-pin'));
      return pins.length === 2 && pins.every((p) => p.style.opacity === '1');
    },
    undefined,
    { timeout: 15_000 },
  );
  const pinNames = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.rd-pin .rd-pin-label')).map((n) => n.textContent),
  );
  expect(pinNames).toEqual(['London', 'Dubai']);

  // Changing the destination updates the route live… and the pin with it.
  await page.selectOption('#to', 'SIN');
  await page.waitForTimeout(300);
  const route2 = await page.evaluate(() => (window as unknown as Hooks).__rd!.getRoute());
  expect(route2?.to.code).toBe('SIN');
  expect(await page.textContent('#hint')).toContain('Singapore');
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.rd-pin .rd-pin-label'))
        .map((n) => n.textContent)
        .join('|') === 'London|Singapore',
    undefined,
    { timeout: 5_000 },
  );

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

  // The theme switcher flips light/dark live without errors.
  await page.click('#theme');
  expect(await page.textContent('#theme')).toBe('☀️');
  await page.click('#theme');
  expect(await page.textContent('#theme')).toBe('🌙');

  // Selecting the same city twice is rejected gracefully.
  await page.selectOption('#from', 'LHR');
  await page.selectOption('#to', 'LHR');
  await page.waitForTimeout(200);
  const hint = await page.textContent('#hint');
  expect(hint).toContain('two different cities');

  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('showcase without the built bundle explains what to do', async ({ page }) => {
  // Strip the external IIFE script so the page simulates a fresh clone that
  // has not been built yet.
  const html = readFileSync(showcasePath, 'utf8').replace(
    /<script src="[^"]*routedots[^"]*"><\/script>/,
    '',
  );
  await page.setContent(html);

  const note = page.locator('.build-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('npm run build');
  await expect(page.evaluate(() => (window as unknown as { __rd?: unknown }).__rd)).toBeFalsy();
});
