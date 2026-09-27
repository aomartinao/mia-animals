import { test, expect } from '@playwright/test';
import { setupMocks, openApp, answer } from '../helpers.js';

test.use({ hasTouch: true });
test.beforeEach(async ({ context }) => { await setupMocks(context); });

const visibleNames = page => page.$$eval('.acard', cs => cs.filter(c => !c.hidden).map(c => c.innerText.split('\n')[0]));

test('search: Czech, without diacritics, Latin, group; empty state', async ({ page }) => {
  await openApp(page);
  await page.click('[data-act=atlas]');
  await page.fill('[data-search]', 'zelena');
  expect(await visibleNames(page)).toEqual(['ropucha zelená', 'rosnička zelená', 'žluna zelená']);
  await page.fill('[data-search]', 'bufo');
  expect(await visibleNames(page)).toEqual(['ropucha obecná', 'ropucha zelená']);
  await page.fill('[data-search]', 'ptaci');
  expect((await visibleNames(page)).length).toBe(53);
  await page.fill('[data-search]', 'xyz');
  await expect(page.locator('.search-empty')).toBeVisible();
});

test('hide names and the whole/crop photo switch (remembered)', async ({ page }) => {
  await openApp(page);
  await page.click('[data-act=atlas]');
  await page.click('[data-act=hideNames]');
  await expect(page.locator('.acard .an').first()).toContainText('? ? ?');
  const fit = () => page.$eval('.acard .pic img', i => getComputedStyle(i).objectFit);
  expect(await fit()).toBe('cover');
  await page.click('[data-act=photoMode]');
  expect(await fit()).toBe('contain');
  await page.reload();
  await page.waitForFunction(() => S.screen === 'home');
  expect(await page.evaluate(() => WHOLE)).toBe(true);
});

test('detail: full screen, swipe photos with dots, hide the current photo, close', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await openApp(page);
  await page.click('[data-act=atlas]');
  await page.click('[data-open="kapr obecný"]');
  const slides = await page.locator('.slide').count();
  expect(slides).toBeGreaterThan(1);
  await expect(page.locator('.cdots i')).toHaveCount(slides);
  const heights = await page.$$eval('.slide', s => new Set(s.map(x => x.clientHeight)).size);
  expect(heights).toBe(1);                                                  // fixed height, no jumping
  await page.$eval('[data-carousel]', c => c.scrollTo({ left: c.clientWidth }));
  await expect(page.locator('.cdots i').nth(1)).toHaveClass(/on/);
  await page.click('[data-act=badImg]');
  await expect(page.locator('.slide')).toHaveCount(slides - 1);
  await page.click('.detail-close [data-act=closeModal]');
  expect(await page.evaluate(() => S.open)).toBeNull();
});

test('easter egg: triple tap or long press on the chimp, resets on reopen', async ({ page }) => {
  await openApp(page);
  await page.click('[data-act=atlas]');
  await page.click('[data-open="šimpanz učenlivý"]');
  const name = page.locator('.detail .intro-name');
  const box = await page.locator('.slide').first().boundingBox();
  for (let i = 0; i < 3; i++) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(name).toContainText('Mia, la mia scimmia');
  await page.click('.detail-close [data-act=closeModal]');
  await page.click('[data-open="šimpanz učenlivý"]');
  await expect(name).toContainText('šimpanz učenlivý');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  await expect(name).toContainText('Mia, la mia scimmia');
  await page.click('.detail-close [data-act=closeModal]');
  await page.click('[data-open="kapr obecný"]');
  const kbox = await page.locator('.slide').first().boundingBox();
  for (let i = 0; i < 3; i++) await page.touchscreen.tap(kbox.x + kbox.width / 2, kbox.y + kbox.height / 2);
  await expect(page.locator('.detail .intro-name')).toContainText('kapr obecný');
});

test('easter egg never shows in the exam', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const a = ANIMALS.find(x => x.id === 'šimpanz učenlivý');
    go('lesson', { L: { queue: [{ a, type: 'type', img: pickImg(a) }], i: 0, done: 0, total: 1, questions: 0, firstQs: 0, firstTry: 0, xp: 0, mistakes: [], seenWrong: new Set(), exam: true, points: 0 } });
  });
  await answer(page);
  const box = await page.locator('.pic').first().boundingBox();
  for (let i = 0; i < 3; i++) await page.touchscreen.tap(box.x + box.width / 2, box.y + 30);
  expect(await page.evaluate(() => EGG)).toBe(false);
});

