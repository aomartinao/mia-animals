# Operations

## Read the feedback

The kids' messages are in the `feedback` collection, and anyone can read them:

```
curl -s "https://firestore.googleapis.com/v1/projects/mia-animals/databases/(default)/documents/feedback?pageSize=300"
```

Or open the Firebase console → Firestore → Data → `feedback`.

## Block a wrong photo for everyone

1. Open `/review.html` on the live site, mark the bad photos and copy the list.
2. Add the file names (as they appear in the Commons URL, with underscores) to `BLOCKED_FILES` in
   `index.html`.
3. Open a PR. It deploys automatically when merged.

## Fix an English name

Edit the animal's line in `EN_RAW` (`Czech name|English name|variant;variant`). Check the name against
English Wikipedia by Latin name, and against IOC for birds.

## Moderate or free a nickname

In the Firebase console → Firestore → Data, delete:
- `names/{key}`, which frees the name;
- `players/{uid}` and `weeks/{week}/players/{uid}`, which remove the board entries.

The board also hides old entries whose name now belongs to someone else.

To ban words, edit the lists in `tools/nickfilter.mjs`, then:

```
node tools/nickfilter.mjs --test   # word-list checks
node tools/nickfilter.mjs          # regenerates the filter in index.html and firestore.rules
```

## Update the Zero-G course

The course, the brochure and the upload script live in a private folder outside this repo
(`~/clauding/mia-courses/zero-g-2026/`), because the repo is public. The build writes one file per
Firestore doc into `build/docs/<docId>.txt` (the course doc `zero-g-2026`, the media packs, the
brochure pages and the PDF chunks; see the Zero-G section in [architecture.md](architecture.md)), and
the upload script writes every one of them to `private/<docId>` (field `data`, plus `updated`). Each
build gets a new `v`, so the page drops its cached pictures and pages and fetches the new ones on its
next load. Upload the packs, pages and PDF chunks before (or together with) the course doc, so the
course never points at docs that aren't there yet; missing pictures just don't show.

Before uploading, look at the screens with the preview tool (from the repo, after `npm ci` in `tests/`):

```
node tests/preview-learn.mjs ~/clauding/mia-courses/zero-g-2026/build /tmp/zg-shots
node tests/preview-learn.mjs <buildDir> <outDir> --only story,widget   # just some screens
node tests/preview-learn.mjs <buildDir> <outDir> --width 375          # a narrower phone
```

It serves the page locally, signs in with a fake account, answers Firestore from `<buildDir>/docs`
and saves PNGs (390 × 844, 2×) of home, a chapter, every story slide (`story-<chapter>-<nn>.png`),
each widget in several states, lesson and feedback screens, both games, the reader and the lesson end.
It exits non-zero on page errors. `node tests/fixtures/learn-course.mjs <dir>` writes the made-up test
course as such a build (add `old` for the first course shape).

To give another account access, add its uid to both `ZEROG_UIDS` in `index.html` and `zeroG()` in
`firestore.rules`. Reports about wrong cards arrive in `feedback` as `[zero-g] <card id>: …`.

## Deploy

- Merging to `main` deploys both the hosting and the Firestore rules.
- To re-deploy without a change: GitHub → Actions → Tests → Run workflow (branch `main`).

## One-time setup (already done)

- Firebase Authentication:
  - Anonymous and Google providers are enabled;
  - `mia-animals.web.app` is an authorized domain (the default).
- The Google OAuth web client ("auto created by Google Service") has the redirect URI
  `https://mia-animals.web.app/`.
- The service account `github-deploy@mia-animals.iam.gserviceaccount.com` has the Firebase Admin and
  Service Usage Consumer roles. Its JSON key is in the `FIREBASE_SERVICE_ACCOUNT` GitHub secret.
- Repository settings:
  - auto-merge is enabled;
  - a ruleset requires a pull request and the `test` check on `main`.
