import { test, expect } from '@playwright/test';
import { setupMocks, openApp, playThrough, answer, trackErrors } from '../helpers.js';

test.beforeEach(async ({ context }) => { await setupMocks(context); });

test('a lesson runs to the end, wrong answers come back, XP is added', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await page.click('[data-act=lesson]');
  const total0 = await page.evaluate(() => S.L.total);
  const { types } = await playThrough(page, { wrongAt: [1] });
  expect(await page.evaluate(() => S.screen)).toBe('lessonEnd');
  expect(types.has('intro')).toBe(true);
  expect(await page.evaluate(() => S.L.total)).toBeGreaterThan(total0);   // the wrong one was re-queued
  expect(await page.evaluate(() => STATS.xp)).toBeGreaterThan(0);
  await expect(page.locator('.mistake')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('mock exam grades typed answers; diacritics slip is half a point', async ({ page }) => {
  await openApp(page);
  await page.click('[data-act=toggleAll]');
  await page.click('[data-group=par]');                                  // 6 animals
  await page.click('[data-act=exam]');
  const names = await page.evaluate(() => S.L.queue.map(i => i.a.cz));
  for (let k = 0; k < names.length; k++) {
    const typed = k === 0 ? 'nevím' : k === 1 ? names[1].normalize('NFD').replace(/[̀-ͯ]/g, '') : names[k];
    await page.fill('input[name=ans]', typed);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
  }
  expect(await page.evaluate(() => S.screen)).toBe('lessonEnd');
  const expected = 4 + (names[1] === names[1].normalize('NFD').replace(/[̀-ͯ]/g, '') ? 1 : 0.5);
  expect(await page.evaluate(() => S.L.points)).toBe(expected);
  await expect(page.locator('.grade')).toBeVisible();
});

test('the photo is not reloaded (no blink) after answering', async ({ page }) => {
  await openApp(page);
  await page.click('[data-act=exam]');
  for (let k = 0; k < 3; k++) {
    await page.waitForFunction(() => { const i = document.querySelector('.pic img'); return i && i.complete && i.naturalWidth > 0; });
    await page.evaluate(() => { document.querySelector('.pic img').dataset.mark = 'kept'; });
    await answer(page);
    expect(await page.evaluate(() => document.querySelector('.pic img').dataset.mark)).toBe('kept');
    await page.keyboard.press('Enter');
  }
});
