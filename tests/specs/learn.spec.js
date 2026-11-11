import { test, expect } from '@playwright/test';
import { setupMocks, openApp, trackErrors } from '../helpers.js';
import { OLD_COURSE as COURSE, VISUAL_COURSE, VISUAL_DOCS, PDF_BYTES, COURSE_ID } from '../fixtures/learn-course.mjs';

// The Zero-G study page (learn/). Its real course is private and never in the repo, so these tests
// use small made-up courses about a fictional Moon base (tests/fixtures/learn-course.mjs): the first
// shape (cards only) and the visual one with pictures, stories, widgets, games and the brochure.
test.use({ hasTouch: true });
const UID = 'mia1';
const FS = 'https://firestore.googleapis.com/v1/projects/mia-animals/databases/(default)/documents';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

/** Mock the sign-in refresh and Firestore for learn/. `allowed: false` answers like the rules for anyone else.
 *  `docs` are the private docs by id (their `data` strings); by default only the first-shape course. */
async function mockLearn(context, { allowed = true, auth = true, cloud = {}, docs = { [COURSE_ID]: JSON.stringify(COURSE) } } = {}) {
  const calls = { signUp: 0, firestore: [] };
  const db = new Map(Object.entries(cloud));
  if (auth) await context.addInitScript(uid => {
    if (!localStorage.getItem('zv-auth-v1')) localStorage.setItem('zv-auth-v1', JSON.stringify({ uid, id: 'tok-' + uid, refresh: 'ref-' + uid, exp: Date.now() + 3600e3 }));
  }, UID);
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route(/i\.ytimg\.com/, r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#345"/></svg>' }));
  await context.route(/youtube-nocookie\.com/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>video</title>' }));
  await context.route(/identitytoolkit|securetoken/, r => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    if (r.request().url().includes('accounts:signUp')) calls.signUp++;
    return r.fulfill({ headers: CORS, contentType: 'application/json', body: JSON.stringify({ user_id: UID, id_token: 'tok-' + UID, refresh_token: 'ref-' + UID, expires_in: '3600' }) });
  });
  await context.route(/firestore\.googleapis\.com/, r => {
    const req = r.request(), m = req.method();
    if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const J = (o, status = 200) => r.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(o) });
    const key = decodeURIComponent(req.url()).slice(FS.length + 1).split('?')[0];
    calls.firestore.push(`${m} ${key}`);
    if (req.headers()['authorization'] !== 'Bearer tok-' + UID) return J({ error: 'unauthenticated' }, 401);
    if (key.startsWith('private/')) {
      if (!allowed) return J({ error: { status: 'PERMISSION_DENIED' } }, 403);
      const d = docs[key.slice('private/'.length)];
      return d == null ? J({ error: { status: 'NOT_FOUND' } }, 404) : J({ fields: { data: { stringValue: d }, updated: { integerValue: '1' } } });
    }
    if (key === `progress/${UID}` && allowed) {
      if (m === 'GET') return db.has(key) ? J(db.get(key)) : J({ error: 'not found' }, 404);
      if (m === 'PATCH') { db.set(key, JSON.parse(req.postData())); return J(db.get(key)); }
    }
    if (key === 'feedback' && m === 'POST') { db.set('feedback/' + db.size, JSON.parse(req.postData())); return J({}); }
    return J({ error: 'denied' }, 403);
  });
  return { calls, db };
}

async function openLearn(page) {
  await page.goto('/learn/');
  await page.waitForFunction(() => typeof S !== 'undefined' && S.screen !== 'loading');
}

/** Answer the current question through the UI, correctly unless `wrong`. */
async function answer(page, { wrong = false } = {}) {
  const it = await page.evaluate(() => { const it = S.L.queue[S.L.i]; return { type: it.type, a: it.c.a, img: it.c.img, ans: it.ans, options: it.options, truth: it.truth }; });
  if (it.type === 'intro') { await page.click('[data-act=next]'); return it; }
  if (it.type === 'pic') { await page.locator('[data-pick]').nth(wrong ? it.options.findIndex(o => o !== it.img) : it.options.indexOf(it.img)).click(); return it; }
  if (it.type === 'mc' || it.type === 'cloze') await page.locator('[data-pick]').nth(wrong ? it.options.findIndex(o => o !== it.a) : it.options.indexOf(it.a)).click();
  else if (it.type === 'tf') await page.locator('[data-pick]').nth(it.truth !== wrong ? 0 : 1).click();
  else {
    await page.fill('input[name=ans]', wrong ? 'nevím nic' : it.type === 'calc' ? String(it.ans).replace('.', ',') : it.a);
    await page.click('button[type=submit]');
  }
  return it;
}
async function playThrough(page, { wrongAt = [] } = {}) {
  const types = new Set(); let k = 0;
  while (await page.evaluate(() => S.screen) === 'lesson') {
    const it = await answer(page, { wrong: wrongAt.includes(k) });
    types.add(it.type);
    if (it.type !== 'intro') { await page.click('[data-act=next]'); k++; }
    if (k > 80) throw new Error('lesson did not end');
  }
  return { answered: k, types };
}

test('home: countdown to the test window, share known, chapters', async ({ context, page }) => {
  await mockLearn(context);
  await page.clock.setFixedTime(new Date('2026-11-14T10:00:00'));
  await openLearn(page);
  await expect(page.locator('.testline')).toHaveText('📅 Test 24. 11. – 6. 12. · za 10 dní');
  await expect(page.locator('.overall')).toContainText('0 / 9');
  await expect(page.locator('[data-ch]')).toHaveCount(2);
  await expect(page.locator('[data-ch="1"]')).toContainText('0 / 5 umíš');
  await page.clock.setFixedTime(new Date('2026-11-30T10:00:00'));
  await openLearn(page);
  await expect(page.locator('.testline')).toHaveText('📅 Test probíhá · do 6. 12.');
});

