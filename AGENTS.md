# n8n-nodes-brault — Agent rules

> **AGENTS.md is canonical.** `CLAUDE.md` is a pointer to this file so every LLM-based
> tool reads the same source of truth.

This repo is a single n8n community node package: one credential (`BraultApi`) and two
nodes (`Brault`, `BraultTrigger`) that wrap the Brault Public API. Treat the backend's
public API contracts as the upstream source of truth for every field, enum, and error
shape this package exposes.

## Before any change — always

1. Read [`specs/README.md`](specs/README.md) for orientation.
2. Read `specs/features/2026-09-10-n8n-node-design.md` for the node architecture
   (resources, operations, transport layer, pagination, binary handling).
3. Check `brault-backend/specs/contracts/` (in the sibling repo) before inventing a
   field, endpoint, or error class — this package must mirror the Public API exactly,
   never guess at it.
4. If a request conflicts with the design spec or the backend contracts, explain the
   conflict and confirm before implementing.

## Architecture

- Programmatic-style nodes (not declarative `routing`) — see § 3 of the design spec for
  why: multi-step upload, host routing, binary handling, and cursor pagination don't
  express cleanly as declarative routing.
- `credentials/BraultApi.credentials.ts` — the only credential.
- `nodes/Brault/` — the action node: `actions/<resource>/` holds one file per
  resource description plus one `<op>.operation.ts` per operation; `methods/` holds
  `loadOptions` / `listSearch`; `transport/` holds `request.ts`, `hosts.ts`,
  `pagination.ts`, `errors.ts`, `binary.ts`.
- `nodes/BraultTrigger/` — the webhook trigger node; `signature.ts` (HMAC verification)
  is a pure function and must stay unit-tested in isolation.

## No runtime dependencies

- `package.json` has **no `dependencies` key** — only `devDependencies` and a
  `peerDependencies` entry for `n8n-workflow`. Node's built-in `crypto` and `stream`
  cover what the package needs; n8n supplies everything else at runtime.
- Before adding any package, ask whether n8n's `IExecuteFunctions` / `IHookFunctions`
  helpers already cover it. Adding a runtime dependency to a community node is a
  deviation from spec and needs explicit confirmation first.

## Pre-push gate (every push to `main`)

Run the exact CI steps locally, in order, before pushing — a failing gate blocks the
push, never push and let CI tell you:

1. `npm run lint` (`n8n-node lint`, **no `--fix`**) — `lint:fix` exists for local
   iteration only; never push on the strength of the fixed state without re-running
   the no-fix variant.
2. `npm run build` (`n8n-node build`).
3. `npm test` (`jest`).
4. `npm run scan` (`npm pack` + `@n8n/scan-community-package` against the built
   tarball) — this is the same community-package verification n8n runs before listing
   the package; a failure here blocks publishing regardless of what npm allows.

## Manual smoke procedure

`npm run dev` starts a local n8n instance with this package linked. Before smoke
testing against real data:

1. Load stg credentials from `~/.config/brault/n8n-stg.env` (never commit this file,
   never paste its contents into a workflow node or a commit).
2. Run `npm run dev` and exercise the node against `stg`, never `prod`, from a local
   workflow.
3. Confirm the trigger's HMAC signature check rejects a tampered payload before
   confirming a feature complete.

## Release flow

1. `npm run release` (`n8n-node release`) — lints, builds, prompts for a version bump,
   updates `CHANGELOG.md`, commits, tags, and pushes the tag.
2. The pushed `vX.Y.Z` (well, bare `X.Y.Z` — see `publish.yml`'s tag filter) tag
   triggers `.github/workflows/publish.yml`, which builds and runs
   `npm publish --provenance --access public`.
3. First publish requires npm Trusted Publishing configured by the operator
   (npmjs.com → package → Trusted Publishers → GitHub Actions, workflow
   `publish.yml`) or a granular `NPM_TOKEN` secret — see `specs/guides/release-pipeline.md`.
4. After publish, the operator submits the package through the n8n Creator Portal.

## Non-negotiables

- All code identifiers (variables, function names, node/credential display strings,
  error messages, constants, types) are US English.
- Never commit `.env` files or anything under `~/.config/brault/`.
- Never bypass spec updates — if behavior changes from what `specs/features/` or
  `specs/contracts/` describes, update the spec in the same PR.
- No prod-touching action in this repo without the operator's second confirmation, per
  the monorepo root `AGENTS.md`.

## Versioning — SemVer 2.0.0

Same policy as every Brault repo, derived from Conventional Commits (highest change
wins): PATCH for `fix:`/`perf:`/`refactor:`/`chore:`/docs, MINOR for a
backward-compatible `feat:`, MAJOR for any `BREAKING CHANGE:` footer or `type!:`
marker. In this repo the version bump happens inside `npm run release`, not as a
separate manual step. Canonical policy: root `AGENTS.md` of the multi-repo workspace.
