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

A separate page (`learn/index.html`) that drills a private deck of study cards with the same lesson
rhythm as the animals. Only the accounts in `ZEROG_UIDS` (index.html) and
`zeroG()` (firestore.rules) can use it; the two lists must match.

- **Content:** the Firestore document `private/zero-g-2026` holds one string field `data`, a JSON
  `{ title, test: { from, to }, chapters: [{ id, title }], cards: [...] }`. Each card has `id`, `ch`
  (brochure section; its chapter is the part before the first dot), `page`, `quote`, `fact`, `kind`
  (date, number, name, term, why, think, fact or calc), `q`, `a`, `alt`, `wrong` (3 near misses) and
  optionally `uses`. A `calc` card has `q` with `{m}`, a mass range `m`, a multiplier `k` and a `unit`.
  The cards are never in the repo: the repo is public.
- **Questions** are built from each card: multiple choice from `wrong`; true/false and fill-the-gap
  from `fact` with `a` (only for cards that recall a fact, never for why/think); typed answers only
  for short answers (numbers, dates, up to 3 words); calculations with a random mass, ±1 %.
- **Access:** the rules let only the listed uids read `private/*`; no client can write it. The page
  reuses the animal app's sign-in (`zv-auth-v1`, same origin) and refreshes the token like
  `fbToken()`, but never creates an account. Without a sign-in it sends the player to the app; for
  any other account Firestore answers 403 and the page shows nothing.
- **Entry:** a 🚀 Zero-G tile on the animal home, only for the listed accounts. `learn/` is inside
  the PWA's scope, so it opens in the home-screen app with the same storage.
- **Progress:** `zg-progress-v1` in localStorage (`{ cardId: { b, s, c, w, t } }`, Leitner boxes as
  for the animals), synced to `progress/{uid}` (`data`: that JSON as a string, `updated`: ms). Per
  card the newest record wins. The course is cached in `zg-course-v1` for the account that loaded
  it, so the page also works offline. Timer setting: `zg-timer-v1`.
- **Practice test:** 25 cards across the chapters, about 40 % from why/think/calc; it doesn't change
  the boxes. No XP, streak, leaderboard or duels.
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
