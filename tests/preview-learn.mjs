#!/usr/bin/env node
// Screenshots of the study page (learn/) with any course built to the contract, to look at it before it goes live.
//
//   node tests/preview-learn.mjs <buildDir> <outDir> [--only name,name]
//
// <buildDir>/docs/<docId>.txt holds the `data` string of each Firestore doc (the course doc, media packs,
// brochure pages, PDF chunks), exactly as the private course build writes them. The page runs signed in
// with a fake account; Firestore reads come from that folder, progress lives in memory. Nothing is sent
// anywhere except the fonts and YouTube thumbnails the page loads itself.
// --width 375 tries another phone width (default 390 × 844).
// --only takes name prefixes: home, chapter, story, widget, lesson, question, feedback, game, reader, end, badges.
import { chromium } from '@playwright/test';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const onlyAt = args.indexOf('--only');
const only = onlyAt >= 0 ? args.splice(onlyAt, 2)[1].split(',').map(s => s.trim()).filter(Boolean) : null;
const widthAt = args.indexOf('--width');
const width = widthAt >= 0 ? +args.splice(widthAt, 2)[1] : 390;
const [buildDir, outDir] = args;
if (!buildDir || !outDir) { console.error('usage: node tests/preview-learn.mjs <buildDir> <outDir> [--only name,name] [--width 390]'); process.exit(2); }
const docsDir = path.join(path.resolve(buildDir), 'docs');
fs.mkdirSync(outDir, { recursive: true });

const UID = 'preview1';
const FS = 'https://firestore.googleapis.com/v1/projects/mia-animals/databases/(default)/documents';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

// Serve the worktree like the test server does.
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(buf);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
await context.addInitScript(uid => {
  if (!localStorage.getItem('zv-auth-v1')) localStorage.setItem('zv-auth-v1', JSON.stringify({ uid, id: 'tok-' + uid, refresh: 'ref-' + uid, exp: Date.now() + 3600e3 }));
  localStorage.setItem('zv-sound-v1', 'false');
}, UID);
await context.route(/securetoken|identitytoolkit/, r => {
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
  return r.fulfill({ headers: CORS, contentType: 'application/json', body: JSON.stringify({ user_id: UID, id_token: 'tok-' + UID, refresh_token: 'ref-' + UID, expires_in: '3600' }) });
});
const progress = new Map();
await context.route(/firestore\.googleapis\.com/, r => {
  const req = r.request(), m = req.method();
  if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
  const J = (o, status = 200) => r.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(o) });
  const key = decodeURIComponent(req.url()).slice(FS.length + 1).split('?')[0];
  if (key.startsWith('private/')) {
    const f = path.join(docsDir, key.slice('private/'.length) + '.txt');
    if (!f.startsWith(docsDir) || !fs.existsSync(f)) return J({ error: { status: 'NOT_FOUND' } }, 404);
    return J({ fields: { data: { stringValue: fs.readFileSync(f, 'utf8') }, updated: { integerValue: '1' } } });
  }
  if (key === `progress/${UID}`) {
    if (m === 'GET') return progress.has(key) ? J(progress.get(key)) : J({ error: 'not found' }, 404);
    if (m === 'PATCH') { progress.set(key, JSON.parse(req.postData())); return J(progress.get(key)); }
  }
  if (key === 'feedback') return J({});
  return J({ error: 'denied' }, 403);
});

const page = await context.newPage();
await page.emulateMedia({ reducedMotion: 'reduce' });   // no confetti, widgets settle at once: steady pictures
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const saved = [];
const want = name => !only || only.some(o => name.startsWith(o));
const settle = (ms = 450) => page.waitForTimeout(ms);
async function shot(name, { full = false, el = null } = {}) {
  if (!want(name)) return;
  const file = path.join(outDir, name.replace(/[^\w.-]+/g, '_') + '.png');
  await ev(() => { document.getElementById('toasts').innerHTML = ''; document.querySelectorAll('.confetti').forEach(x => x.remove()); });
  // full-page and element shots show the layout as it is, without the bars that stick to the screen edge
  const tag = full || el ? await page.addStyleTag({ content: '.st-nav, .feedback { position: static !important; }' }) : null;
  if (el) await page.locator(el).first().screenshot({ path: file });
  else await page.screenshot({ path: file, fullPage: full });
  if (tag) await tag.evaluate(t => t.remove());
  saved.push(file);
}
const ev = (fn, arg) => page.evaluate(fn, arg);

