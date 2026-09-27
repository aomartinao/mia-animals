import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = name => fs.readFileSync(path.join(here, 'fixtures', name));
const SMARTCROP = fs.readFileSync(path.join(here, 'node_modules/smartcrop/smartcrop.js'), 'utf8');
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const HOST_OFFSET = { en: 0, cs: 1, de: 2, fr: 3, it: 4, es: 5, pl: 6, nl: 7 };

/** Default photos: a different placeholder per Wikipedia so animals get several photos. */
export const defaultPhotos = (host, title) => `p${(title.length + HOST_OFFSET[host]) % 8}.jpg`;
export const wikimediaUrl = (fixtureName, tag) => {
  const file = `${fixtureName.replace('.jpg', '')}__${tag}.jpg`.replace(/\s+/g, '_');
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(file)}/640px-${encodeURIComponent(file)}`;
};

/** In-memory stand-in for Firebase anonymous auth + Firestore REST. */
const FOLD = { á: 'a', à: 'a', â: 'a', ä: 'a', č: 'c', ď: 'd', é: 'e', ě: 'e', ë: 'e', í: 'i', ï: 'i', ň: 'n', ó: 'o', ö: 'o', ô: 'o', ř: 'r', š: 's', ť: 't', ú: 'u', ů: 'u', ü: 'u', ý: 'y', ž: 'z' };
export const nameKey = n => n.toLowerCase().replace(/[áàâäčďéěëíïňóöôřšťúůüýž]/g, c => FOLD[c]).replace(/[^a-z0-9]/g, '');

export class FakeFirebase {
  constructor({ google = { uid: 'gmia', email: 'mia@skola.cz' } } = {}) { this.db = new Map(); this.n = 0; this.google = google; this.googleUids = new Set(); }
  async attach(context) {
    const FS = 'https://firestore.googleapis.com/v1/projects/mia-animals/databases/(default)/documents';
    const tokens = uid => ({ localId: uid, idToken: 'tok-' + uid, refreshToken: 'ref-' + uid, expiresIn: '3600', user_id: uid, id_token: 'tok-' + uid, refresh_token: 'ref-' + uid, expires_in: '3600' });
    await context.route(/identitytoolkit|securetoken/, r => {
      const req = r.request();
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      const J = o => r.fulfill({ headers: CORS, contentType: 'application/json', body: JSON.stringify(o) });
      const url = req.url(), body = req.postData() || '';
      if (url.includes('accounts:createAuthUri')) {
        const { continueUri, providerId } = JSON.parse(body);
        return J({ providerId, sessionId: 'sess1', authUri: 'https://accounts.google.com/o/oauth2/auth?state=st1&redirect_uri=' + encodeURIComponent(continueUri) });
      }
      if (url.includes('accounts:signInWithIdp')) {
        const { requestUri, sessionId } = JSON.parse(body);
        if (sessionId !== 'sess1' || !/[?&#](code|id_token)=/.test(requestUri)) return r.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: '{"error":{"message":"INVALID_IDP_RESPONSE"}}' });
        this.googleUids.add(this.google.uid);
        return J({ ...tokens(this.google.uid), email: this.google.email });
      }
      if (url.includes('securetoken')) return J(tokens(decodeURIComponent(body).match(/refresh_token=ref-(\S+)/)[1]));
      return J(tokens('uid' + (++this.n)));
    });
    // Google's consent page: straight back to the app with an auth code.
    await context.route(/accounts\.google\.com/, r => {
      const back = new URL(r.request().url()).searchParams.get('redirect_uri');
      // Like the real flow Firebase starts (response_type=id_token), the answer comes back in the fragment.
      return r.fulfill({ status: 302, headers: { location: back + '#state=st1&id_token=gid1&authuser=0' } });
    });
    await context.route(/firestore\.googleapis\.com/, r => {
      const req = r.request(), m = req.method();
      if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      const J = (o, status = 200) => r.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(o) });
      const p = decodeURIComponent(req.url()).slice(FS.length);
      const uid = (req.headers()['authorization'] || '').replace('Bearer tok-', '');
      if (p.endsWith(':runQuery')) {
        const parent = p.slice(0, -':runQuery'.length).replace(/^\//, '');
        const q = JSON.parse(req.postData()).structuredQuery;
        const pre = (parent ? parent + '/' : '') + q.from[0].collectionId + '/';
        let docs = [...this.db].filter(([k]) => k.startsWith(pre) && !k.slice(pre.length).includes('/'));
        if (q.orderBy) {
          const f = q.orderBy[0].field.fieldPath;
          docs = docs.filter(([, v]) => v.fields[f]).sort((a, b) => +b[1].fields[f].integerValue - +a[1].fields[f].integerValue);
        }
        docs = docs.slice(0, q.limit || 100).map(([k, v]) => ({ document: { name: 'projects/mia-animals/databases/(default)/documents/' + k, fields: v.fields } }));
        return J(docs.length ? docs : [{ readTime: 'x' }]);
      }
      const key = p.replace(/^\//, '').split('?')[0];
      if (m === 'GET') return this.db.has(key) ? J(this.db.get(key)) : J({ error: 'not found' }, 404);
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      if (key === 'feedback' && m === 'POST') {
        const f = body.fields;
        if (f.uid.stringValue !== uid || f.text.stringValue.length < 3) return J({ error: 'denied' }, 403);
        this.db.set('feedback/f' + (++this.n), body); return J(body);
      }
      if (key.startsWith('users/') && m !== 'DELETE' && !this.googleUids.has(uid)) return J({ error: 'google only' }, 403);
      if (key.startsWith('names/')) {
        // Nickname registry: create only, owner may delete.
        const cur = this.db.get(key);
        if (m === 'PATCH' && !cur && body.fields.uid.stringValue === uid) { this.db.set(key, body); return J(body); }
        if (m === 'DELETE' && cur && cur.fields.uid.stringValue === uid) { this.db.delete(key); return J({}); }
        return J({ error: 'denied' }, 403);
      }
      const owner = /^duels\/[^/]+$/.test(key) ? body && body.fields.by.stringValue : key.split('/').pop();
      if (owner !== uid) return J({ error: 'denied' }, 403);
      if (key.startsWith('duels/') && this.db.has(key)) return J({ error: 'create only' }, 403);
      if (m === 'PATCH' && !key.startsWith('users/')) {
        // Like the rules: the name written must belong to the writer.
        const n = body.fields.name || body.fields.byName;
        const nk = n && 'names/' + nameKey(n.stringValue);
        if (n && (!this.db.has(nk) || this.db.get(nk).fields.uid.stringValue !== uid)) return J({ error: 'name not owned' }, 403);
      }
      if (m === 'PATCH') { this.db.set(key, body); return J(body); }
      if (m === 'DELETE') { this.db.delete(key); return J({}); }
      return J({}, 400);
    });
  }
}

/**
 * Mock all network the app uses. `photos(host, title, index)` returns a
 * fixture file name (or null) for each Wikipedia lookup.
 */
export async function setupMocks(context, { photos = defaultPhotos, firebase = new FakeFirebase(), onboarded = true, lang = 'cs' } = {}) {
  // Tests run in Czech unless they ask otherwise (lang: 'en', or null to use the browser language).
  if (lang) await context.addInitScript(l => { if (!localStorage.getItem('zv-lang-v1')) localStorage.setItem('zv-lang-v1', JSON.stringify(l)); }, lang);
  if (onboarded) await context.addInitScript(() => localStorage.setItem('zv-onboarded-v1', 'true'));
  await context.route(/cdn\.jsdelivr\.net\/npm\/smartcrop/, r => r.fulfill({ contentType: 'application/javascript', body: SMARTCROP }));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route(/wikipedia\.org\/w\/api\.php/, async r => {
    const u = new URL(r.request().url());
    const host = u.hostname.slice(0, 2);
    const titles = u.searchParams.get('titles').split('|');
    const pages = titles.map((t, i) => {
      const f = photos(host, t, i);
      return f ? { title: t, thumbnail: { source: wikimediaUrl(f, `${host}_${t}`) } } : { title: t };
    });
    await r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify({ query: { pages } }) });
  });
  await context.route(/upload\.wikimedia\.org/, r => {
    const last = decodeURIComponent(r.request().url().split('?')[0].split('/').pop()).replace(/^\d+px-/, '');
    const name = last.split('__')[0] + '.jpg';
    r.fulfill({ contentType: 'image/jpeg', headers: CORS, body: fixture(name) });
  });
  await firebase.attach(context);
  return firebase;
}

/** Open the app and wait until the first real screen is shown. */
export async function openApp(page, url = '/') {
  await page.goto(url);
  await page.waitForFunction(() => typeof S !== 'undefined' && S.screen !== 'loading');
}

/** Answer the current question correctly (or wrongly) through the UI. */
export async function answer(page, { wrong = false } = {}) {
  const it = await page.evaluate(() => {
    const it = S.L.queue[S.L.i];
    const c = it.type === 'pickName' ? it.options.indexOf(it.a)
      : it.type === 'pickImage' ? it.options.findIndex(o => o.a === it.a)
      : it.type === 'epithet' ? it.options.indexOf(it.a.second) : -1;
    return { type: it.type, c, n: (it.options || []).length, name: it.a.cz };
  });
  if (it.type === 'intro') { await page.click('[data-act=next]'); return it; }
  if (it.type === 'type') {
    await page.fill('input[name=ans]', wrong ? 'nevim' : it.name);
    await page.click('button[type=submit]');
  } else {
    await (await page.$$('[data-pick]'))[wrong ? (it.c + 1) % it.n : it.c].click();
  }
  return it;
}

/** Play the current lesson/exam/duel to the end. */
export async function playThrough(page, { wrongAt = [] } = {}) {
  const seen = new Set(); let k = 0;
  while (await page.evaluate(() => S.screen) === 'lesson') {
    const it = await answer(page, { wrong: wrongAt.includes(k) });
    seen.add(it.type);
    if (it.type !== 'intro') { await page.keyboard.press('Enter'); k++; }
    if (k > 80) throw new Error('lesson did not end');
  }
  return { answered: k, types: seen };
}

/** Collect page errors so a test can assert there were none. */
export function trackErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return errors;
}

/** Wait until finite CSS animations (screen/detail slide-ins) have finished, so layout can be measured. */
export async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => a.effect && a.effect.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => {}))));
}
/** Open an animal's Atlas detail and wait for it to finish sliding in. */
export async function openDetail(page, name) {
  await page.click(`[data-open="${name}"]`);
  await page.waitForSelector('.detail');
  await settle(page);
}