test('a lesson: intro, question, feedback with the page and the quote; mistakes come back; progress syncs', async ({ context, page }) => {
  const { db } = await mockLearn(context);
  await openLearn(page);
  await page.click('[data-act=lesson]');
  expect(await page.evaluate(() => S.L.queue[0].type)).toBe('intro');
  await expect(page.locator('.intro-fact')).toHaveText('Základna Luna-7 byla otevřena 14. května 2031.');   // brochure order
  await page.click('[data-act=next]');
  await answer(page);
  await expect(page.locator('.feedback.ok')).toBeVisible();
  await expect(page.locator('[data-act=quote]')).toHaveText('📖 str. 3');
  await expect(page.locator('.quote')).toBeHidden();
  await page.click('[data-act=quote]');
  await expect(page.locator('.quote')).toHaveText('„Základna Luna-7 byla slavnostně otevřena 14. května 2031“');
  await page.click('[data-act=next]');
  const total0 = await page.evaluate(() => S.L.total);
  const { types } = await playThrough(page, { wrongAt: [0] });
  expect(await page.evaluate(() => S.screen)).toBe('lessonEnd');
  expect(await page.evaluate(() => S.L.total)).toBe(total0 + 1);   // the wrong one came back
  expect([...types].every(t => ['intro', 'mc', 'tf', 'cloze', 'typed'].includes(t))).toBe(true);
  await expect(page.locator('.mistake')).toHaveCount(1);
  expect(await page.evaluate(() => Object.keys(PROGRESS).sort())).toEqual(['crew', 'dome', 'first-commander', 'jump', 'luna-open', 'train-speed']);
  // Answers sync after a 1.5 s pause and the lesson end syncs again, so on a slow runner an earlier,
  // partial write can land first: wait for the write that has the whole lesson.
  // The page's own stats travel in the same doc under "_"; they are not a card.
  const savedKeys = () => db.has(`progress/${UID}`) ? Object.keys(JSON.parse(db.get(`progress/${UID}`).fields.data.stringValue)).filter(k => k !== '_').sort() : null;
  await expect.poll(savedKeys).toEqual(['crew', 'dome', 'first-commander', 'jump', 'luna-open', 'train-speed']);
  expect(Number.isInteger(+db.get(`progress/${UID}`).fields.updated.integerValue)).toBe(true);
});

test('typed answers: variants, accents and slips for half, numbers in any format, the surname alone', async ({ context, page }) => {
  await mockLearn(context);
  await openLearn(page);
  const r = await page.evaluate(() => {
    const c = id => CARDS.find(x => x.id === id);
    return {
      exact: checkTyped('14. května 2031', c('luna-open')), alt: checkTyped('14.5.2031', c('luna-open')),
      accent: checkTyped('14. kvetna 2031', c('luna-open')), wrongYear: checkTyped('14. května 2032', c('luna-open')),
      n1: checkTyped('28000', c('train-speed')), n2: checkTyped('28 000', c('train-speed')), n3: checkTyped('28.000 km/h', c('train-speed')),
      n4: checkTyped('2800', c('train-speed')), count: checkTyped('42', c('crew')), countWrong: checkTyped('43', c('crew')),
      surname: checkTyped('Hvězdář', c('first-commander')), surnameNoAccents: checkTyped('hvezdar', c('first-commander')),
      typo: checkTyped('Petr Hvězdáž', c('first-commander')), altWord: checkTyped('Titan', c('dome')),
    };
  });
  expect(r).toEqual({
    exact: 'ok', alt: 'ok', accent: 'accent', wrongYear: 'wrong',
    n1: 'ok', n2: 'ok', n3: 'ok', n4: 'wrong', count: 'ok', countWrong: 'wrong',
    surname: 'ok', surnameNoAccents: 'accent', typo: 'typo', altWord: 'ok',
  });
  // "Why" cards are never typed: a forced typed question becomes multiple choice.
  expect(await page.evaluate(() => makeQ(CARDS.find(x => x.id === 'jump'), 3, 'typed').type)).toBe('mc');
  // A "think" card's worked-out answer can be typed as a number.
  expect(await page.evaluate(() => [checkTyped('49', CARDS.find(x => x.id === 'train-after')), checkTyped('49 let', CARDS.find(x => x.id === 'train-after'))])).toEqual(['ok', 'ok']);
  // Through the UI, a slip counts as "almost".
  await page.evaluate(() => { startLesson(); S.L.queue[0] = makeQ(CARDS.find(x => x.id === 'first-commander'), 2, 'typed'); render(); });
  await page.fill('input[name=ans]', 'Petr Hvězdáž');
  await page.click('button[type=submit]');
  await expect(page.locator('.feedback h3')).toContainText('Skoro');
  await expect(page.locator('.feedback')).toContainText('Píše se: Petr Hvězdář');
});

test('"why" and "think" cards never become fill-the-gap or true/false, even when the fact contains the answer', async ({ context, page }) => {
  await mockLearn(context);
  await openLearn(page);
  const types = await page.evaluate(() => {
    const out = {};
    for (const id of ['jump', 'train-after']) {
      const c = CARDS.find(x => x.id === id), seen = new Set();
      for (let i = 0; i < 200; i++) for (const lvl of [0, 1, 2, 3]) seen.add(makeQ(c, lvl).type);
      for (const f of ['tf', 'cloze']) seen.add(makeQ(c, 2, f).type);
      out[id] = [...seen].sort();
    }
    return out;
  });
  expect(types).toEqual({ jump: ['mc'], 'train-after': ['mc', 'typed'] });
});