await page.goto(base + '/learn/');
await page.waitForFunction(() => typeof S !== 'undefined' && S.screen !== 'loading');
if (await ev(() => S.screen) !== 'home') {
  await shot('home');
  console.error('The page did not reach home (screen: ' + await ev(() => S.screen) + '). Is the course doc in ' + docsDir + '?');
  await browser.close(); server.close(); process.exit(1);
}
// pictures load in the background: wait for all packs (or give up after 8 s)
await page.waitForFunction(() => { const want = (COURSE.packs || []).length; return Object.keys(PACKS).length >= want; }, null, { timeout: 8000 }).catch(() => console.warn('not all media packs loaded'));
await settle(800);
const info = await ev(() => ({
  chapters: CHAPTERS.map(c => ({ id: c.id, story: storyOf(c.id).map(s => s.widget ? s.widget.type : s.video ? 'video' : s.img ? 'img' : 'text') })),
  games: GAMES.filter(gameOk).map(g => ({ id: g.id, type: g.type })),
  pages: pageList().length,
}));
const two = n => String(n).padStart(2, '0');

await shot('home', { full: true });
await shot('home-top');

const ch0 = (info.chapters.find(c => c.story.length) || info.chapters[0] || {}).id;
if (ch0 != null) { await ev(ch => go('chapter', { ch }), ch0); await settle(); await shot('chapter', { full: true }); }

for (const ch of info.chapters) {
  for (let k = 0; k < ch.story.length; k++) {
    const name = `story-${ch.id}-${two(k + 1)}`, type = ch.story[k];
    await ev(([ch, k]) => go('story', { ch, k, then: 'chapter' }), [ch.id, k]);
    await settle(type === 'funnel' ? 1500 : 700);
    await shot(name, { full: true });
    if (type === 'parabola' && want('widget')) {
      const mids = await ev(() => document.querySelector('.wg-parabola').wg.mids);
      for (let i = 0; i < mids.length; i++) {
        await ev(t => document.querySelector('.wg-parabola').wg.seek(t), mids[i]);
        await settle(900);
        const id = await ev(() => document.querySelector('.wg-parabola').dataset.phase);
        await shot(`widget-parabola-${ch.id}-${two(k + 1)}-${i + 1}-${id}`, { el: '.wg-parabola' });
      }
    }
    if (type === 'orbit' && want('widget')) {
      const n = await page.locator('.wg-orbit [data-shot]').count();
      for (let i = 0; i < n; i++) {
        await page.locator('.wg-orbit [data-shot]').nth(i).click();
        await page.waitForFunction(() => document.querySelector('.wg-orbit').dataset.landed, null, { timeout: 6000 }).catch(() => {});
        await settle(i === n - 1 ? 1200 : 300);
        await shot(`widget-orbit-${ch.id}-${two(k + 1)}-shot${i + 1}`, { el: '.wg-orbit' });
      }
    }
    if (type === 'timeline' && want('widget')) {
      await page.locator('.wg-timeline .tl-card').first().click();
      await settle(300);
      await shot(`widget-timeline-${ch.id}-${two(k + 1)}-open`, { el: '.wg-timeline' });
    }
    if (type === 'funnel') await shot(`widget-funnel-${ch.id}-${two(k + 1)}`, { el: '.wg-funnel' });
  }
}

