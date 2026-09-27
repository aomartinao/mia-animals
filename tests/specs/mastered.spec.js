import { test, expect } from '@playwright/test';
import { setupMocks, openApp, answer } from '../helpers.js';

test.beforeEach(async ({ context }) => { await setupMocks(context); });

test('home shows all 7 groups at once in full-width rows, overall progress bar', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.group')).toHaveCount(7);
  const vw = page.viewportSize().width;
  const boxes = await page.$$eval('.group', gs => gs.map(g => g.getBoundingClientRect()).map(r => ({ l: r.left, r: r.right })));
  for (const b of boxes) { expect(b.l).toBeGreaterThanOrEqual(0); expect(b.r).toBeLessThanOrEqual(vw); }
  await expect(page.locator('.overall .ov-num')).toHaveText('0 / 147');
  await expect(page.locator('.progress-card')).toHaveCount(0);
  // every row of group chips spans the full width
  const rows = await page.$$eval('.group', gs => { const m = {}; gs.forEach(g => { const r = g.getBoundingClientRect(); (m[Math.round(r.top)] ||= []).push(r); }); return Object.values(m).map(rs => [Math.min(...rs.map(r => r.left)), Math.max(...rs.map(r => r.right))]); });
  const container = await page.$eval('.groups', e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; });
  for (const [l, r] of rows) { expect(Math.abs(l - container[0])).toBeLessThan(2); expect(Math.abs(r - container[1])).toBeLessThan(2); }
});

test('"umím na 100 %" in a lesson removes the animal from training but not from the exam', async ({ page }) => {
  await openApp(page);
  await page.click('[data-act=toggleAll]');
  await page.click('[data-group=par]');                                    // 6 sharks & co.
  await page.click('[data-act=lesson]');
  let it = await page.evaluate(() => S.L.queue[S.L.i]);
  while ((await page.evaluate(() => S.L.queue[S.L.i].type)) !== 'intro') { await answer(page); await page.keyboard.press('Enter'); }
  const id = await page.evaluate(() => S.L.queue[S.L.i].a.id);
  await expect(page.locator('.intro-head [data-act=mastered]')).toHaveText('✓ Tohle znám – už neukazovat');
  await page.click('[data-act=mastered]');
  expect(await page.evaluate(id => prog(ANIMALS.find(a => a.id === id)).done, id)).toBe(1);
  const rest = await page.evaluate(id => S.L.queue.slice(S.L.i).filter(q => q.a.id === id).length, id);
  expect(rest).toBe(0);                                                     // its later questions are gone
  await page.evaluate(() => go('home'));
  expect(await page.evaluate(() => trainPool().map(a => a.id))).not.toContain(id);
  expect(await page.evaluate(() => imgPool().map(a => a.id))).toContain(id);          // exam/duels still use it
  await expect(page.locator('.overall .ov-num')).toHaveText('1 / 147');
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

test('"Tohle znám" is offered only on the first appearance of an animal in a lesson', async ({ page }) => {
  await openApp(page);
  await page.click('[data-act=lesson]');
  const firsts = await page.evaluate(() => { const seen = new Set(); return S.L.queue.map(it => { const f = !seen.has(it.a.id); seen.add(it.a.id); return f === !!it.offerKnow; }); });
  expect(firsts.every(Boolean)).toBe(true);
  // play on, answering correctly; the option must never show on a repeated animal
  const shownFor = new Set();
  while (await page.evaluate(() => S.screen) === 'lesson') {
    const info = await page.evaluate(() => ({ id: S.L.queue[S.L.i].a.id, type: S.L.queue[S.L.i].type }));
    const it = await answer(page);
    if (await page.locator('[data-act=mastered]').count()) {
      expect(shownFor.has(info.id)).toBe(false);
      shownFor.add(info.id);
    }
    if (it.type !== 'intro') await page.keyboard.press('Enter');
  }
});

test('home: with all groups selected, tapping one keeps just that group; later taps add and remove', async ({ page }) => {
  await openApp(page);
  const all = await page.evaluate(() => GROUPS.length);
  expect(await page.evaluate(() => SELECTED.length)).toBe(all);
  await page.click('[data-group=par]');
  expect(await page.evaluate(() => SELECTED)).toEqual(['par']);
  const other = await page.evaluate(() => GROUPS.find(g => g.id !== 'par').id);
  await page.click(`[data-group=${other}]`);
  expect(await page.evaluate(() => SELECTED.sort())).toEqual(['par', other].sort());
  await page.click('[data-group=par]');
  expect(await page.evaluate(() => SELECTED)).toEqual([other]);
  await page.click('[data-act=toggleAll]');
  expect(await page.evaluate(() => SELECTED.length)).toBe(all);
});
