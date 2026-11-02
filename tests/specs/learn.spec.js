import { test, expect } from '@playwright/test';
import { setupMocks, openApp } from '../helpers.js';

// The Zero-G study page (learn/). Its real cards are private and never in the repo, so these tests
// use a small made-up course about a fictional Moon base.
const UID = 'mia1';
const FS = 'https://firestore.googleapis.com/v1/projects/mia-animals/databases/(default)/documents';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

const COURSE = {
  title: 'Testovací kurz',
  test: { from: '2026-11-24', to: '2026-12-06' },
  chapters: [{ id: '1', title: 'Měsíční základna' }, { id: '2', title: 'Fyzika na Měsíci' }],
  cards: [
    { id: 'luna-open', ch: '1.1', page: 3, kind: 'date', quote: 'Základna Luna-7 byla slavnostně otevřena 14. května 2031',
      fact: 'Základna Luna-7 byla otevřena 14. května 2031.', q: 'Kdy byla otevřena základna Luna-7?', a: '14. května 2031',
      alt: ['14. 5. 2031'], wrong: ['15. května 2031', '14. června 2031', '4. května 2013'] },
    { id: 'crew', ch: '1.1', page: 3, kind: 'number', quote: 'Na základně žije 42 lidí',
      fact: 'Na základně Luna-7 žije 42 lidí.', q: 'Kolik lidí žije na základně Luna-7?', a: '42', alt: [], wrong: ['24', '40', '142'] },
    { id: 'first-commander', ch: '1.2', page: 4, kind: 'name', quote: 'Prvním velitelem byl Petr Hvězdář',
      fact: 'Prvním velitelem základny byl Petr Hvězdář.', q: 'Kdo byl prvním velitelem základny?', a: 'Petr Hvězdář',
      alt: [], wrong: ['Pavel Hvězdář', 'Petr Měsíček', 'Jan Kometa'] },
    { id: 'train-speed', ch: '1.2', page: 4, kind: 'number', quote: 'měsíční vlak jezdí rychlostí 28 000 km/h',
      fact: 'Měsíční vlak jezdí rychlostí 28 000 km/h.', q: 'Jak rychle jezdí měsíční vlak?', a: '28 000 km/h',
      alt: [], wrong: ['2 800 km/h', '8 200 km/h', '82 000 km/h'] },
    { id: 'dome', ch: '1.3', page: 5, kind: 'fact', quote: 'Kopule je vyrobena z titanu',
      fact: 'Kopule základny je z titanu.', q: 'Z čeho je kopule základny?', a: 'z titanu', alt: ['titan'], wrong: ['z hliníku', 'z oceli', 'ze skla'] },
    { id: 'jump', ch: '2.1', page: 7, kind: 'why', quote: 'skáčeme výš, protože gravitace je tam slabší',
      fact: 'Na Měsíci skáčeme výš, protože gravitace je slabší.', q: 'Proč na Měsíci skáčeme výš?', a: 'protože gravitace je slabší',
      alt: [], wrong: ['protože tam není vzduch', 'protože tam máme menší hmotnost', 'protože se Měsíc rychle točí'] },
    { id: 'lbs', ch: '2.1', page: 7, kind: 'term', quote: 'LBS (Lunar Base Station)',
      fact: 'Zkratka LBS znamená Lunar Base Station.', q: 'Co znamená zkratka LBS?', a: 'Lunar Base Station',
      alt: [], wrong: ['Lunar Bus Service', 'Long Base Station', 'Lunar Battery System'] },
    { id: 'calc-moon', ch: '2.2', page: 8, kind: 'calc', quote: 'Fg = m · 1,62',
      q: 'Jakou tíhovou silou působí Měsíc na těleso o hmotnosti {m} kg? (g = 1,62 m/s²)', m: [10, 20], k: 1.62, unit: 'N' },
    { id: 'train-after', ch: '2.2', page: 8, kind: 'think', uses: ['luna-open'], quote: 'Vlak poprvé přijel v roce 2080',
      fact: 'Od otevření základny (2031) do příjezdu prvního vlaku (2080) uplynulo 49 let.', q: 'Kolik let uplynulo od otevření základny do příjezdu prvního vlaku?',
      a: '49 let', alt: [], wrong: ['39 let', '51 let', '59 let'] },
  ],
};

/** Mock the sign-in refresh and Firestore for learn/. `allowed: false` answers like the rules for anyone else. */
async function mockLearn(context, { allowed = true, auth = true, cloud = {} } = {}) {
  const calls = { signUp: 0, firestore: [] };
  const db = new Map(Object.entries(cloud));
  if (auth) await context.addInitScript(uid => {
    if (!localStorage.getItem('zv-auth-v1')) localStorage.setItem('zv-auth-v1', JSON.stringify({ uid, id: 'tok-' + uid, refresh: 'ref-' + uid, exp: Date.now() + 3600e3 }));
  }, UID);
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
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
    if (key === 'private/zero-g-2026') return allowed ? J({ fields: { data: { stringValue: JSON.stringify(COURSE) } } }) : J({ error: { status: 'PERMISSION_DENIED' } }, 403);
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
  const it = await page.evaluate(() => { const it = S.L.queue[S.L.i]; return { type: it.type, a: it.c.a, ans: it.ans, options: it.options, truth: it.truth }; });
  if (it.type === 'intro') { await page.click('[data-act=next]'); return it; }
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
  await expect.poll(() => db.has(`progress/${UID}`)).toBe(true);
  const saved = JSON.parse(db.get(`progress/${UID}`).fields.data.stringValue);
  expect(Object.keys(saved).sort()).toEqual(['crew', 'dome', 'first-commander', 'jump', 'luna-open', 'train-speed']);
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
