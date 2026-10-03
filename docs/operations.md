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
