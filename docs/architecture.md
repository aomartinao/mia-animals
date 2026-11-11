# Architecture

Everything runs in the browser from a single file, `index.html`. There is no server code. Firebase
is used directly over its REST APIs (no Firebase SDK).

## Data

- `GROUPS`: the 7 groups (jawless fish, cartilaginous fish, bony fish, amphibians, reptiles, birds,
  mammals). Each has an id, a name in both languages, an icon and a colour.
- `RAW`: the school list, one line per species: `group|Czech name|Latin name`. The Czech name is the
  animal's **id**, used for progress keys, duels and photo lookup.
- `EN_RAW`: English names, one line per species: `Czech name|English name|accepted variants;…`.
- `ANIMALS` is built from both lists. Each animal has:
  - `id` / `cz` (Czech name) and `la` (Latin name);
  - `name`, the name shown in the current language;
  - `answers`, the accepted typed names;
  - `first` / `second`, the two words of the Czech name, used by the "complete the second word"
    question and for similar-animal distractors in Czech;
  - `genus`, the Latin genus, used for distractors in English.

## Language

- `LANG` is `cs` or `en`. It comes from `localStorage['zv-lang-v1']`.
- With nothing saved:
  - players who were already onboarded get Czech;
  - new players start in the device language, and the first onboarding step asks which names to learn.
- `t(cs, en)` picks the string for the current language; all UI text goes through it.
- Switching language stores the choice and reloads the page.

## Local state (localStorage)

