import { test, expect } from '@playwright/test';
import { setupMocks, openApp } from '../helpers.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const steps = page => page.evaluate(() => S.O.steps.join('>'));

test.describe('iPhone Safari', () => {
  test.use({ userAgent: IPHONE });
  test('welcome > install (iPhone guide) > nickname', async ({ context, page }) => {
    await setupMocks(context, { onboarded: false });
    await openApp(page);
    expect(await steps(page)).toBe('welcome>install>nick');
    await page.click('[data-act=onbNext]');
    await expect(page.locator('.tab.on')).toContainText('iPhone');
    await page.click('[data-os=android]');
    await expect(page.locator('.tab.on')).toContainText('Android');
  });
});

test.describe('Android Chrome', () => {
  test.use({ userAgent: ANDROID });
  test('shows the Android guide by default', async ({ context, page }) => {
    await setupMocks(context, { onboarded: false });
    await openApp(page);
    await page.click('[data-act=onbNext]');
    await expect(page.locator('.tab.on')).toContainText('Android');
  });
});

test('installed app skips the install step; nickname joins the leaderboard', async ({ context, page }) => {
  const fb = await setupMocks(context, { onboarded: false });
  await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  await openApp(page);
  expect(await steps(page)).toBe('welcome>nick');
  await page.click('[data-act=onbNext]');
  await page.fill('input[name=nick]', 'Mia');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => S.screen === 'home');
  expect([...fb.db.keys()].some(k => k.startsWith('players/'))).toBe(true);
  await page.reload();
  await page.waitForFunction(() => S.screen === 'home');                  // shown only once
});

test('vulgar nicknames are refused, look-alike tricks included', async ({ context, page }) => {
  const fb = await setupMocks(context, { onboarded: false });
  await openApp(page);
  await page.click('[data-act=onbNext]');
  for (const bad of ['K.0.k.0.t', 'fvck3r', 'píča']) {
    await page.fill('input[name=nick]', bad);
    await page.keyboard.press('Enter');
    await expect(page.locator('text=Tahle přezdívka není povolená')).toBeVisible();
  }
  expect(fb.db.size).toBe(0);
  await page.fill('input[name=nick]', 'Pikachu');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => S.screen === 'home');
});

test('welcome offers two equal ways in: start without login, or Google', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setupMocks(ctx, { onboarded: false });
  const page = await ctx.newPage();
  await openApp(page);
  await expect(page.locator('.start-choices [data-act=onbNext]')).toContainText('Začít bez přihlášení');
  await expect(page.locator('.start-choices [data-act=google]')).toContainText('Přihlásit přes Google');
  await expect(page.locator('body')).not.toContainText('Už ji používám jinde');
});