test('calculation cards: random mass, the answer within 1 %', async ({ context, page }) => {
  await mockLearn(context);
  await openLearn(page);
  const r = await page.evaluate(() => {
    const q = makeQ(CARDS.find(c => c.kind === 'calc'), 0);
    const inRange = q.m >= 10 && q.m <= 20;
    q.m = 15; q.ans = 15 * 1.62;   // 24.3 N
    return [inRange, calcOk('24,3', q), calcOk('24.4', q), calcOk('24,3 N', q), calcOk('24', q), calcOk('25', q)];
  });
  expect(r).toEqual([true, true, true, true, false, false]);
  await page.evaluate(() => { startLesson(); const q = makeQ(CARDS.find(c => c.kind === 'calc'), 0); q.m = 15; q.ans = 24.3; S.L.queue[0] = q; render(); });
  await expect(page.locator('.q-title')).toContainText('o hmotnosti 15 kg');
  await page.fill('input[name=ans]', '24,3');
  await page.click('button[type=submit]');
  await expect(page.locator('.feedback.ok')).toContainText('15 × 1,62 = 24,3 N');
});

test('practice test: mixed questions, a grade and a score per chapter; lesson progress is untouched', async ({ context, page }) => {
  await mockLearn(context);
  await openLearn(page);
  await page.click('[data-act=examStart]');
  await page.click('[data-act=timer]');   // the timer is on by default
  expect(await page.evaluate(() => [TIMER, localStorage.getItem('zg-timer-v1')])).toEqual([false, 'false']);
  await page.click('[data-act=exam]');
  expect(await page.evaluate(() => S.L.total)).toBe(9);   // all cards, as there are fewer than 25
  const types = await page.evaluate(() => S.L.queue.map(i => i.type));
  expect(types.filter(t => t === 'calc')).toHaveLength(1);
  expect(types.every(t => ['mc', 'tf', 'typed', 'calc'].includes(t))).toBe(true);
  // true/false only for cards that recall a fact
  expect(await page.evaluate(() => S.L.queue.filter(i => i.type === 'tf' && ['why', 'think', 'calc'].includes(i.c.kind)).length)).toBe(0);
  await expect(page.locator('[data-timer]')).toHaveCount(0);
  await playThrough(page, { wrongAt: [0] });
  await expect(page.locator('.grade')).toHaveText('2');   // 8 of 9
  await expect(page.locator('.bych > div')).toHaveCount(2);
  await expect(page.locator('.mistake')).toHaveCount(1);
  await expect(page.locator('[data-act=practiceMistakes]')).toBeVisible();
  expect(await page.evaluate(() => Object.keys(PROGRESS).length)).toBe(0);
});

test('practice test mix on a full deck: 25 questions, about 40 % working with facts, true/false only for recall', async ({ context, page }) => {
  await mockLearn(context);
  await openLearn(page);
  const r = await page.evaluate(() => {
    // a made-up deck of 60 cards in 3 chapters, a third of them "why"/"think"
    CARDS = Array.from({ length: 60 }, (_, i) => ({ id: 'c' + i, ch: `${i % 3 + 1}.1`, page: 1, quote: 'x', kind: i % 3 ? 'fact' : (i % 2 ? 'why' : 'think'),
      fact: `Fakt číslo ${i} je slovo${i}.`, q: `Otázka ${i}?`, a: `slovo${i}`, alt: [], wrong: ['jedno', 'druhé', 'třetí'] }));
    startExam();
    const q = S.L.queue, reason = q.filter(i => ['why', 'think', 'calc'].includes(i.c.kind));
    return { n: q.length, reason: reason.length, tfReason: reason.filter(i => i.type === 'tf').length,
      chapters: Object.keys(S.L.byCh).length, types: [...new Set(q.map(i => i.type))].sort() };
  });
  expect(r).toEqual({ n: 25, reason: 10, tfReason: 0, chapters: 3, types: ['mc', 'tf', 'typed'] });
});

test('practice test timer: an unanswered question runs out after 45 s', async ({ context, page }) => {
  await mockLearn(context);
  await page.clock.install({ time: new Date('2026-11-14T10:00:00') });
  await page.goto('/learn/');   // no waitForFunction: it polls on animation frames, which the fake clock holds
  await page.click('[data-act=examStart]');
  await page.click('[data-act=exam]');
  await expect(page.locator('[data-timer]')).toHaveText('⏱ 45 s');
  await page.clock.runFor(46_000);
  await expect(page.locator('.feedback h3')).toHaveText('⏰ Čas vypršel');
  expect(await page.evaluate(() => S.L.points)).toBe(0);
});

test('reporting a card sends only its id and the note', async ({ context, page }) => {
  const { db } = await mockLearn(context);
  await openLearn(page);
  await page.evaluate(() => { startLesson(); S.L.queue[0] = makeQ(CARDS.find(x => x.id === 'crew'), 0, 'mc'); render(); });
  await answer(page);
  await page.click('[data-act=report]');
  await page.fill('[name=note]', 'Divná otázka');
  await page.click('[data-act=sendReport]');
  await expect(page.locator('.modal')).toContainText('Díky');
  const f = [...db.entries()].find(([k]) => k.startsWith('feedback/'))[1].fields;
  expect(f.text.stringValue).toBe('[zero-g] crew: Divná otázka');
  expect(Object.keys(f).sort()).toEqual(['at', 'ctx', 'text', 'uid']);
});

test('without the app’s sign-in the page asks to sign in there and never creates an account', async ({ context, page }) => {
  const { calls } = await mockLearn(context, { auth: false });
  await openLearn(page);
  await expect(page.locator('#app')).toContainText('Nejdřív otevři aplikaci a přihlas se');
  await expect(page.locator('a[href="../"]')).toBeVisible();
  expect(calls.signUp).toBe(0);
  expect(calls.firestore).toEqual([]);
});

test('an account that is not on the list sees nothing, and nothing is kept', async ({ context, page }) => {
  await mockLearn(context, { allowed: false });
  await openLearn(page);
  await expect(page.locator('#app')).toContainText('Tady nic není');
  await expect(page.locator('#app')).not.toContainText('Luna');
  expect(await page.evaluate(() => localStorage.getItem('zg-course-v1'))).toBeNull();
});

