# Poznávačka zvířat 🦊

A Duolingo-style web app for learning to recognise the 147 vertebrates on Mia's school list
(Seznam druhů obratlovců) from photos and to remember their full Czech names.

It's a single static page (`index.html`) with no build step and no dependencies.

## Modes
- **Lekce**: 12-question adaptive lessons. New animals get an intro card (read aloud in Czech).
  Questions get harder with mastery: pick the name → pick the photo → complete the second word →
  type the full name. Mistakes come back later in the lesson.
- **Kartičky**: self-graded flashcards, weakest animals first.
- **Atlas**: browse all animals by group, with an option to hide names for self-testing.
- **Zkouška nanečisto**: type every animal's full name and get a mark from 1 to 5.

## Photos
Fetched at runtime from the Wikipedia API: English Wikipedia by Latin name, Czech Wikipedia by
Czech name. The results are cached in localStorage for 14 days. A wrong photo can be hidden
from the Atlas.

## Run locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000.

## Deploy
Any static host works: GitHub Pages (Settings → Pages → deploy from `main`, root), Vercel, or Netlify.

## Tests
Every pull request runs the checks in `.github/workflows/tests.yml`:
- the nickname filter's word-list tests (`node tools/nickfilter.mjs --test`) and a check that the generated filter in `index.html` / `firestore.rules` is up to date;
- Playwright end-to-end tests in `tests/specs/` (lessons, exam, onboarding, leaderboard, duels, Atlas, photos, easter egg). Wikipedia, Firebase and the CDN are mocked, so no network is needed.

Run locally:
```
cd tests
npm ci
npx playwright install chromium
npx playwright test
```
