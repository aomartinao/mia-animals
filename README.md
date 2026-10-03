# Poznávačka zvířat / Animal Quiz 🦊

A Duolingo-style web app for learning to recognise the 147 vertebrates on Mia's school list
("Seznam druhů obratlovců") from photos, and to remember their full names, in Czech or in English.

**Live:** https://mia-animals.web.app (the old address https://aomartinao.github.io/mia-animals/ forwards there).

The whole app is one static page (`index.html`): vanilla JavaScript, no build step and no runtime
dependencies apart from [smartcrop.js](https://github.com/jwagner/smartcrop.js) from a CDN.
Firebase (Auth + Firestore over plain REST) powers the leaderboard, duels, feedback and Google sign-in.

## Features

**Learning**
- **Lesson**: 12 adaptive questions. New animals get an intro card that is read aloud. Questions get
  harder as an animal is learnt: pick the name, pick the photo, complete the second word (Czech
  only), type the full name. Mistakes come back later in the lesson. Spaced repetition uses Leitner
  boxes 0–5, and box 3 or higher counts as "known".
- **Flashcards**: self-graded, weakest animals first.
- **Atlas**: all animals by group, with search, group filter chips, a full-screen detail view
  (swipeable photos, previous/next animal, a link to Wikipedia) and a "hide names" mode for self-testing.
- **Practice test**: type every name and get a mark from 1 to 5. A small typo or missing
  accents gives half a point.
- **"I know this – don't show again"**: takes an animal out of lessons and flashcards. It stays
  in the test and in duels.
- **Group selection** on home. With all groups selected, tapping one keeps only that group.

**Languages**
- The whole app runs in Czech *or* English: UI and animal names. On first launch the player chooses
  which names to learn, and the choice can be changed on home.
- Each language keeps its own progress. Points and streak are shared.
- English names use British spelling and IOC names for birds. Each has accepted variants
  ("carp" / "common carp"). All 147 were checked against Wikipedia by Latin name.

**Social** (Firebase)
- **Leaderboard**: this week's points and animals known.
  - Nicknames are unique, ignoring case and accents, and filtered for profanity, including leetspeak.
  - A nickname of a player who isn't signed in with Google is freed after 60 days of not playing.
- **Challenges (duels)**: play 10 animals and share a link. Friends get exactly the same questions.
  Most correct wins, with time as the tie-break, and each player gets one try.
- **Google sign-in**: the same progress on phone and computer, and a nickname that never expires.
  It is optional; the app works fully without an account.
- **Feedback**: "💬 Idea or bug? Write to Gandalf" on home stores messages in Firestore.

**Photos**
- Lead images of the species' articles on several Wikipedias (en, cs, de, fr, it, es, pl, nl),
  looked up by Latin name. Up to 5 per animal, cached for 14 days.
- Range maps, globes, nude images and hand-blocked files are filtered out. Duplicate photos,
  including resized or mirrored copies, are removed with a perceptual hash.
- smartcrop.js keeps the animal in view when cropping. A crop / whole-photo toggle is available everywhere.
- Players can hide a wrong photo on their own device. `review.html` lists every candidate photo
  so wrong ones can be blocked for everyone.

**Other**
- Installable as a home-screen app (PWA), with onboarding that explains how on iPhone and Android.
- A sound on/off toggle in lessons, flashcards and the Atlas.
- An easter egg for Mia 🐒.

## Repository layout

| Path | What it is |
|---|---|
| `index.html` | The entire app: data (species list, English names), styles, logic |
| `firestore.rules` | Firestore security rules, deployed automatically |
| `firebase.json`, `.firebaserc` | Firebase Hosting + Firestore config |
| `moved.json` | Switch that makes the old GitHub Pages address forward to the new one |
| `review.html` | Internal page for reviewing every candidate photo |
| `tools/nickfilter.mjs` | Generates the nickname profanity filter for both `index.html` and `firestore.rules` |
| `tests/` | Playwright end-to-end tests with mocked Wikipedia, Firebase and CDN |
| `docs/` | Architecture and operations notes |
| `v2/` | Redirect left over from the redesign preview |

## Run locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Google sign-in only works on the real domain.

## Tests

```
cd tests
npm ci
npx playwright install chromium
npx playwright test
```

CI (`.github/workflows/tests.yml`) runs on every pull request:
- the nickname filter word-list tests (`node tools/nickfilter.mjs --test`);
- a check that the generated filter blocks are up to date;
- all Playwright specs.

The tests run in Czech by default. `english.spec.js` checks that no Czech text is left in English mode.

## Deploy

Every push to `main` that passes the tests deploys Firebase Hosting and `firestore.rules`. The
deploy needs the `FIREBASE_SERVICE_ACCOUNT` repository secret. The Actions "Run workflow" button
re-deploys `main` without a new commit.

More detail is in [`docs/architecture.md`](docs/architecture.md) and [`docs/operations.md`](docs/operations.md).