test('progress from another device is merged in; the cards also work offline', async ({ context, page }) => {
  const other = { 'luna-open': { b: 4, s: 5, c: 5, w: 0, t: Date.now() } };
  await mockLearn(context, { cloud: { [`progress/${UID}`]: { fields: { data: { stringValue: JSON.stringify(other) } } } } });
  await openLearn(page);
  await expect(page.locator('.overall')).toContainText('1 / 9');
  await context.unroute(/firestore\.googleapis\.com/);
  await context.route(/firestore\.googleapis\.com/, r => r.abort());
  await openLearn(page);
  expect(await page.evaluate(() => S.screen)).toBe('home');
  await expect(page.locator('[data-ch]')).toHaveCount(2);
  await expect(page.locator('.overall')).toContainText('1 / 9');
});

test('the animal app shows the Zero-G button only to the listed accounts', async ({ context, page }) => {
  await setupMocks(context);
  await openApp(page);
  await expect(page.locator('a[href="learn/"]')).toHaveCount(0);
  const allowed = await page.evaluate(() => ZEROG_UIDS[0]);
  await page.evaluate(uid => localStorage.setItem('zv-auth-v1', JSON.stringify({ uid, id: 'tok-' + uid, refresh: 'ref-' + uid, exp: Date.now() + 3600e3 })), allowed);
  await openApp(page);
  await expect(page.locator('a[href="learn/"]')).toBeVisible();
  await expect(page.locator('a[href="learn/"]')).toContainText('Zero-G');
});

/* ------------------------------------------------------------------ *
 *  The visual course: pictures, stories, widgets, games, brochure     *
 * ------------------------------------------------------------------ */
const visual = (context, opts = {}) => mockLearn(context, { docs: { ...VISUAL_DOCS }, ...opts });
const packsLoaded = page => page.waitForFunction(() => Object.keys(PACKS).length === 2);
const gets = (calls, doc) => calls.firestore.filter(c => c === `GET private/${COURSE_ID}-${doc}`).length;
/** A lesson made of exactly these questions. */
const lessonOf = (page, list) => page.evaluate(list => {
  go('lesson', { L: newSession(list.map(([id, type]) => { const c = CARDS.find(x => x.id === id); return type === 'intro' ? { c, type } : makeQ(c, 0, type); })) });
}, list);
async function swipe(page, sel, dx) {
  await page.evaluate(([sel, dx]) => {
    const el = document.querySelector(sel), mk = x => new Touch({ identifier: 1, target: el, clientX: x, clientY: 400 });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(200)], changedTouches: [mk(200)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(200 + dx)], bubbles: true }));
  }, [sel, dx]);
}

test('visual course home: rank, streak, daily goal, chapter tiles; the chapter screen lists story, lesson, games, brochure, challenge', async ({ context, page }) => {
  await visual(context);
  const errors = trackErrors(page);
  await openLearn(page);
  await expect(page.locator('.pilot')).toContainText('Nováček');
  await expect(page.locator('.pilot')).toContainText('0 XP');
  await expect(page.locator('[data-goal]')).toContainText('0/3');
  await expect(page.locator('.overall')).toContainText('0 / 10');
  await expect(page.locator('.chtile')).toHaveCount(2);
  await expect(page.locator('[data-ch="1"]')).toContainText('🌕');
  await expect(page.locator('[data-ch="1"]')).toContainText('0 / 6 umíš');
  await expect(page.locator('[data-ch="1"] .new')).toHaveText('příběh');
  await expect(page.locator('[data-act=reader]')).toContainText('8 stran');
  await page.click('[data-ch="1"]');
  await expect(page.locator('.ch-hero h1')).toHaveText('Měsíční základna');
  await expect(page.locator('.act')).toHaveText([/Příběh.*4 obrazovky/, /Lekce/, /Co k čemu patří/, /Co bylo dřív\?/, /Brožura.*od str\. 3/, /Zkouška kapitoly.*6 otázek/]);
  expect(errors).toEqual([]);
});

test('the first-shape course (cards only) still works: no story, games, brochure or pictures anywhere', async ({ context, page }) => {
  await mockLearn(context);
  const errors = trackErrors(page);
  await openLearn(page);
  await expect(page.locator('[data-act=reader]')).toHaveCount(0);
  await expect(page.locator('.chtile .cnum')).toHaveText(['1', '2']);   // no emoji: the chapter number
  await page.click('[data-ch="1"]');
  await expect(page.locator('.act')).toHaveText([/Lekce/, /Zkouška kapitoly/]);
  await page.click('[data-act=chLesson]');
  expect(await page.evaluate(() => S.screen)).toBe('lesson');   // no story to suggest
  await expect(page.locator('figure')).toHaveCount(0);
  await playThrough(page);
  await expect(page.locator('[data-game]')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(PACKS).length)).toBe(0);
  expect(errors).toEqual([]);
});