// Lesson screens, built directly from the course's cards.
const pickCards = await ev(() => {
  const img = CARDS.find(c => c.img && c.imgAt !== 'q' && c.kind !== 'pic' && mediaUrl(c.img));
  const imgQ = CARDS.find(c => c.img && c.imgAt === 'q' && mediaUrl(c.img));
  const plain = CARDS.find(c => !c.img && !['calc', 'pic'].includes(c.kind));
  const picC = CARDS.find(c => c.kind === 'pic' && picReady(c));
  return { img: img && img.id, imgQ: imgQ && imgQ.id, plain: plain && plain.id, pic: picC && picC.id, any: CARDS[0] && CARDS[0].id };
});
const lessonWith = (id, how) => ev(([id, how]) => {
  const c = CARDS.find(x => x.id === id);
  const it = how === 'intro' ? { c, type: 'intro' } : makeQ(c, 0, how === 'pic' ? undefined : 'mc');
  go('lesson', { L: newSession([it, makeQ(c, 0, 'mc')]) });
}, [id, how]);
if (pickCards.img || pickCards.any) { await lessonWith(pickCards.img || pickCards.any, 'intro'); await settle(); await shot('lesson-intro' + (pickCards.img ? '-pic' : ''), { full: true }); }
if (pickCards.plain) { await lessonWith(pickCards.plain, 'mc'); await settle(); await shot('question-mc'); }
if (pickCards.imgQ) { await lessonWith(pickCards.imgQ, 'mc'); await settle(); await shot('question-mc-imgq', { full: true }); }
if (pickCards.pic) {
  await lessonWith(pickCards.pic, 'pic'); await settle(); await shot('question-pic');
  await ev(() => { const it = cur(); answer(it, true, { pick: it.options.indexOf(it.c.img) }); }); await settle(600); await shot('feedback-pic-card', { full: true });
}
const fbCard = pickCards.img || pickCards.plain;
if (fbCard) {
  await lessonWith(fbCard, 'mc');
  await ev(() => { const it = cur(); S.L.combo = 3; answer(it, true, { pick: it.options.indexOf(it.c.a) }); });
  await settle(600); await shot('feedback-pic', { full: true }); await shot('feedback-pic-view');
  await lessonWith(fbCard, 'mc');
  await ev(() => { const it = cur(); answer(it, false, { pick: it.options.findIndex(o => o !== it.c.a) }); });
  await settle(600); await shot('feedback-wrong');
}

for (const g of info.games) {
  await ev(id => startGame(id), g.id); await settle();
  if (g.type === 'match') {
    await shot(`game-match-${g.id}`);
    await ev(() => { const G = S.G, i = G.left[0]; matchTap('l', i); matchTap('r', i); matchTap('l', G.left[1]); matchTap('r', G.left[1] === G.right[0] ? G.right[1] : G.right[0]); });
    await settle(150); await shot(`game-match-${g.id}-play`);
    await ev(() => { const G = S.G; G.left.forEach(i => { if (!G.ok.has(i)) { matchTap('l', i); matchTap('r', i); } }); }); await settle(600);
    await shot(`game-match-${g.id}-done`, { full: true });
  } else {
    await ev(() => { orderTap(2); orderTap(0); }); await settle(200); await shot(`game-order-${g.id}`);
    await ev(() => { const G = S.G; G.items.forEach((_, k) => { if (!G.picks.includes(k)) orderTap(k); }); orderCheck(); }); await settle(600);
    await shot(`game-order-${g.id}-checked`, { full: true });
  }
}

if (info.pages) {
  const at = await ev(() => { const c = CHAPTERS.find(c => Array.isArray(c.pages) && c.pages.length); return c ? c.pages[0] : null; });
  await ev(n => openReader(n), at);
  await page.waitForSelector('#rd .rd-view img', { timeout: 8000 }).catch(() => console.warn('brochure page did not load'));
  await settle(300); await shot('reader');
  if (await page.locator('[data-rd=menu]').count()) { await page.click('[data-rd=menu]'); await settle(250); await shot('reader-menu'); }
  await ev(() => closeReader());
}

// A real lesson played through (all right) for the end screen.
await ev(() => { go('home'); startLesson(null, null, true); });
for (let k = 0; k < 120 && await ev(() => S.screen) === 'lesson'; k++) {
  await ev(() => { const it = cur(); if (it.type === 'intro') return next();
    const pick = it.type === 'pic' ? it.options.indexOf(it.c.img) : it.options ? it.options.indexOf(it.c.a) : it.type === 'tf' ? (it.truth ? 0 : 1) : -1;
    answer(it, true, { pick, typed: it.type === 'calc' ? String(it.ans) : it.c.a }); next(); });
}
await settle(900); await shot('end-lesson', { full: true });
if (ch0 != null) { await ev(ch => go('examStart', { ch }), ch0); await settle(); await shot('end-challenge-start'); }
await ev(() => go('badges')); await settle(); await shot('badges', { full: true });
await ev(() => go('home')); await settle(900); await shot('home-after', { full: true });

await browser.close(); server.close();
console.log(`${saved.length} screenshots in ${outDir}`);
if (errors.length) { console.error('page errors:\n' + errors.join('\n')); process.exit(1); }