for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test(`detail: "Zavřít" is on screen without scrolling (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await openApp(page);
    await page.click('[data-act=atlas]');
    await page.click('[data-open="žralok bílý"]');
    const box = await page.locator('.detail-close [data-act=closeModal]').boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    await page.click('.detail-close [data-act=closeModal]');
    expect(await page.evaluate(() => S.open)).toBeNull();
  });
}

for (const width of [340, 390]) {
  test(`detail: the three actions fit on one row (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openApp(page);
    await page.click('[data-act=atlas]');
    await page.click('[data-open="kapr obecný"]');
    const boxes = await page.$$eval('.detail-actions > *', els => els.map(e => e.getBoundingClientRect()).map(r => ({ top: Math.round(r.top), right: r.right })));
    expect(boxes.length).toBe(3);
    expect(new Set(boxes.map(b => b.top)).size).toBe(1);
    for (const b of boxes) expect(b.right).toBeLessThanOrEqual(width);
  });
}

test('detail: actions and Zavřít sit at the bottom edge; ‹ › browse animals (within search)', async ({ page }) => {
  await openApp(page);
  await page.click('[data-act=atlas]');
  await page.click('[data-open="kapr obecný"]');
  const vh = page.viewportSize().height;
  const bar = await page.locator('.detail-close').boundingBox();
  expect(Math.round(bar.y + bar.height)).toBeGreaterThanOrEqual(vh - 2);   // pinned to the bottom
  await page.click('[data-act=nextAnimal]');
  await expect(page.locator('.detail .intro-name')).toContainText('lín obecný');
  await page.click('[data-act=prevAnimal]');
  await page.click('[data-act=prevAnimal]');
  await expect(page.locator('.detail .intro-name')).toContainText('chiméra podivná');
  await page.click('.detail-close [data-act=closeModal]');
  await page.fill('[data-search]', 'ropucha');
  await page.click('[data-open="ropucha obecná"]');
  await expect(page.locator('[data-act=prevAnimal]')).toBeDisabled();
  await page.click('[data-act=nextAnimal]');
  await expect(page.locator('.detail .intro-name')).toContainText('ropucha zelená');
  await expect(page.locator('[data-act=nextAnimal]')).toBeDisabled();
});

test('group filter chips; group link in the detail; ‹ › stay inside the group', async ({ page }) => {
  await openApp(page);
  await page.click('[data-act=atlas]');
  await expect(page.locator('.afilter.on')).toHaveText('Vše');
  await page.click('.afilter[data-g=par]');
  expect(await visibleNames(page)).toEqual(['máčka skvrnitá', 'žralok bílý', 'žralok obrovský', 'kladivoun obecný', 'manta obrovská', 'chiméra podivná']);
  await page.fill('[data-search]', 'zralok');                                 // filter + search combine
  expect(await visibleNames(page)).toEqual(['žralok bílý', 'žralok obrovský']);
  await page.fill('[data-search]', '');
  await page.click('[data-open="chiméra podivná"]');
  await expect(page.locator('[data-act=nextAnimal]')).toBeDisabled();       // last paryba
  await page.click('[data-act=prevAnimal]');
  await expect(page.locator('.detail .intro-name')).toContainText('manta obrovská');
  // group link: from a fish detail jump to the whole "Ryby" group
  await page.click('.detail-close [data-act=closeModal]');
  await page.click('.afilter[data-g=""]');
  await page.click('[data-open="kapr obecný"]');
  await page.click('.detail [data-act=openGroup]');
  expect(await page.evaluate(() => S.open)).toBeNull();
  await expect(page.locator('.afilter.on')).toContainText('Ryby');
  expect((await visibleNames(page)).length).toBe(13);
});

test('detail: the action pills keep a clear gap above ‹ Zavřít ›', async ({ page }) => {
  await openApp(page);
  await page.click('[data-act=atlas]');
  await page.click('[data-open="kapr obecný"]');
  const pills = await page.locator('.detail-actions').boundingBox();
  const nav = await page.locator('.detail-nav').boundingBox();
  expect(nav.y - (pills.y + pills.height)).toBeGreaterThanOrEqual(16);
});