test('media packs load in the background, are cached in IndexedDB per course version, and pictures show where they belong', async ({ context, page }) => {
  const docs = { ...VISUAL_DOCS };
  const { calls } = await visual(context, { docs });
  await openLearn(page);
  await packsLoaded(page);
  expect(await page.evaluate(() => [mediaUrl('m-dome').slice(0, 5), mediaUrl('nothing')])).toEqual(['blob:', null]);
  expect([gets(calls, 'm1'), gets(calls, 'm2')]).toEqual([1, 1]);
  // intro card: the picture with its credit, tap to zoom
  await lessonOf(page, [['dome', 'intro'], ['dome', 'mc']]);
  await expect(page.locator('.mfig img')).toHaveAttribute('alt', 'Kopule z titanu');
  await expect(page.locator('.mfig figcaption')).toHaveText('Foto: Měsíční archiv');
  await page.click('.mfig');
  await expect(page.locator('#lb img')).toBeVisible();
  await expect(page.locator('#lb')).toContainText('Kopule z titanu');
  await page.click('#lb');
  await expect(page.locator('#lb')).toHaveCount(0);
  // a picture that would give the answer away waits for the feedback
  await page.click('[data-act=next]');
  await expect(page.locator('.q-title')).toHaveText('Z čeho je kopule základny?');
  await expect(page.locator('figure')).toHaveCount(0);
  await answer(page);
  await expect(page.locator('.feedback .mfig img')).toBeVisible();
  // imgAt "q": the picture belongs to the question
  await lessonOf(page, [['first-commander', 'mc']]);
  await expect(page.locator('.mfig img')).toBeVisible();
  // a new load takes the packs from IndexedDB; a new course version fetches them again
  await openLearn(page);
  await packsLoaded(page);
  expect([gets(calls, 'm1'), gets(calls, 'm2')]).toEqual([1, 1]);
  docs[COURSE_ID] = JSON.stringify({ ...VISUAL_COURSE, v: VISUAL_COURSE.v + 1 });
  await openLearn(page);
  await page.waitForFunction(() => COURSE.v === 1700000000001 && Object.keys(PACKS).length === 2);
  expect([gets(calls, 'm1'), gets(calls, 'm2')]).toEqual([2, 2]);
});

test('pictures that are not there yet take no space, and a picture question waits until they are', async ({ context, page }) => {
  const docs = { ...VISUAL_DOCS };
  delete docs[`${COURSE_ID}-m2`];
  await visual(context, { docs });
  const errors = trackErrors(page);
  await openLearn(page);
  await page.waitForFunction(() => Object.keys(PACKS).length === 1);
  await lessonOf(page, [['rover-pic', 'intro'], ['rover-pic', 'pic'], ['crew', 'mc']]);
  await expect(page.locator('figure[data-mid="m-rover"]')).toBeHidden();
  expect(await page.locator('figure[data-mid="m-rover"] img').getAttribute('src')).toBeNull();
  await page.click('[data-act=next]');
  expect(await page.evaluate(() => [cur().c.id, S.L.total])).toEqual(['crew', 2]);   // the picture question was left out
  expect(errors).toEqual([]);
});

test('a picture card: a 2×2 grid, tap the right picture; the feedback shows it with its caption', async ({ context, page }) => {
  await visual(context);
  await openLearn(page);
  await packsLoaded(page);
  await lessonOf(page, [['rover-pic', 'pic'], ['rover-pic', 'pic']]);
  await expect(page.locator('.pg')).toHaveCount(4);
  for (const alt of await page.locator('.pg img').evaluateAll(l => l.map(i => i.alt))) expect(alt).toBe('');   // alt texts would give it away
  await answer(page);
  await expect(page.locator('.pg.correct')).toHaveCount(1);
  await expect(page.locator('.feedback.ok')).toContainText('Vozítko Krtek');
  await expect(page.locator('.feedback .mfig img')).toHaveAttribute('alt', 'Vozítko Krtek');
  await page.click('[data-act=next]');
  await answer(page, { wrong: true });
  await expect(page.locator('.pg.wrong')).toHaveCount(1);
  await expect(page.locator('.pg.correct')).toHaveCount(1);
  await expect(page.locator('.feedback.bad')).toContainText('Vozítko Krtek');
  expect(await page.evaluate(() => PROGRESS['rover-pic'].s)).toBe(2);
});

