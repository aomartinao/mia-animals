// Made-up courses for the study page (learn/): a fictional Moon base. The real course is private and never in
// the repo. OLD_COURSE is the first course shape (cards only); VISUAL_COURSE uses every optional field of the
// visual course contract (pictures, stories, widgets, games, brochure pages, PDF). VISUAL_DOCS holds the
// Firestore docs next to it, keyed by doc id, each value being the doc's `data` string.
import fs from 'fs';
import path from 'path';

export const COURSE_ID = 'zero-g-2026';

const CARDS = [
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
];

export const OLD_COURSE = {
  title: 'Testovací kurz',
  test: { from: '2026-11-24', to: '2026-12-06' },
  chapters: [{ id: '1', title: 'Měsíční základna' }, { id: '2', title: 'Fyzika na Měsíci' }],
  cards: CARDS,
};

/* Pictures: small drawn SVG scenes, so the screens can be looked at. */
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const svgUri = svg => 'data:image/svg+xml;base64,' + b64(svg);
function scene(label, emoji, c1, c2, w = 640, h = 420) {
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="${w * 0.82}" cy="${h * 0.2}" r="${h * 0.09}" fill="#fff" opacity=".85"/>
    ${[...Array(18)].map((_, i) => `<circle cx="${(i * 97) % w}" cy="${(i * 53) % (h * 0.5)}" r="${1 + (i % 3)}" fill="#fff" opacity=".7"/>`).join('')}
    <path d="M0 ${h * 0.72} Q ${w * 0.25} ${h * 0.62} ${w * 0.5} ${h * 0.7} T ${w} ${h * 0.68} V ${h} H 0 Z" fill="#c9ccd6"/>
    <path d="M0 ${h * 0.82} Q ${w * 0.3} ${h * 0.76} ${w * 0.6} ${h * 0.84} T ${w} ${h * 0.8} V ${h} H 0 Z" fill="#a6abba"/>
    <ellipse cx="${w * 0.2}" cy="${h * 0.88}" rx="40" ry="10" fill="#8d92a3"/><ellipse cx="${w * 0.75}" cy="${h * 0.92}" rx="60" ry="12" fill="#8d92a3"/>
    <text x="${w / 2}" y="${h * 0.6}" font-size="${h * 0.32}" text-anchor="middle">${emoji}</text>
    <text x="${w / 2}" y="${h * 0.97}" font-size="${h * 0.07}" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#2b2f3d">${label}</text></svg>`);
}
function pageImg(n, title) {
  const lines = [...Array(22)].map((_, i) => `<rect x="60" y="${190 + i * 26}" width="${480 - ((i * 37) % 160)}" height="10" rx="5" fill="#d5d9e4"/>`).join('');
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="848" viewBox="0 0 600 848">
    <rect width="600" height="848" fill="#fff"/><rect width="600" height="120" fill="#1e2a5a"/>
    <text x="60" y="78" font-size="34" font-family="sans-serif" font-weight="800" fill="#fff">${title}</text>
    <rect x="60" y="140" width="220" height="16" rx="8" fill="#ffb43c"/>${lines}
    <text x="300" y="820" font-size="20" font-family="sans-serif" text-anchor="middle" fill="#667">${n == null ? '' : n}</text></svg>`);
}
const PICS = {
  'm-base': scene('Luna-7', '🏠', '#0b1440', '#3b4f9a'),
  'm-dome': scene('Kopule', '🛖', '#120b3a', '#6a4fb0'),
  'm-commander': scene('Velitel', '🧑‍🚀', '#06243a', '#2f7fa8'),
  'm-rover': scene('Vozítko', '🚙', '#1a0b2e', '#a0457e'),
  'm-rocket': scene('Raketa', '🚀', '#0b2a24', '#2f9a7a'),
};
export const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');

export const VISUAL_COURSE = {
  v: 1700000000000,
  title: 'Testovací kurz',
  test: { from: '2026-11-24', to: '2026-12-06' },
  chapters: [
    { id: '1', title: 'Měsíční základna', emoji: '🌕', pages: [3, 5], story: [
      { title: 'Vítej na Luně-7', text: 'Základna stojí v kráteru a žije na ní **42 lidí**. Podívej se, jak vypadá zvenku.', img: 'm-base', page: 3 },
      { title: 'Prohlídka základny', text: 'Krátké video ze vstupní haly.', video: { yt: 'abcdEFGH_12', title: 'Prohlídka Luny-7', start: 12, lang: 'cs' } },
      { title: 'Jak základna rostla', text: 'Od prvního bagru po první vlak.', widget: { type: 'timeline', events: [
        { when: '2029', label: 'Začíná stavba', emoji: '🏗️', text: 'Roboti vyhloubili **první tunel**.' },
        { when: '2031', label: 'Otevření základny', img: 'm-dome', text: 'Kopule z titanu je hotová.' },
        { when: '2045', label: 'Sto obyvatel', emoji: '👩‍🚀' },
        { when: '2080', label: 'První vlak', emoji: '🚝', text: 'Vlak jezdí rychlostí 28 000 km/h.' }] }, page: 4 },
      { title: 'Kdo se dostane na Měsíc', text: 'Z tisíců zájemců zbyde jen pár.', widget: { type: 'funnel', steps: [
        { n: 1200, label: 'zájemců' }, { n: 300, label: 'pozvaných' }, { n: 42, label: 'obyvatel' }] } },
    ] },
    { id: '2', title: 'Fyzika na Měsíci', emoji: '🪐', pages: [7, 8], story: [
      { title: 'Let s beztíží', text: 'Letoun **Skokan** létá oblouky a lidé uvnitř se na chvíli vznášejí.', widget: { type: 'parabola', mass: 55, g: 9.81, phases: [
        { id: 'level', label: 'Klidný let', load: 1, seconds: null, alt: 4000, speed: 600, note: 'Všichni sedí, váha ukazuje jako doma.' },
        { id: 'pullup', label: 'Prudké stoupání', load: 1.7, seconds: 18, speed: 520, note: 'Podlaha tlačí víc, cítíš se těžší.' },
        { id: 'zero', label: 'Vznášení', load: 0, seconds: 20, alt: 6200, speed: 310, note: 'Letoun padá spolu s tebou – podlaha netlačí.' },
        { id: 'pullout', label: 'Vybírání', load: 1.7, seconds: 18, speed: 520, note: 'Zase těžší, pozor na pád na podlahu.' },
        { id: 'level2', label: 'Klidný let', load: 1, alt: 4000, speed: 600, note: 'Konec oblouku.' }] }, page: 7 },
      { title: 'Proč stanice nepadá', text: 'Stanice LBS-1 pořád padá, ale míjí povrch.', widget: { type: 'orbit', body: 'Měsíc', craft: 'LBS-1', altitudeKm: 100, speedKmh: 5800, periodMin: 118, gravityPct: 89,
        shots: [{ label: 'Pomalu', text: 'Koule spadne kousek od hory.' }, { label: 'Rychleji', text: 'Doletí mnohem dál, ale spadne.' }, { label: '5 800 km/h', text: 'Povrch se zakřivuje stejně rychle, jak koule padá – **obíhá dokola**.' }] } },
      { title: 'Velitel základny', text: 'Petr Hvězdář vedl první posádku.', img: 'm-commander', page: 8 },
    ] },
  ],
  cards: [
    ...CARDS.map(c => c.id === 'dome' ? { ...c, img: 'm-dome' } : c.id === 'first-commander' ? { ...c, img: 'm-commander', imgAt: 'q' } : c),
    { id: 'rover-pic', ch: '1.3', page: 5, kind: 'pic', quote: 'Vozítko Krtek jezdí po povrchu', fact: 'Po povrchu Měsíce jezdí vozítko Krtek.',
      q: 'Na kterém obrázku je měsíční vozítko?', a: 'Vozítko Krtek', img: 'm-rover', wrongImg: ['m-rocket', 'm-dome', 'm-base'] },
  ],
  games: [
    { id: 'g-match', ch: '1', type: 'match', title: 'Co k čemu patří', pairs: [
      { l: 'Luna-7', r: 'základna' }, { l: 'LBS', r: 'stanice' }, { l: 'Krtek', r: 'vozítko', img: 'm-rover' }, { l: 'Hvězdář', r: 'velitel' }, { l: 'Titan', r: 'kopule' }] },
    { id: 'g-order', ch: '1', type: 'order', title: 'Co bylo dřív?', items: [
      { label: 'Začíná stavba', key: 2029, show: '2029' }, { label: 'Zkouška kopule', key: 2030, show: '2030' }, { label: 'Otevření základny', key: 2031, show: '2031' },
      { label: 'Sto obyvatel', key: 2045, show: '2045' }, { label: 'První vlak', key: 2080, show: '2080' }] },
  ],
  media: {
    'm-base': { pack: 'm1', alt: 'Základna Luna-7', credit: 'Měsíční archiv', w: 640, h: 420 },
    'm-dome': { pack: 'm1', alt: 'Kopule z titanu', credit: 'Měsíční archiv', w: 640, h: 420 },
    'm-commander': { pack: 'm1', alt: 'Petr Hvězdář', credit: 'Foto LBS', w: 640, h: 420 },
    'm-rover': { pack: 'm2', alt: 'Vozítko Krtek', credit: 'Foto LBS', w: 640, h: 420 },
    'm-rocket': { pack: 'm2', alt: 'Raketa', w: 640, h: 420 },
  },
  packs: ['m1', 'm2'],
  brochure: {
    pages: [{ doc: 'p01', n: null }, { doc: 'p02', n: null }, ...[3, 4, 5, 6, 7, 8].map(n => ({ doc: 'p0' + n, n }))],
    pdf: { docs: ['pdf1', 'pdf2'], name: 'Luna7_brozura.pdf', bytes: PDF_BYTES.length },
  },
};

const pack = ids => JSON.stringify(Object.fromEntries(ids.map(id => [id, PICS[id]])));
const pdf64 = PDF_BYTES.toString('base64'), half = Math.ceil(pdf64.length / 2 / 4) * 4;
export const VISUAL_DOCS = {
  [COURSE_ID]: JSON.stringify(VISUAL_COURSE),
  [`${COURSE_ID}-m1`]: pack(['m-base', 'm-dome', 'm-commander']),
  [`${COURSE_ID}-m2`]: pack(['m-rover', 'm-rocket']),
  [`${COURSE_ID}-p01`]: pageImg(null, 'Luna-7'),
  [`${COURSE_ID}-p02`]: pageImg(null, 'Obsah'),
  ...Object.fromEntries([3, 4, 5, 6, 7, 8].map(n => [`${COURSE_ID}-p0${n}`, pageImg(n, `Strana ${n}`)])),
  [`${COURSE_ID}-pdf1`]: pdf64.slice(0, half),
  [`${COURSE_ID}-pdf2`]: pdf64.slice(half),
};

/** Write a build folder like the private course build: <dir>/docs/<docId>.txt. */
export function writeBuild(dir, docs = VISUAL_DOCS) {
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  for (const [id, data] of Object.entries(docs)) fs.writeFileSync(path.join(dir, 'docs', id + '.txt'), data);
}
// node tests/fixtures/learn-course.mjs <dir> [old]: write a fixture build for the preview tool.
if (process.argv[1] && process.argv[1].endsWith('learn-course.mjs') && process.argv[2]) {
  writeBuild(process.argv[2], process.argv[3] === 'old' ? { [COURSE_ID]: JSON.stringify(OLD_COURSE) } : VISUAL_DOCS);
  console.log('fixture build written to', process.argv[2]);
}
