import { test, expect } from '@playwright/test';
import { setupMocks, openApp, answer, playThrough } from '../helpers.js';

const CZECH = /[ěščřžýáíéůúťďňĚŠČŘŽÝÁÍÉŮÚŤĎŇ]/;
const noCzech = async page => {
  const text = await page.evaluate(() => document.body.innerText.replace('Česky', '').replace(/Galápagos/g, ''));   // the switch back to Czech; a real English name
  expect(text.match(new RegExp(`.{0,30}${CZECH.source}.{0,30}`))?.[0] ?? null).toBeNull();
};

test('English: the whole app is in English, animal names included', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setupMocks(ctx, { lang: 'en' });
  const page = await ctx.newPage();
  await openApp(page);
  expect(await page.evaluate(() => [document.documentElement.lang, EN])).toEqual(['en', true]);
  await expect(page.locator('.t-lesson .tt')).toHaveText('Lesson');
  await expect(page.locator('.group').first()).toContainText('Jawless fish');
  await noCzech(page);
  // Atlas + detail
  await page.click('[data-act=atlas]');
  await expect(page.locator('[data-open="kapr obecný"] .an')).toContainText('common carp');
  await noCzech(page);
  await page.fill('[data-search]', 'carp');
  await page.click('[data-open="kapr obecný"]');
  await expect(page.locator('.detail a.know-btn')).toHaveAttribute('href', /en\.wikipedia\.org\/wiki\/Cyprinus/);
  await noCzech(page);
  await page.click('.detail-close [data-act=closeModal]');
  await page.click('[data-act=home]');
  // A lesson, question by question
  await page.click('[data-act=lesson]');
  for (let i = 0; i < 6; i++) { await noCzech(page); const it = await answer(page); if (it.type !== 'intro') await page.keyboard.press('Enter'); }
  await page.click('.lesson-top [data-act=quit]');
  for (const act of ['board', 'duels', 'feedback']) {
    await page.evaluate(() => go('home'));
    await page.click(`[data-act=${act}]`);
    await noCzech(page);
  }
});

test('English typed answers accept the usual names and small typos', async ({ browser }) => {
  const ctx = await browser.newContext();
  await setupMocks(ctx, { lang: 'en' });
  const page = await ctx.newPage();
  await openApp(page);
  const check = (id, typed) => page.evaluate(([id, typed]) => checkTyped(typed, findAnimal(id)), [id, typed]);
  expect(await check('kapr obecný', 'Common Carp')).toBe('ok');
  expect(await check('kapr obecný', 'carp')).toBe('ok');
  expect(await check('kapr obecný', 'comon carp')).toBe('typo');
  expect(await check('kapr obecný', 'pike')).toBe('wrong');
  expect(await check('slepýš křehký', 'slow-worm')).toBe('ok');
  expect(await check('želva sloní', 'galapagos tortoise')).toBe('ok');
  expect(await check('ďábel medvědovitý', 'tasmanian devil')).toBe('ok');
  // every animal has an English name
  expect(await page.evaluate(() => ANIMALS.filter(a => a.name === a.cz).map(a => a.cz))).toEqual([]);
});

test('language follows the device first, then the switch on home (progress kept)', async ({ browser }) => {
  for (const [locale, lang] of [['cs-CZ', 'cs'], ['en-GB', 'en'], ['de-DE', 'en']]) {
    const ctx = await browser.newContext({ locale });
    await setupMocks(ctx, { lang: null });
    const page = await ctx.newPage();
    await openApp(page);
    expect(await page.evaluate(() => LANG)).toBe(lang);
    await ctx.close();
  }
  const ctx = await browser.newContext();
  await setupMocks(ctx);                       // Czech
  const page = await ctx.newPage();
  await openApp(page);
  await page.evaluate(() => { STATS.xp = 42; store.set(K.stats, STATS); });
  await page.click('[data-act=lang]');
  await page.waitForFunction(() => typeof S !== 'undefined' && S.screen === 'home' && EN);
  expect(await page.evaluate(() => STATS.xp)).toBe(42);
  await expect(page.locator('[data-act=lang]')).toContainText('Česky');
});

test('English: onboarding, a finished lesson and the practice test have no Czech left', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setupMocks(ctx, { lang: 'en', onboarded: false });
  const page = await ctx.newPage();
  await openApp(page);
  await expect(page.locator('.start-choices [data-act=onbNext]')).toContainText('Start without signing in');
  await noCzech(page);
  await page.click('.start-choices [data-act=onbNext]');
  await noCzech(page);                                  // nickname step
  await page.click('[data-act=onbNext]');
  await page.click('[data-act=lesson]');
  await playThrough(page, { wrongAt: [2] });
  await noCzech(page);                                  // lesson end with a mistake to review
  await page.click('[data-act=home]');
  await page.click('[data-act=exam]');
  await page.fill('input[name=ans]', 'nope');
  await page.keyboard.press('Enter');
  await noCzech(page);                                  // wrong-answer feedback
});
