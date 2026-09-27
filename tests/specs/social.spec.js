import { test, expect } from '@playwright/test';
import { setupMocks, openApp, playThrough, FakeFirebase } from '../helpers.js';

test('leaderboard: join, see others, rename, leave', async ({ browser }) => {
  const fb = new FakeFirebase();
  const player = async (name, lessons) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setupMocks(ctx, { firebase: fb });
    const page = await ctx.newPage();
    await openApp(page);
    for (let i = 0; i < lessons; i++) { await page.click('[data-act=lesson]'); await playThrough(page); await page.click('[data-act=home]'); }
    await page.click('[data-act=board]');
    await page.fill('input[name=nick]', name);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.lb-row');
    return page;
  };
  await player('Mia', 2);
  const tom = await player('Tom', 1);
  await tom.click('[data-act=tabWeek]');
  await expect(tom.locator('.lb-row').first()).toContainText('Mia');
  await expect(tom.locator('.lb-row.me')).toContainText('Tom');
  await tom.click('[data-act=rename]');
  await tom.fill('input[name=nick]', 'Tomáš');
  await tom.keyboard.press('Enter');
  await expect(tom.locator('.lb-row.me')).toContainText('Tomáš');
  tom.on('dialog', d => d.accept());
  await tom.click('[data-act=leaveBoard]');
  await tom.waitForFunction(() => S.screen === 'home');
  expect([...fb.db.keys()].filter(k => k.endsWith('uid2'))).toEqual([]);
  expect([...fb.db.keys()].filter(k => k.startsWith('names/'))).toEqual(['names/mia']);   // rename + leave freed Tom's names
});

test('nicknames are unique (ignoring case and diacritics); migration asks the loser to rename', async ({ browser }) => {
  const fb = new FakeFirebase();
  const open = async (init) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setupMocks(ctx, { firebase: fb });
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    await openApp(page);
    return page;
  };
  const join = async (page, name) => { await page.click('[data-act=board]'); await page.fill('input[name=nick]', name); await page.keyboard.press('Enter'); };
  const a = await open();
  await join(a, 'Gandalf');
  await a.waitForSelector('.lb-row');
  const b = await open();
  await join(b, 'gandalf');
  await expect(b.locator('.hero')).toContainText('už někdo má');
  await b.fill('input[name=nick]', 'Gandalf2');
  await b.keyboard.press('Enter');
  await expect(b.locator('.lb-row.me')).toContainText('Gandalf2');
  // Old player who joined before names existed, with a name someone else owns now.
  const c = await open(() => localStorage.setItem('zv-player-v1', JSON.stringify({ name: 'Gándalf' })));
  await c.click('[data-act=board]');
  await expect(c.locator('.hero')).toContainText('už někdo má');
  await c.fill('input[name=nick]', 'Pippin');
  await c.keyboard.press('Enter');
  await expect(c.locator('.lb-row.me')).toContainText('Pippin');
  expect([...fb.db.keys()].filter(k => k.startsWith('names/')).sort()).toEqual(['names/gandalf', 'names/gandalf2', 'names/pippin']);
});

test('duel: same questions for the friend, one attempt, ranking by score then time', async ({ browser }) => {
  const fb = new FakeFirebase();
  const newPlayer = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setupMocks(ctx, { firebase: fb });
    const page = await ctx.newPage();
    let dialog = ''; page.on('dialog', d => { dialog = d.message() + ' ' + d.defaultValue(); d.accept(); });
    page.lastDialog = () => dialog;
    return page;
  };
  const mia = await newPlayer();
  await openApp(mia);
  await mia.click('[data-act=duels]');
  await mia.click('[data-act=newDuel]');
  await mia.fill('input[name=nick]', 'Mia');
  await mia.keyboard.press('Enter');
  await mia.waitForFunction(() => S.screen === 'lesson');
  const miaQs = await mia.evaluate(() => S.L.queue.map(i => i.a.id + ':' + i.type));
  expect(miaQs.every(q => !q.endsWith(':type') && !q.endsWith(':intro'))).toBe(true);
  await playThrough(mia, { wrongAt: [3] });
  await mia.waitForSelector('.lb-row');
  await mia.click('[data-act=shareDuel]');
  await expect.poll(() => mia.lastDialog()).toContain('?duel=');
  const link = mia.lastDialog().match(/http\S+/)[0];

  const tom = await newPlayer();
  await tom.goto(link);
  await tom.waitForSelector('[data-act=playDuel]');
  await tom.click('[data-act=playDuel]');
  await tom.fill('input[name=nick]', 'Tom');
  await tom.keyboard.press('Enter');
  await tom.click('[data-act=playDuel]');
  expect(await tom.evaluate(() => S.L.queue.map(i => i.a.id + ':' + i.type))).toEqual(miaQs);
  await playThrough(tom);
  await tom.waitForSelector('.lb-row');
  const rows = await tom.locator('.lb-row').allInnerTexts();
  expect(rows[0]).toContain('Tom');
  expect(rows[1]).toContain('Mia');
  await tom.goto(link);
  await tom.waitForSelector('.lb-row');
  await expect(tom.locator('[data-act=playDuel]')).toHaveCount(0);        // no second attempt
  await tom.goto('/?duel=doesnotexist1');
  await expect(tom.locator('.warn')).toContainText('neexistuje');
});

test('feedback: kids send an idea from home', async ({ browser }) => {
  const fb = new FakeFirebase();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setupMocks(ctx, { firebase: fb });
  const page = await ctx.newPage();
  await openApp(page);
  await page.click('[data-act=feedback]');
  await page.fill('textarea[name=text]', 'Přidejte prosím zvuky zvířat!');
  await page.click('button[type=submit]');
  await expect(page.locator('.hero')).toContainText('Díky');
  const docs = [...fb.db].filter(([k]) => k.startsWith('feedback/')).map(([, v]) => v.fields);
  expect(docs.map(f => f.text.stringValue)).toEqual(['Přidejte prosím zvuky zvířat!']);
  expect(docs[0].ctx.stringValue).toContain('localhost');
});

test('board hides old duplicate entries of a nickname that now belongs to someone else', async ({ browser }) => {
  const fb = new FakeFirebase();
  const doc = (name, xp) => ({ fields: { name: { stringValue: name }, xp: { integerValue: String(xp) }, known: { integerValue: '0' }, updated: { timestampValue: new Date().toISOString() } } });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setupMocks(ctx, { firebase: fb });
  const page = await ctx.newPage();
  await openApp(page);
  const week = await page.evaluate(() => isoWeek());
  for (const [uid, xp] of [['old1', 103], ['old2', 0]]) { fb.db.set(`players/${uid}`, doc('Gandalf', xp)); fb.db.set(`weeks/${week}/players/${uid}`, doc('Gandalf', xp)); }
  await page.click('[data-act=board]');
  await page.fill('input[name=nick]', 'Gandalf');   // freed name, now claimed by this player
  await page.keyboard.press('Enter');
  await page.waitForSelector('.lb-row.me');
  expect(await page.locator('.lb-row').allInnerTexts()).toHaveLength(1);
});
