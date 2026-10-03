import { test, expect } from '@playwright/test';
import { setupMocks, openApp, playThrough, FakeFirebase } from '../helpers.js';

const device = async (browser, fb, init) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setupMocks(ctx, { firebase: fb });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  return page;
};

test('Google login: progress and nickname follow the account to another device; logout clears the device', async ({ browser }) => {
  const fb = new FakeFirebase();
  const phone = await device(browser, fb);
  await openApp(phone);
  await phone.click('[data-act=lesson]'); await playThrough(phone); await phone.click('[data-act=home]');
  await phone.click('[data-act=board]');
  await phone.fill('input[name=nick]', 'Mia');
  await phone.keyboard.press('Enter');
  await phone.waitForSelector('.lb-row');
  await phone.click('[data-act=home]');
  const before = await phone.evaluate(() => ({ xp: STATS.xp, n: Object.keys(PROGRESS).length }));
  expect(before.xp).toBeGreaterThan(0);

  await phone.click('[data-act=google]');
  await expect(phone.locator('.account')).toContainText('mia@skola.cz');
  expect(await phone.evaluate(() => [store.get(K.auth).uid, PLAYER.name, STATS.xp, location.search + location.hash])).toEqual(['gmia', 'Mia', before.xp, '']);
  // The board entry and the name moved from the device's anonymous account to the Google one.
  expect(fb.db.has('players/uid1')).toBe(false);
  expect(fb.db.get('players/gmia').fields.name.stringValue).toBe('Mia');
  expect(fb.db.get('names/mia').fields.uid.stringValue).toBe('gmia');
  expect(fb.db.has('users/gmia')).toBe(true);

  // Computer: sign in straight from onboarding.
  const pc = await device(browser, fb, () => localStorage.removeItem('zv-onboarded-v1'));
  await openApp(pc);
  await pc.click('.center [data-act=google]');
  await expect(pc.locator('.account')).toContainText('mia@skola.cz');
  expect(await pc.evaluate(() => ({ xp: STATS.xp, n: Object.keys(PROGRESS).length, name: PLAYER.name }))).toEqual({ ...before, name: 'Mia' });

  // Learning on the computer shows up on the phone.
  await pc.click('[data-act=lesson]'); await playThrough(pc); await pc.click('[data-act=home]');
  const pcXp = await pc.evaluate(async () => { await syncPlayer(); return STATS.xp; });
  expect(pcXp).toBeGreaterThan(before.xp);
  expect(await phone.evaluate(async () => { await syncPlayer(); return STATS.xp; })).toBe(pcXp);

  await pc.click('[data-act=logout]');
  await pc.waitForFunction(() => typeof S !== 'undefined' && S.screen === 'onboard');   // this test's device never finished onboarding
  await expect(pc.locator('[data-act=google]')).toBeVisible();
  expect(await pc.evaluate(() => [STATS.xp, PLAYER, localStorage.getItem('zv-auth-v1')])).toEqual([0, null, null]);
});

test('anonymous players cannot write account progress', async ({ browser }) => {
  const fb = new FakeFirebase();
  const page = await device(browser, fb);
  await openApp(page);
  const status = await page.evaluate(async () => { try { await cloudSync(); return 'ok'; } catch (e) { return e.message; } });
  expect(status).toContain('403');
});

// Serve the app under the old (GitHub Pages) and the new (Firebase Hosting) address.
const serveHosts = (ctx, { live = true, moved = true } = {}) => ctx.route(/aomartinao\.github\.io\/mia-animals\/|mia-animals\.web\.app\//, async r => {
  const u = new URL(r.request().url());
  if (u.hostname.endsWith('web.app') && !live) return r.fulfill({ status: 404, body: 'Site Not Found' });
  if (u.pathname === '/moved.json') return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ moved }) });
  const res = await r.fetch({ url: 'http://localhost:4173' + u.pathname.replace(/^\/mia-animals\//, '/') + u.search });
  return r.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*' } });
});
const oldData = () => {
  if (location.hostname !== 'aomartinao.github.io') return;
  localStorage.setItem('zv-onboarded-v1', 'true');
  localStorage.setItem('zv-stats-v1', JSON.stringify({ xp: 42, streak: 2, lastDay: null, lessons: 3 }));
  localStorage.setItem('zv-progress-v1', JSON.stringify({ kapr: { b: 3, s: 4, c: 3, w: 1, t: 5 } }));
  localStorage.setItem('zv-player-v1', JSON.stringify({ name: 'Mia', uid: 'uid7' }));
  localStorage.setItem('zv-auth-v1', JSON.stringify({ uid: 'uid7', id: 'tok-uid7', refresh: 'ref-uid7', exp: 0 }));
};

test('old address sends the player to the new one with all progress', async ({ browser }) => {
  const page = await device(browser, new FakeFirebase(), oldData);
  await serveHosts(page.context());
  await page.goto('https://aomartinao.github.io/mia-animals/');
  await page.waitForURL(/mia-animals\.web\.app\/$/);
  await page.waitForFunction(() => typeof S !== 'undefined' && S.screen === 'home');
  expect(await page.evaluate(() => [STATS.xp, PROGRESS.kapr.b, PLAYER.name, store.get(K.auth).uid, location.hash])).toEqual([42, 3, 'Mia', 'uid7', '']);
  await expect(page.locator('[data-act=google]')).toBeVisible();
});

test('old address stays put until the new one is live and switched on; home-screen app shows how to move', async ({ browser }) => {
  const page = await device(browser, new FakeFirebase(), oldData);
  await serveHosts(page.context(), { live: false });
  await page.goto('https://aomartinao.github.io/mia-animals/');
  await page.waitForFunction(() => typeof S !== 'undefined' && S.screen === 'home');
  expect(page.url()).toContain('github.io');
  await expect(page.locator('[data-act=google]')).toHaveCount(0);   // Google login only on the new address

  // New site live but the switch in moved.json is off: nothing changes either.
  const off = await device(browser, new FakeFirebase(), oldData);
  await serveHosts(off.context(), { moved: false });
  await off.goto('https://aomartinao.github.io/mia-animals/');
  await off.waitForFunction(() => typeof S !== 'undefined' && S.screen === 'home');
  expect(off.url()).toContain('github.io');

  const app = await device(browser, new FakeFirebase(), () => { Object.defineProperty(navigator, 'standalone', { value: true }); });
  await app.context().addInitScript(oldData);
  await serveHosts(app.context());
  await app.goto('https://aomartinao.github.io/mia-animals/');
  await app.waitForFunction(() => typeof S !== 'undefined' && S.screen === 'moved');
  const href = await app.locator('a.btn').getAttribute('href');
  expect(href).toMatch(/^https:\/\/mia-animals\.web\.app\/#import=/);
  expect(JSON.parse(decodeURIComponent(href.split('#import=')[1])).stats.xp).toBe(42);
});

test('moving from the old address keeps a Czech player in Czech even on an English phone', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en-GB', viewport: { width: 390, height: 844 } });
  await setupMocks(ctx, { firebase: new FakeFirebase(), lang: null, onboarded: false });   // the new address knows nothing yet
  await ctx.addInitScript(oldData);
  const page = await ctx.newPage();
  await serveHosts(ctx);
  await page.goto('https://aomartinao.github.io/mia-animals/');
  await page.waitForURL(/mia-animals\.web\.app\/$/);
  await page.waitForFunction(() => typeof S !== 'undefined' && S.screen === 'home');
  expect(await page.evaluate(() => [LANG, STATS.xp, PROGRESS.kapr.b, PLAYER.name])).toEqual(['cs', 42, 3, 'Mia']);
});
