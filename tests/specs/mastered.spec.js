import { test, expect } from '@playwright/test';
import { setupMocks, openApp, answer } from '../helpers.js';

test.beforeEach(async ({ context }) => { await setupMocks(context); });

test('home shows all 7 groups at once, progress next to the logo', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.group')).toHaveCount(7);
  const vw = page.viewportSize().width;
  const boxes = await page.$$eval('.group', gs => gs.map(g => g.getBoundingClientRect()).map(r => ({ l: r.left, r: r.right })));
  for (const b of boxes) { expect(b.l).toBeGreaterThanOrEqual(0); expect(b.r).toBeLessThanOrEqual(vw); }
  await expect(page.locator('.brand-text small')).toContainText('Umíš 0 z 147');
  await expect(page.locator('.progress-card')).toHaveCount(0);
});

test('"umím na 100 %" in a lesson removes the animal from training but not from the exam', async ({ page }) => {
  await openApp(page);
  await page.click('[data-act=toggleAll]');
  await page.click('[data-group=par]');                                    // 6 sharks & co.
  await page.click('[data-act=lesson]');
  let it = await page.evaluate(() => S.L.queue[S.L.i]);
  while ((await page.evaluate(() => S.L.queue[S.L.i].type)) !== 'intro') { await answer(page); await page.keyboard.press('Enter'); }
  const id = await page.evaluate(() => S.L.queue[S.L.i].a.id);
  await page.click('[data-act=mastered]');
  expect(await page.evaluate(id => prog(ANIMALS.find(a => a.id === id)).done, id)).toBe(1);
  const rest = await page.evaluate(id => S.L.queue.slice(S.L.i).filter(q => q.a.id === id).length, id);
  expect(rest).toBe(0);                                                     // its later questions are gone
  await page.evaluate(() => go('home'));
  expect(await page.evaluate(() => trainPool().map(a => a.id))).not.toContain(id);
  expect(await page.evaluate(() => imgPool().map(a => a.id))).toContain(id);          // exam/duels still use it
  await expect(page.locator('.brand-text small')).toContainText('Umíš 1 z 147');
});

test('mastered button only after a correct answer, never in the exam', async ({ page }) => {
  await openApp(page);
  await page.click('[data-act=lesson]');
  while ((await page.evaluate(() => S.L.queue[S.L.i].type)) === 'intro') await page.click('[data-act=next]');
  await answer(page, { wrong: true });
  await expect(page.locator('[data-act=mastered]')).toHaveCount(0);
  await page.evaluate(() => go('home'));
  await page.click('[data-act=exam]');
  await answer(page);
  await expect(page.locator('[data-act=mastered]')).toHaveCount(0);
});

test('Atlas detail can mark and un-mark an animal; flashcards skip mastered ones', async ({ page }) => {
  await openApp(page);
  await page.click('[data-act=atlas]');
  await page.click('[data-open="kapr obecný"]');
  await page.click('[data-act=toggleMastered]');
  await expect(page.locator('.mastered-note')).toBeVisible();
  await page.click('[data-act=toggleMastered]');
  await expect(page.locator('.mastered-note')).toHaveCount(0);
  expect(await page.evaluate(() => prog(ANIMALS.find(a => a.id === 'kapr obecný')).done)).toBe(0);
  // master every animal but one group member -> flashcards only show the rest
  await page.evaluate(() => { ANIMALS.filter(a => a.g === 'par' && a.id !== 'manta obrovská').forEach(a => setMastered(a, true)); SELECTED = ['par']; go('home'); });
  await page.click('[data-act=cards]');
  expect(await page.evaluate(() => S.C.queue.map(a => a.id))).toEqual(['manta obrovská']);
  await page.click('[data-act=flip]');
  await page.click('[data-act=cardMastered]');
  await page.evaluate(() => go('home'));
  page.once('dialog', d => { expect(d.message()).toContain('na 100 %'); d.accept(); });
  await page.click('[data-act=lesson]');
  expect(await page.evaluate(() => S.screen)).toBe('home');
});
