import { test, expect } from '@playwright/test';
import { setupMocks, openApp } from '../helpers.js';

// Headless Chromium has no notch, so check that the iPhone safe-area insets are
// wired into the rules that position content at the top of the screen.
test('top of the screen respects the iPhone status bar (safe-area-inset-top)', async ({ context, page }) => {
  await setupMocks(context);
  await openApp(page);
  const rules = await page.evaluate(() => {
    const out = {};
    for (const sheet of document.styleSheets) { let rs = []; try { rs = sheet.cssRules; } catch (e) { continue; } for (const r of rs) {
      if (['#app', '.sticky-head', '.modal-bg'].includes(r.selectorText)) out[r.selectorText] = r.style.cssText;
    }
    }
    return out;
  });
  for (const sel of ['#app', '.sticky-head', '.modal-bg']) expect(rules[sel]).toContain('safe-area-inset-top');
  expect(await page.$eval('meta[name=viewport]', m => m.content)).toContain('viewport-fit=cover');
});