test('stories: offered before the first lesson of a chapter; slides with a picture, a video and widgets; XP once', async ({ context, page }) => {
  await visual(context);
  await openLearn(page);
  await packsLoaded(page);
  await page.click('[data-act=lesson]');
  await expect(page.locator('#app')).toContainText('Nejdřív krátký příběh?');
  await page.click('[data-act=watchStory]');
  await expect(page.locator('.st-slide h2')).toHaveText('Vítej na Luně-7');
  await expect(page.locator('.st-text b')).toHaveText('42 lidí');
  await expect(page.locator('.st-slide .mfig img')).toBeVisible();
  await expect(page.locator('.st-dots i')).toHaveCount(4);
  await expect(page.locator('[data-act=readPage]')).toHaveText('📖 str. 3');
  // keyboard, swipe and buttons
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.st-slide h2')).toHaveText('Prohlídka základny');
  await expect(page.locator('.vid img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/abcdEFGH_12/hqdefault.jpg');
  await context.setOffline(true);
  await page.click('[data-act=play]');
  await expect(page.locator('.vid .voff')).toContainText('až budeš online');
  await context.setOffline(false);
  await page.click('.vid .voff');   // the note is the retry button
  await expect(page.locator('.vid iframe')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/abcdEFGH_12?start=12&rel=0&playsinline=1&autoplay=1');
  await swipe(page, '.st-kicker', -120);
  await expect(page.locator('.st-slide h2')).toHaveText('Jak základna rostla');
  await swipe(page, '.st-kicker', 120);
  await expect(page.locator('.st-slide h2')).toHaveText('Prohlídka základny');
  await page.click('[data-act=storyNext]');
  await page.click('[data-act=storyNext]');
  await expect(page.locator('[data-act=storyNext]')).toHaveText('Hotovo ✓ +30 XP');
  await page.click('[data-act=storyNext]');
  // the story was asked for before the lesson, so the lesson follows
  expect(await page.evaluate(() => [S.screen, S.L.queue[0].type, STATS.xp >= 30, !!STATS.seen['1'], !!STATS.badges['story-1']])).toEqual(['lesson', 'intro', true, true, true]);
  const xp = await page.evaluate(() => STATS.xp);
  await page.evaluate(() => go('story', { ch: '1', k: 3, then: 'chapter' }));
  await expect(page.locator('[data-act=storyNext]')).toHaveText('Hotovo ✓');
  await page.click('[data-act=storyNext]');
  expect(await page.evaluate(() => [S.screen, STATS.xp])).toEqual(['chapter', xp]);
});

test('the parabola widget: the scrubber moves through the phases; gravity stays, the floor push and the scale change; mass slider', async ({ context, page }) => {
  await visual(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });   // the cabin follows at once
  await openLearn(page);
  await page.evaluate(() => go('story', { ch: '2', k: 0, then: 'chapter' }));
  const w = page.locator('.wg-parabola');
  const read = () => w.evaluate(el => Object.fromEntries(Object.entries({ name: el.querySelector('.pb-name').textContent, load: el.querySelector('.pb-load').textContent, scale: el.querySelector('.pb-w').textContent,
    fg: el.querySelector('.pb-gn').textContent, ff: el.querySelector('.pb-fn').textContent, m: el.querySelector('.pb-m').textContent }).map(([k, v]) => [k, v.replace(/\s+/g, ' ')])));
  const arrows = () => w.evaluate(el => { const len = g => { const l = el.querySelector(g + ' line'); return l ? Math.round(Math.abs(l.y2.baseVal.value - l.y1.baseVal.value)) : 0; }; return [len('.pb-fg'), len('.pb-ff')]; });
  const mids = await w.evaluate(el => el.wg.mids);
  expect(mids).toHaveLength(5);
  await expect(w.locator('.pb-name')).toHaveText('Klidný let');
  expect(await read()).toEqual({ name: 'Klidný let', load: '1 g', scale: '55 kg', fg: '540 N', ff: '540 N', m: '55 kg' });
  await expect(w.locator('.pb-meta')).toContainText('4 000 m');
  const level = await arrows();
  await w.locator('.pb-range').fill(String(Math.round(mids[1] * 1000)));
  await expect(w.locator('.pb-name')).toHaveText('Prudké stoupání');
  expect(await read()).toMatchObject({ load: '1,7 g', scale: '93,5 kg', fg: '540 N', ff: '917 N' });
  await expect(w.locator('.pb-note')).toHaveText('Podlaha tlačí víc, cítíš se těžší.');
  await page.waitForTimeout(100);
  const heavy = await arrows();
  await w.locator('.pb-range').fill(String(Math.round(mids[2] * 1000)));
  await expect(w.locator('.pb-name')).toHaveText('Vznášení');
  expect(await read()).toMatchObject({ load: '0 g', scale: '0 kg', fg: '540 N', ff: '0 N' });
  await expect(w.locator('.pb-meta')).toContainText('310 km/h');
  await page.waitForTimeout(100);
  const zero = await arrows();
  expect(level[0]).toBeGreaterThan(20);
  expect([heavy[0], zero[0]]).toEqual([level[0], level[0]]);   // gravity: the same arrow in every phase
  expect(heavy[1]).toBeGreaterThan(level[1]);                   // the floor pushes harder
  expect(zero[1]).toBe(0);                                      // and not at all at zero g
  await w.locator('.pb-range').fill(String(Math.round(mids[3] * 1000)));
  await expect(w.locator('.pb-name')).toHaveText('Vybírání');
  await w.locator('.pb-mr').fill('80');
  await expect(w.locator('.pb-m')).toHaveText('80 kg');
  expect(await read()).toMatchObject({ name: 'Vybírání', m: '80 kg', scale: '136 kg', fg: '785 N', ff: '1 320 N' });
  // play runs the plane along the path
  await w.locator('.pb-range').fill('0');
  await w.locator('.pb-play').click();
  await expect.poll(() => w.locator('.pb-range').evaluate(r => +r.value)).toBeGreaterThan(0);
});

test('orbit, timeline and funnel widgets react and show the numbers from the data', async ({ context, page }) => {
  await visual(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLearn(page);
  await packsLoaded(page);
  await page.evaluate(() => go('story', { ch: '2', k: 1, then: 'chapter' }));
  const o = page.locator('.wg-orbit');
  await expect(o.locator('.ob-chips span')).toHaveText(['↑ 100 km', '💨 5 800 km/h', '🔄 118 min', '🧲 89 % gravitace']);
  await o.locator('[data-shot="0"]').click();
  await expect(o).toHaveAttribute('data-landed', 'hit');
  await expect(o.locator('.ob-text')).toContainText('Koule spadne kousek od hory.');
  await o.locator('[data-shot="1"]').click();
  await expect(o).toHaveAttribute('data-landed', 'hit');
  await o.locator('[data-shot="2"]').click();
  await expect(o).toHaveAttribute('data-landed', 'orbit');
  await expect(o.locator('.ob-text b')).toHaveText(['5 800 km/h:', 'obíhá dokola']);
  await expect(o.locator('.ob-craft')).toHaveAttribute('opacity', '1');
  await expect(o.locator('.ob-trails path')).toHaveCount(2);   // the earlier shots stay as faint trails
  await page.evaluate(() => go('story', { ch: '1', k: 2, then: 'chapter' }));
  const t = page.locator('.wg-timeline');
  await expect(t.locator('.tl-when')).toHaveText(['2029', '2031', '2045', '2080']);
  await expect(t.locator('.tl-card').nth(1).locator('.mfig img')).toBeVisible();
  await expect(t.locator('.tl-text').first()).toBeHidden();
  await t.locator('.tl-card').first().click();
  await expect(t.locator('.tl-text').first()).toBeVisible();
  await expect(t.locator('.tl-text').first()).toContainText('první tunel');
  await page.evaluate(() => go('story', { ch: '1', k: 3, then: 'chapter' }));
  const f = page.locator('.wg-funnel');
  await expect(f.locator('.fn-bar b')).toHaveText(['1 200', '300', '42']);
  await expect(f.locator('.fn-lab span')).toHaveText(['25 %', '3,5 %']);
  const widths = () => f.locator('.fn-bar').evaluateAll(l => l.map(b => Math.round(b.getBoundingClientRect().width)));
  await expect.poll(async () => { const w = await widths(); return w[0] > w[1] && w[1] > w[2] && w[2] > 0; }).toBe(true);
});

test('match game: 4 random pairs, wrong ones shake, right ones lock; XP but no Leitner boxes; again', async ({ context, page }) => {
  await visual(context);
  await openLearn(page);
  await page.click('[data-ch="1"]');
  await page.click('[data-game="g-match"]');
  await expect(page.locator('.mb.l')).toHaveCount(4);
  await expect(page.locator('.mb.r')).toHaveCount(4);
  const G = await page.evaluate(() => ({ left: S.G.left, right: S.G.right }));
  const wrongR = G.right.find(i => i !== G.left[0]);
  await page.click(`[data-ml="${G.left[0]}"]`);
  await expect(page.locator('.mb.sel')).toHaveCount(1);
  await page.click(`[data-mr="${wrongR}"]`);
  await expect(page.locator('.mb.bad')).toHaveCount(2);
  for (const i of G.left) { await page.click(`[data-ml="${i}"]`); await page.click(`[data-mr="${i}"]`); }
  await expect(page.locator('.mb.ok')).toHaveCount(8);
  await expect(page.locator('.g-done')).toContainText('1 chyba');
  await expect(page.locator('.g-done')).toContainText('+25 XP');
  expect(await page.evaluate(() => [STATS.xp, STATS.games, Object.keys(PROGRESS).length])).toEqual([25, 1, 0]);
  await page.click('[data-act=gameAgain]');
  await expect(page.locator('.mb.ok')).toHaveCount(0);
  await page.click('[data-act=gameBack]');
  expect(await page.evaluate(() => [S.screen, S.ch])).toEqual(['chapter', '1']);
});

test('order game: tap in order (tap again to undo), then check reveals the values and the misplaced ones', async ({ context, page }) => {
  await visual(context);
  await openLearn(page);
  await page.evaluate(() => startGame('g-order'));
  await expect(page.locator('.ob')).toHaveCount(4);
  await expect(page.locator('[data-act=check]')).toBeDisabled();
  const keys = await page.evaluate(() => S.G.items.map(i => i.key));
  const order = keys.map((k, i) => [k, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  await page.click(`[data-ord="${order[1]}"]`);
  await page.click(`[data-ord="${order[1]}"]`);   // undo
  await expect(page.locator('.ob.picked')).toHaveCount(0);
  for (const k of order) await page.click(`[data-ord="${k}"]`);
  await page.click('[data-act=check]');
  await expect(page.locator('.ob.good')).toHaveCount(4);
  await expect(page.locator('.ob .show')).toHaveText(keys.slice().sort((a, b) => a - b).map(String));
  await expect(page.locator('.g-done')).toContainText('Perfektní');
  await page.click('[data-act=gameAgain]');
  const keys2 = await page.evaluate(() => S.G.items.map(i => i.key));
  const desc = keys2.map((k, i) => [k, i]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  for (const k of desc) await page.click(`[data-ord="${k}"]`);
  await page.click('[data-act=check]');
  await expect(page.locator('.ob.miss')).toHaveCount(4);
  await expect(page.locator('.ob.miss .fix').first()).toHaveText('patří na 4. místo');
  expect(await page.evaluate(() => Object.keys(PROGRESS).length)).toBe(0);
});

test('every second lesson from a chapter with games offers a bonus game at the end; the end screen shows XP, best combo and what next', async ({ context, page }) => {
  await visual(context);
  await openLearn(page);
  await page.evaluate(() => { STATS.lessons = 1; STATS.seen['1'] = 1; startLesson('1'); });
  await playThrough(page);
  await expect(page.locator('[data-xp]')).toContainText('XP');
  await expect(page.locator('.gains [data-badge=first]')).toBeVisible();
  await expect(page.locator('[data-game]')).toBeVisible();
  await expect(page.locator('[data-act=again]')).toHaveText('🎯 Další lekce');
  await page.click('[data-game]');
  expect(await page.evaluate(() => S.screen)).toBe('game');
});

test('chapter challenge: 10 questions from the chapter like the practice test; 80 % earns its badge; the boxes stay', async ({ context, page }) => {
  await visual(context);
  await openLearn(page);
  await packsLoaded(page);
  await page.click('[data-ch="1"]');
  await page.click('[data-act=chalStart]');
  await expect(page.locator('h2')).toHaveText('Zkouška kapitoly');
  await page.click('[data-act=timer]');
  await page.click('[data-act=exam]');
  expect(await page.evaluate(() => [S.L.total, S.L.chal, S.L.queue.every(i => chOf(i.c) === '1'), S.L.queue.some(i => i.type === 'pic')])).toEqual([6, '1', true, true]);
  await playThrough(page, { wrongAt: [0, 1] });
  await expect(page.locator('[data-chal]')).toHaveText('67 %');
  expect(await page.evaluate(() => !!STATS.badges['chal-1'])).toBe(false);
  await page.click('[data-act=chalAgain]');
  await page.click('[data-act=exam]');
  await playThrough(page);
  await expect(page.locator('[data-chal]')).toHaveText('100 %');
  await expect(page.locator('h1')).toHaveText('Zkouška splněná!');
  await expect(page.locator('.gains [data-badge=chal-1]')).toBeVisible();
  expect(await page.evaluate(() => [!!STATS.badges['chal-1'], Object.keys(PROGRESS).length])).toEqual([true, 0]);
  await page.click('[data-act=home]');
  await expect(page.locator('[data-ch="1"] .cb i.on')).toHaveText('🏆');
});

test('stats live under "_" in the progress doc: larger XP, the union of badges and days (streak), card progress untouched', async ({ context, page }) => {
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00'));
  const cloud = { 'luna-open': { b: 4, s: 5, c: 5, w: 0, t: Date.now() }, _: { xp: 500, best: 3, badges: { first: 1 }, days: { '2026-11-10': 2 }, seen: { '2': 1 }, lessons: 2 } };
  const { db } = await visual(context, { cloud: { [`progress/${UID}`]: { fields: { data: { stringValue: JSON.stringify(cloud) } } } } });
  await context.addInitScript(() => {
    if (!localStorage.getItem('zg-stats-v1')) localStorage.setItem('zg-stats-v1', JSON.stringify({ xp: 120, best: 7, badges: { combo10: 5 }, days: { '2026-11-11': 1 }, seen: {}, lessons: 1 }));
  });
  await openLearn(page);
  await page.waitForFunction(() => STATS.xp === 500);
  expect(await page.evaluate(() => [STATS.best, Object.keys(STATS.badges).sort(), streak(), !!STATS.seen['2'], Object.keys(PROGRESS)])).toEqual([7, ['combo10', 'first'], 2, true, ['luna-open']]);
  await expect(page.locator('.overall')).toContainText('1 / 10');
  await expect(page.locator('[data-streak]')).toHaveAttribute('data-streak', '2');
  await expect(page.locator('.badgestrip')).toContainText('2 / ');
  const saved = JSON.parse(db.get(`progress/${UID}`).fields.data.stringValue);
  expect(saved['luna-open']).toEqual(cloud['luna-open']);
  expect(saved._).toMatchObject({ xp: 500, best: 7, badges: { first: 1, combo10: 5 }, days: { '2026-11-10': 2, '2026-11-11': 1 } });
  // the stats key never becomes a card, and merging keeps the larger values either way
  expect(await page.evaluate(() => {
    const p = mergeProg({}, { _: { xp: 9 }, a: { b: 1, s: 1, t: 1 } });
    const st = mergeStats(normStats({ xp: 900, badges: { x: 2 } }), { xp: 100, badges: { x: 1, y: 3 } });
    return [Object.keys(p), st.xp, st.badges];
  })).toEqual([['a'], 900, { x: 1, y: 3 }]);
});

test('brochure reader: pages fetched on demand with their neighbours, page numbers, chapter jump, zoom, swipe; opened from a chapter and from an answer', async ({ context, page }) => {
  const { calls } = await visual(context);
  await openLearn(page);
  await page.click('[data-act=reader]');
  await expect(page.locator('.rd-ind')).toHaveText('Obálka');
  await expect(page.locator('.rd-view img')).toBeVisible();
  await expect.poll(() => gets(calls, 'p02')).toBe(1);   // the next page is fetched ahead
  expect(gets(calls, 'p05')).toBe(0);
  await page.click('[data-rd=next]');
  await expect(page.locator('.rd-ind')).toHaveText('Úvod');
  await page.click('[data-rd=next]');
  await expect(page.locator('.rd-ind')).toHaveText('str. 3 / 8');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.rd-ind')).toHaveText('str. 4 / 8');
  await swipe(page, '.rd-view', -120);
  await expect(page.locator('.rd-ind')).toHaveText('str. 5 / 8');
  await page.click('[data-rd=zoom]');
  await expect(page.locator('.rd-view')).toHaveClass(/zoomed/);
  await swipe(page, '.rd-view', -120);   // zoomed: a swipe pans, it doesn't turn the page
  await expect(page.locator('.rd-ind')).toHaveText('str. 5 / 8');
  await page.click('[data-rd=menu]');
  await page.click('[data-rdch="2"]');
  await expect(page.locator('.rd-ind')).toHaveText('str. 7 / 8');
  await expect(page.locator('.rd-view img')).toBeVisible();
  expect(gets(calls, 'p03')).toBe(1);
  await page.click('[data-rd=close]');
  await expect(page.locator('#rd')).toHaveCount(0);
  await page.click('[data-ch="1"]');
  await page.click('[data-act=chReader]');
  await expect(page.locator('.rd-ind')).toHaveText('str. 3 / 8');
  expect(gets(calls, 'p03')).toBe(1);   // cached
  await page.keyboard.press('Escape');
  // from an answer: the quote, then "open in the brochure"; the lesson is still there after
  await lessonOf(page, [['dome', 'mc']]);
  await answer(page);
  await page.click('[data-act=quote]');
  await page.click('.quote [data-act=readPage]');
  await expect(page.locator('.rd-ind')).toHaveText('str. 5 / 8');
  await page.click('[data-rd=close]');
  await expect(page.locator('.feedback.ok')).toBeVisible();
});

test('"Stáhnout PDF" joins the chunk docs into one PDF file under its name', async ({ context, page }) => {
  const { calls } = await visual(context);
  await openLearn(page);
  await page.click('[data-act=reader]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-rd=pdf]')]);
  expect(dl.suggestedFilename()).toBe('Luna7_brozura.pdf');
  const file = await dl.path();
  expect((await import('fs')).readFileSync(file).equals(PDF_BYTES)).toBe(true);
  expect([gets(calls, 'pdf1'), gets(calls, 'pdf2')]).toEqual([1, 1]);
  await expect(page.locator('.rd-pdf a')).toHaveText('Otevřít PDF');
});

test('XP and combo in a lesson: 🔥 series, multiplier from 3 in a row, reset on a mistake', async ({ context, page }) => {
  await mockLearn(context);
  await openLearn(page);
  await lessonOf(page, [['crew', 'mc'], ['crew', 'mc'], ['crew', 'mc'], ['crew', 'mc']]);
  const xp = [];
  for (let k = 0; k < 3; k++) { await answer(page); xp.push(await page.evaluate(() => cur().state.xp)); await page.click('[data-act=next]'); }
  expect(xp).toEqual([10, 10, 15]);
  await expect(page.locator('[data-combo]')).toHaveText('🔥 3');
  await answer(page, { wrong: true });
  expect(await page.evaluate(() => [S.L.combo, S.L.bestCombo, S.L.xp])).toEqual([0, 3, 35]);
  await expect(page.locator('[data-combo]')).toHaveCount(0);
});