| Key | Content |
|---|---|
| `zv-progress-v1` / `zv-progress-en-v1` | Per-animal progress for Czech / English: `{ b: box 0–5, s: seen, c: correct, w: wrong, t: last change, done?: 1 }` |
| `zv-stats-v1` | `xp`, `streak`, `lastDay`, `lessons`, `wk` / `wxp` (this ISO week's points). Shared by both languages |
| `zv-selected-v1` | Selected groups |
| `zv-images-v7` | Photo URLs per animal, plus a timestamp (refreshed after 14 days) |
| `zv-badimg-v1` | Photos the player hid on this device |
| `zv-hashes-v1`, `zv-dupes-v1` | Perceptual hashes and detected duplicate photos |
| `zv-auth-v1` | Firebase Auth tokens `{ uid, id, refresh, exp }` |
| `zv-account-v1` | `{ email }` when signed in with Google |
| `zv-player-v1` | `{ name, uid, day }`: nickname, and when it was last claimed/refreshed |
| `zv-duels-v1` | The player's recent duels |
| `zv-lang-v1`, `zv-onboarded-v1`, `zv-sound-v1`, `zv-hide-v1`, `zv-whole-v1`, `zv-focus-v1` | Settings |

## Learning model

- Leitner boxes: a correct answer moves an animal up one box, a wrong one moves it down two.
  Box ≥ 3 (`MASTER`) counts as known.
- "I know this" sets `done` and box 5. Done animals are left out of lessons and flashcards, but stay
  in the practice test and in duels.
- `makeQuestion(a, level)` picks a question type by box: pick the name, pick the photo, complete the
  second word (Czech only), or type the name.
- Typed answers:
  - **Czech:** exact = 1 point; accents wrong or a 1-letter typo = ½ point.
  - **English:** any accepted name counts, ignoring case, accents, hyphens and apostrophes. A small
    typo is ½ point.

## Photos

1. `loadImages()` asks the Wikipedia `pageimages` API for the lead image of each species' article:
   - English, Czech and six more Wikipedias (de, fr, it, es, pl, nl), all by Latin name;
   - Czech also by Czech name as a fallback.
   - Homo sapiens only uses English and Czech, because other Wikipedias use nude images.
2. Filters:
   - `MAP_RE` (maps, globes, ranges);
   - `NUDE_RE`;
   - `BLOCKED_FILES` (hand-picked);
   - duplicates by file name and by dHash (9×8, mirrored variant included, ≤ 6 bits apart).
3. smartcrop.js finds the focus point for cropped views. `fitMainFrame` adapts the frame to the
   photo's aspect ratio.

## Firebase

- **Project:** `mia-animals`.
- **Auth:** Identity Toolkit REST.
  - Every player first gets an **anonymous** account (`accounts:signUp`), refreshed via `securetoken`.
  - **Google sign-in** is a full-page redirect:
    1. `accounts:createAuthUri` with `continueUri = https://mia-animals.web.app/`.
    2. Google redirects back with `#id_token=…` (implicit flow).
    3. `accounts:signInWithIdp` with the full URL exchanges it for Firebase tokens.
  - No popup and no SDK, so it also works in an iPhone home-screen app.
  - The redirect URI is registered on the project's OAuth web client.
- **Switching to a Google account** (`switchAccount`):
  1. The device's anonymous board entries and nickname are removed.
  2. The Google account takes over the nickname, unless the account already has its own.
  3. Progress is merged both ways: per animal, the most recently changed record wins; totals take
     the maximum.
- **Logout** uploads the progress first, then clears the device. Storage writes are frozen until
  the reload, so a sync still in flight can't bring the data back.

### Firestore collections

| Path | Written by | Content |
|---|---|---|
| `players/{uid}` | owner | All-time board: `name`, `known`, `xp`, `updated` |
| `weeks/{YYYY-Www}/players/{uid}` | owner | Weekly board: `name`, `xp`, `updated` |
| `names/{key}` | owner | Nickname registry: `uid`, `at` (last played, refreshed daily), `google` |
| `duels/{id}` | creator, create-only | `by`, `byName`, `q` (questions as JSON), `n`, `created` |
| `duels/{id}/results/{uid}` | player, create-only | `name`, `score`, `ms`, `at` |
| `users/{uid}` | Google accounts only | `prog`, `progEn`, `stats` (JSON strings), `name`, `updated` |
| `feedback/{auto}` | anyone signed in, create-only | `text`, `name`, `ctx` (device), `uid`, `at`. Readable by anyone |

`key` = the nickname lower-cased, without accents, only `a–z0–9`. The rules (`firestore.rules`) enforce:
- every write to `players`, `weeks`, `duels` and `results` must use a nickname the writer owns in
  `names` and that passes the profanity filter (`isBadName`, generated by `tools/nickfilter.mjs`);
- a name can be taken over only if its owner is not signed in with Google and `at` is more than
  60 days old;
- value ranges and allowed fields for every collection.

## Zero-G page (`learn/`)

A separate page (`learn/index.html`) for a private study course: lessons with the same rhythm as the
animals, a practice test, picture cards, visual stories with explainer widgets, games, a brochure
reader and a fun layer (XP, ranks, streak, badges). Only the accounts in `ZEROG_UIDS` (index.html)
and `zeroG()` (firestore.rules) can use it; the two lists must match. The page is generic: every word,
number and picture of the course comes from Firestore at runtime, nothing of it is in the repo (the
repo is public). The full data contract lives with the private course build; in brief:

- **Docs** (all under `private/`, each with `data` (string) and `updated` (int ms), readable only by the
  listed uids, written with admin credentials):

  | Doc id | `data` |
  |---|---|
  | `zero-g-2026` | the course JSON |
  | `zero-g-2026-<pack>` (e.g. `-m1`) | a media pack: JSON `{ mediaId: dataURI }`, ≤ 900 KB |
  | `zero-g-2026-<page>` (e.g. `-p04`) | one brochure page as a data URI |
  | `zero-g-2026-<pdfN>` | a chunk of the brochure PDF as base64 (no prefix) |

- **Course JSON:** `{ v, title, test: { from, to }, chapters, cards, games, media, packs, brochure }`.
  Everything except `chapters` and `cards` is optional, and so is every new field on them: the page
  still runs the first shape (`{ title, test, chapters: [{ id, title }], cards }`), and a part whose
  data is missing simply doesn't appear. `v` is the build time; cached media and pages of another `v`
  are dropped.
  - Chapters: `id`, `title`, optional `emoji`, `pages` (printed page range) and `story` (slides).
  - Cards: `id`, `ch` (brochure section; the chapter is the part before the first dot), `page`,
    `quote`, `fact`, `kind` (date, number, name, term, why, think, fact, calc or pic), `q`, `a`, `alt`,
    `wrong` (3 near misses), optionally `uses`. A `calc` card has `q` with `{m}`, a mass range `m`, a
    multiplier `k` and a `unit`. Optional `img` (media id) with `imgAt`: `"a"` (default; the picture
    would give the answer away, so it shows only on the intro and in the feedback) or `"q"` (shown with
    the question too). A `pic` card has `img` (the right picture) and `wrongImg` (3 more) instead of
    `wrong` and is asked as a 2×2 picture grid; until its pictures are loaded it is left out.
  - `media`: `{ mediaId: { pack, alt, credit, w, h } }`; `packs`: the pack names, loaded in order.
  - `brochure`: `{ pages: [{ doc, n }], pdf: { docs, name, bytes } }`; `n` is the printed page number
    (null for the cover and the like).
- **Questions** are built from each card: multiple choice from `wrong`; true/false and fill-the-gap
  from `fact` with `a` (only for cards that recall a fact, never for why/think); typed answers only
  for short answers (numbers, dates, up to 3 words); calculations with a random mass, ±1 %.
- **Pictures:** after boot, with the lowest priority, the page fetches the media packs one by one,
  keeps them in IndexedDB (`zg-cache`, keyed `pack:<name>`, with the course `v`) and turns them into
  blob URLs (`mediaUrl(id)`, null while missing). A picture not loaded yet takes no space; when a pack
  arrives the pictures on screen are filled in. Pictures open in a lightbox with their credit.
- **Stories:** per chapter, full-screen slides (buttons, arrow keys, swipe) with a title, a short text
  (`**bold**`) and one of a picture, a YouTube video (thumbnail first; the `youtube-nocookie.com`
  iframe loads only on tap, with a note when offline) or a widget, plus an optional link into the
  reader. A finished story gives XP once and its badge. Before the first lesson of a chapter with an
  unseen story the page offers the story first.
- **Widgets** (generic inline SVG; all numbers and labels from the slide's `widget`):
  `parabola` (the flight path in phases with a plane on a play/scrub control, the current phase's load,
  altitude, speed and note, and a cabin with a person on a scale: the gravity arrow always the same,
  the floor's push growing with the load and gone at zero g; mass slider 40–90 kg; readouts mass,
  scale reading = mass × load, gravity = mass × g, floor force = mass × g × load), `orbit` (Newton's
  cannon: three shots, the last one stays in orbit; fact chips), `timeline` (horizontal snap
  scroll of event cards that expand on tap) and `funnel` (shrinking bars with count-up numbers and the
  share of the first step).
- **Games** (`games`, per chapter): `match` (4 random pairs, two shuffled columns) and `order`
  (4 random items, tapped in order, then checked against `key`, revealing `show`). Games give XP and
  never change the Leitner boxes. Every second lesson from a chapter with games ends with a bonus game.
- **Chapter challenge:** up to 10 questions from one chapter, built like the practice test; 80 %
  earns the chapter's badge.
- **Brochure reader:** a full-screen overlay (so a lesson or story underneath stays as it was):
  opened from home, a chapter (at its first page), the quote under an answer or a story slide (at that
  printed page). Pages are fetched on demand with their neighbours and cached in IndexedDB like the
  packs; swipe or buttons, chapter menu, zoom (button or double tap: fit width ↔ 2× with native
  scrolling). "Stáhnout PDF" fetches the chunk docs, joins the base64 into one PDF blob and saves it
  under `pdf.name` through an `<a download>` (or opens it where downloads aren't supported).
- **Fun layer:** XP per right answer (10, ×1.5 from 3 in a row, ×2 from 6; half answers 5), for
  finished lessons, stories, games, badges and passed challenges. 10 levels with space ranks; the
  thresholds scale with the size of the course so the top rank is reachable by finishing it. Daily
  streak, a daily goal (3 lessons or tests), badges per chapter (story seen, all cards met, challenge
  passed) and a few global ones.
- **Access:** the rules let only the listed uids read `private/*`; no client can write it. The page
  reuses the animal app's sign-in (`zv-auth-v1`, same origin) and refreshes the token like
  `fbToken()`, but never creates an account. Without a sign-in it sends the player to the app; for
  any other account Firestore answers 403 and the page shows nothing (and clears its caches).
- **Entry:** a 🚀 Zero-G tile on the animal home, only for the listed accounts. `learn/` is inside
  the PWA's scope, so it opens in the home-screen app with the same storage.
- **Progress:** `zg-progress-v1` in localStorage (`{ cardId: { b, s, c, w, t } }`, Leitner boxes as
  for the animals) and the page's stats in `zg-stats-v1` (`{ xp, best, days, badges, seen, games,
  lessons, top }`). Both are synced to `progress/{uid}` (`data`: JSON of the cards plus the stats
  under the reserved key `"_"`, `updated`: ms). Per card the newest record wins; for the stats the
  larger XP, the union of days (so the longer streak survives), badges and seen stories. The course is
  cached in `zg-course-v1` for the account that loaded it, so the page also works offline.
  Timer setting: `zg-timer-v1`.
- **Practice test:** 25 cards across the chapters, about 40 % from why/think/calc; it doesn't change
  the boxes.
- **Reporting a card** writes to the public `feedback` collection: only `[zero-g] <card id>` and
  the reporter's note, never card text.

## Moving from GitHub Pages

The same `index.html` is still served at the old GitHub Pages address. On that host it fetches
`https://mia-animals.web.app/moved.json`. When that says `{"moved": true}`:
- **browsers** are redirected to the new address. All local state travels in the URL fragment
  (`#import=…`) and is imported there, into the Czech slot and with the language set to Czech for
  existing players;
- **home-screen apps** show a "the app has moved" screen with a link instead, because they keep
  their own storage.

## Deploy

`.github/workflows/tests.yml`:
- runs the nickname-filter checks and all Playwright tests;
- on `main` (push or "Run workflow") runs `firebase deploy --only hosting,firestore:rules` with the
  `FIREBASE_SERVICE_ACCOUNT` secret. The service account has the Firebase Admin and Service Usage
  Consumer roles.

Hosting publishes the repository root, minus what `firebase.json` ignores. `.git` is removed before
deploying.
