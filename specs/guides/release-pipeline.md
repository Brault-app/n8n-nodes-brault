# Release pipeline

## Pre-push gate

Every push to `main` must pass, locally, in this exact order, before the push happens
(CI runs the same four steps and nothing else — see `.github/workflows/ci.yml`):

1. `npm run lint` — runs `n8n-node lint` **without** `--fix`. `npm run lint:fix` exists
   for local iteration; it auto-corrects issues CI will not, so never push on the
   strength of a `lint:fix` run without re-running plain `lint` afterward.
2. `npm run build` — runs `n8n-node build`, compiles `credentials/` and `nodes/` into
   `dist/`.
3. `npm test` — runs `jest` against `test/**/*.spec.ts`.
4. `npm run scan` — packs the current tree with `npm pack`, runs
   `@n8n/scan-community-package` against the resulting tarball (n8n's community-node
   verification check), then removes the tarball.

A failing step blocks the push. Fix it locally and re-run the full gate on the new
state — do not push and let CI report what a two-minute local run would have caught.

## CI

`.github/workflows/ci.yml` runs on every pull request and on every push to `main`:
`npm ci` → `npm run lint` → `npm run build` → `npm test` → `npm run scan`, on
`ubuntu-latest` with `node-version: lts/*`. This is a mirror of the pre-push gate, not
a superset — if CI ever grows a step the gate above must grow with it.

## Manual smoke test

Before calling a change complete, run it against a real n8n instance and real stg data:

1. `npm run dev` starts a local n8n instance with this package auto-loaded (see
   `@n8n/node-cli`'s dev command). This is the one script the pre-push gate does not
   run automatically — it is interactive.
2. In the n8n editor, create a `BraultApi` credential using the values in
   `~/.config/brault/n8n-stg.env`. Never commit that file, never paste its values into
   a workflow node, a screenshot, or a commit message.
3. Exercise the node/trigger against `stg` only. Never point a manual smoke test at
   `prod` credentials.
4. For `BraultTrigger` specifically, confirm a tampered webhook payload is rejected
   (HMAC signature check in `signature.ts`) before considering the trigger done.

## Release flow

1. Make sure the pre-push gate above is green on the commit you intend to release.
2. Run `npm run release` (`n8n-node release`). This lints, builds, prompts for a
   semantic version bump (see `AGENTS.md` § Versioning), updates `CHANGELOG.md`,
   commits the version bump, tags the commit, and pushes both the commit and the tag.
3. The pushed tag matches `.github/workflows/publish.yml`'s trigger
   (`*.*.*` — bare semver, no `v` prefix). That workflow checks out the tag, runs
   `npm ci`, and runs `npm run release` again inside CI, which publishes to npm with
   `--provenance --access public`.
4. **First publish only** — the operator must configure npm Trusted Publishing before
   any tag push will succeed:
   - npmjs.com → the package's settings → "Publish access" → "Trusted Publishers" →
     add a publisher: GitHub Actions, repository `Brault-app/n8n-nodes-brault`,
     workflow `publish.yml`, no environment.
   - Fallback: a granular `NPM_TOKEN` repo secret scoped to this package with
     read/write publish permission, in place of Trusted Publishing.
5. After a successful publish, the operator submits the package through the n8n
   Creator Portal so it becomes discoverable inside n8n's node panel. This step is
   manual and outside this repo.
