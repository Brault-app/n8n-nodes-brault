# Brault community node for n8n — design

> Status: v1.0.0, 2026-09-10 — approved by the operator (brainstorm session). Feeds the
> implementation plan under `specs/plans/`.

## 1. Goal

Ship a verified n8n community node for Brault built on the Public API v1 so that n8n
users (Cloud and self-hosted) get a first-class `Brault` node and a `Brault Trigger` node
instead of the generic Webhook + HTTP Request recipe in
`brault-docs/content/docs/guides/connect-n8n.mdx`.

Why n8n first (analysis of 2026-09-10): highest brand-search volume of the three
automation platforms in the US (n8n 201k, Zapier 165k, make.com 4.4k per month), the
strongest overlap with the agencies / creative-team ICP, the lightest marketplace
validation (automated lint plus a review, no user threshold), and an automatic listing at
`n8n.io/integrations/<node>` after verification. Zapier follows once the trigger/action
catalogue exists; Make is a later community-app listing.

## 2. Scope

### In scope (v1)

- npm package `n8n-nodes-brault` (unscoped, MIT), public repo
  `Brault-app/n8n-nodes-brault`, local checkout `Brault/brault-n8n`.
- Credential `braultApi` (API key + base URL).
- Node `Brault` (programmatic, modular) covering nearly every `/v1` resource: libraries,
  folders, files (including binary upload and download), imports, versions, comments and
  replies, boards and board properties, brandspace properties, pages, shared links,
  transfers, search, brandspace, members, roles, bulk downloads. Exposed to n8n AI agents
  as a tool (`usableAsTool: true`).
- Node `Brault Trigger` (programmatic, webhook lifecycle) for any event of the public
  catalogue, with `Brault-Signature` verification.
- Backend data change: webhook-endpoint limits per plan (Pro 3 → 5, Growth 10 → 25,
  Custom starting point 10 → 25; Lite stays at 1) with the contract and roadmap updates
  that go with it.
- Docs: `plans-and-limits.mdx` table; rewrite of `connect-n8n.mdx` once the package is on
  npm.
- Publish pipeline: GitHub Actions `publish.yml` with npm provenance; submission through
  the n8n Creator Portal.

### Out of scope (v1)

- OAuth 2.0 (backend roadmap item 10). The credential is a static `bsk_…` key.
- Webhook-endpoint management operations in the `Brault` node (the trigger owns its own
  endpoint; the developers panel owns the rest).
- `Simplify` output option, sort options on Get Many, Zapier and Make apps, workflow
  templates on n8n.io (done right after verification, not part of this spec).
- Automated end-to-end tests against stg. Unit tests plus an operator smoke checklist
  cover v1.

## 3. Architecture

Two nodes and one credential in one package. Both nodes are programmatic-style: the
trigger must be (n8n rule), and the action node needs multi-step calls (upload start →
parts → complete), central/regional host routing, binary handling and cursor pagination,
none of which the declarative `routing` model expresses cleanly.

```
brault-n8n/
  package.json               n8n.nodes / n8n.credentials, keyword n8n-community-node-package
  credentials/BraultApi.credentials.ts
  nodes/Brault/
    Brault.node.ts            description + execute(): dispatch by resource/operation
    Brault.node.json          codex (categories, docs links)
    brault.svg
    actions/<resource>/       <resource>.resource.ts (description) + <op>.operation.ts
    methods/                  loadOptions + listSearch (resource locators)
    transport/                request.ts, hosts.ts, pagination.ts, errors.ts, binary.ts
  nodes/BraultTrigger/
    BraultTrigger.node.ts     webhookMethods + webhook()
    BraultTrigger.node.json
    signature.ts              HMAC verification (pure function, unit-tested)
  specs/                      AGENTS.md conventions: features/, plans/, contracts/, guides/
  .github/workflows/publish.yml, ci.yml
```

Runtime dependencies: none (verification rule). `n8n-workflow` is a peer dependency;
`crypto` and `stream` come from Node.

## 4. Credential `braultApi`

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `apiKey` | string, password | – | `bsk_…` from Settings → Developers. |
| `baseUrl` | string | `https://api.brault.app` | Central host. Only changed for staging or a future region. Trailing slash stripped. |

- `authenticate`: generic header `Authorization: Bearer {{apiKey}}`.
- `test`: `GET {baseUrl}/v1/me`. A `401` surfaces n8n's standard "credentials invalid".
- `documentationUrl`: `https://developers.brault.app/docs/get-an-api-key`.
- The README states the D1 behaviour: a key pauses when its creator loses access to the
  brandspace, so team automations should use a key created by a long-lived admin.

## 5. Transport

`transport/request.ts` exposes `braultRequest(this, { plane, method, path, qs, body,
headers, returnFullResponse })`.

- **Planes.** `plane: 'central' | 'regional'` picks the host. Central = credential
  `baseUrl`. Regional = `hosts.regional` from `GET /v1/me`, fetched once per
  credential and cached in a module-level `Map<keyPrefix, { hosts, expiresAt }>` for ten
  minutes. If `/v1/me` fails or lacks `hosts`, regional falls back to `baseUrl` (today one
  origin serves both, per `conventions.md` § Host and versioning).
- **Idempotency.** Every `POST` that creates something sends `Idempotency-Key: <uuid v4>`
  generated per item per execution. n8n retries (node-level "retry on fail") reuse the same
  key only inside the same execution; that is acceptable for v1 and documented.
- **Errors.** The API error envelope is flat — `{ object: "error", status, code, message, request_id, details? }` (verified on staging 2026-09-11; single objects are also unwrapped, only lists carry `data`). Its fields (`code`, `message`, `request_id`,
  `error.details`) maps to `NodeApiError` with `message = error.message`, `description =
  "code · request_id"`. Specific codes get friendlier text:
  `webhook_limit_reached` ("Your plan allows N webhook endpoints; remove one in Settings →
  Developers or upgrade"), `insufficient_scope` (names the missing scope),
  `misdirected_request` (points at `details.host`). A `validation_error` appends every
  `details.errors[].reason` string to the message. `429` honours `Retry-After` with a single
  in-node retry when it is ≤ 10 s; otherwise the error surfaces with the header value in
  the description.
- **Destinations.** The API takes exactly one destination per request body (`library_id`,
  `folder_id`, `to_root` — `endpoints-v1.md` § 2.9); two of them answer `400
  validation_error`. n8n users routinely fill in both, so `normalizeDestination` (in
  `catalogue/plan-request.ts`, applied by `planRequest` and by the upload handler, bodies
  only, never `qs`) drops `library_id` when a `folder_id` is set, drops both when
  `to_root` is true, and drops `to_root` when it is false. List filters keep taking a
  library and a folder together, because those travel in the query string.
- **Deletes.** `DELETE …?permanent=true` only works on an item already in the trash; on a
  live item the API answers `400 invalid_request`. `actions/delete-with-trash.ts` is the
  shared handler for file, folder and page deletes: on a permanent delete it sends the
  plain `DELETE` first (through `braultRequestRaw`, ignoring its status so an
  already-trashed item still works) and then repeats it with `permanent=true`.
- **Pagination.** `getAll(this, plane, path, qs, { returnAll, limit })` follows
  `next_cursor` with page size `min(100, remaining)` until `has_more` is false or `limit`
  is reached. Every Get Many operation exposes `Return All` (boolean, default false) and
  `Limit` (default 50, max 1,000 per execution to keep monthly quotas safe).
- **Binary.** `binary.ts` owns upload chunking and download-to-binary. Upload: read the
  n8n binary property as a stream (`getBinaryStream`) and its size from metadata; `POST
  /v1/uploads` with `size`, `name`, `mime_type`, target; on `method: put` PUT the whole
  stream to `upload_url`; on `method: multipart` slice the stream into `part_size` chunks,
  request each part URL from `POST /v1/uploads/{id}/parts`, PUT it, collect `etag`, then
  `POST …/complete` with `parts[]`. Memory never exceeds one part (64 MiB). Download: `GET
  /v1/files/{id}/download` → follow `url` with `returnFullResponse` and
  `encoding: 'arraybuffer'`, then `prepareBinaryData` with the file name and mime type.

## 6. `Brault Trigger`

- **Parameters.** `Events` (multiOptions, `loadOptions` from `GET /v1/events`, plus a
  fixed first option `All events (*)`; default empty, required). `Options › Verify
  signature` (boolean, default true).
- **Lifecycle** (`webhookMethods.default`):
  - `checkExists`: read `webhookId` from workflow static data; `GET
    /v1/webhooks/{id}`; true when it answers `200` and its `url` equals
    `getNodeWebhookUrl('default')`, otherwise clear static data and return false.
  - `create`: `POST /v1/webhooks` with `{ url, name: "n8n · <workflow name>",
    events }`; store `webhookId` and `secret` (returned once) in static data.
  - `delete`: `DELETE /v1/webhooks/{id}`; ignore `404`; clear static data.
  - n8n runs the same lifecycle for the test URL, so "Listen for test event" works with
    the real API. `POST /v1/webhooks/{id}/test` is not used by the node; the README shows
    it as the way to get a sample payload.
- **Reception** (`webhook()`): read raw body (`req.rawBody`) and `Brault-Signature`.
  `signature.ts` parses `t=<unix>,v1=<hex>[,v1=<hex>]`, rejects when `|now − t| > 300 s`,
  computes `HMAC-SHA256(secret, "<t>.<rawBody>")` and accepts when any `v1` matches
  (timing-safe compare). Failure → HTTP `401`, no workflow run. Success → `200 {}` and
  one item whose JSON is the event envelope untouched (`id`, `type`, `occurred_at`,
  `actor`, `data`). `webhook.test` events are passed through like any other.
- **Limits.** One endpoint per workflow. The `create` error `webhook_limit_reached` is
  mapped to the friendly message above; that is why plan limits rise (§ 9).

## 7. `Brault` node — resource and operation catalogue

Conventions: operation `name` in Title Case without the resource, `action` in sentence
case with the resource, `description` adds wording. Ids use a Resource Locator with
modes `From list` (listSearch) and `By ID` for library, folder, file, board, page and
property; other ids are plain strings. Optional inputs live in a `Fields` / `Options`
collection. Deletes return `{ deleted: true, id }` when the API answers `204`.

| Resource | Operations (route) |
| --- | --- |
| Library | Get Many (`GET /v1/libraries`), Get, Create, Update (`PATCH`), Delete |
| Folder | Get Many (`GET /v1/folders?library_id&parent_id`), Get, Create, Update, Move (`POST …/move`), Delete (trash), Restore |
| File | Get Many (`GET /v1/files` with library/folder/tag/type filters), Get, Update (name, tags), Move, Copy, Delete (trash), Restore, Upload (binary → `POST /v1/uploads` flow), Import From URL (`POST /v1/files/import`, option *Wait for completion* polls `GET /v1/imports/{id}` up to 10 min), Download (binary), Get Download URL, Get Similar, Get Boards, Set Property Value (`PUT …/properties/{propertyId}`), Get Many Versions, Activate Version, Delete Version |
| Import | Get (`GET /v1/imports/{id}`) |
| Comment | Get Many, Get, Create, Update, Delete, Resolve, Reopen (all under `/v1/files/{fileId}/comments`) |
| Reply | Get Many, Create, Update, Delete (`…/comments/{commentId}/replies`) |
| Board | Get Many, Get, Create, Update, Delete, Query (`POST …/query` with filter JSON), Add File, Remove File, Set File Property Value, Get Many Members |
| Board Property | Get Many, Get, Create, Update, Delete, Add Option, Update Option, Delete Option |
| Property | Get Many, Get, Create, Update, Delete, Add Option, Update Option, Delete Option (`/v1/properties`) |
| Page | Get Many, Get, Create, Delete, Publish, Unpublish, Append Block |
| Shared Link | Get Many, Get, Create, Update, Delete |
| Transfer | Get Many, Get, Create (files from binary properties → per-file upload flow under `/v1/transfers/{id}/uploads/{uploadId}` → `POST …/complete`), Update (expiry, password), Delete |
| Search | Search (`GET /v1/search?q`) |
| Brandspace | Get (`GET /v1/brandspace`), Get Usage (`GET /v1/usage`) |
| Member | Get Many, Get |
| Role | Get Many |
| Bulk Download | Create (`POST /v1/downloads`), Get |

Plane per route follows `x-brault-plane` in `openapi/public-v1.json`: brandspace, members,
roles and usage are central; everything else is regional. Request and response field names
are taken verbatim from `brault-backend/openapi/public-v1.json`; the plan pins the exact
body per operation from that document, not from memory.

Every operation runs per input item, supports `continueOnFail`, and pairs output with
input (`pairedItem`).

## 8. Error handling summary

| Situation | Behaviour |
| --- | --- |
| API error envelope | `NodeApiError` with message, code and `request_id` (§ 5). |
| `429` | One retry when `Retry-After ≤ 10 s`, else error with the header value. |
| Missing binary property | `NodeOperationError` naming the property and the item index. |
| Upload part failure | Abort (`POST /v1/uploads/{id}/abort`) then throw; no orphan session. |
| Import wait timeout | `NodeOperationError` with the `import_id` so a later node can poll. |
| Trigger signature mismatch | `401`, nothing emitted, no workflow run. |
| Trigger create hits plan limit | Friendly `webhook_limit_reached` message. |

## 9. Changes in existing repositories

All on worktrees branched from `dev` (docs: from `main`, its default; it has no `dev`).

**brault-backend**

- Data migration named `<timestamp>_webhook_limits_for_connectors` (timestamp assigned when the plan task runs): `api_max_webhooks` Pro
  3 → 5, Growth 10 → 25, Custom 10 → 25, each `UPDATE` guarded on the shipped value so an
  operator-tuned row is left alone. Lite unchanged.
- `initializeBasePlans` (`prisma.service.ts`) and `plan-api-limits.ts` (Custom starting
  point) plus their specs.
- Contracts: `specs/contracts/public-api/rate-limits.md` table + revision note;
  `webhooks.md` § 2.1 note "one endpoint per automation-platform workflow";
  `specs/roadmap/public-api/00-post-v1.md` item 8 becomes "n8n (this spec) → Zapier → Make".
- No code path change: limits are data.

**brault-docs**

- `content/docs/plans-and-limits.mdx` webhook row `1 | 5 | 25 | contract`.
- `content/docs/guides/connect-n8n.mdx` rewritten around the native node (install from the
  nodes panel, credential, trigger, three example flows), keeping the generic recipe as a
  fallback section. Gated on the npm publish.

**brault-frontend**: no code change (pricing and the developers panel read
`plan.api_max_webhooks`). `specs/features/pricing-developer-platform.md` gets the new
figures if it quotes them.

## 10. Repository, CI and publishing

- Scaffold with `npm create @n8n/node@latest n8n-nodes-brault -- --template
  programmatic/example`, then reshape to § 3. Node ≥ 20, TypeScript strict.
- `package.json`: `name: n8n-nodes-brault`, `license: MIT`, `keywords:
  ["n8n-community-node-package", "brault", "dam", "digital asset management"]`,
  `n8n.nodes` / `n8n.credentials` entries, `repository` pointing at
  `github.com/Brault-app/n8n-nodes-brault` (must match npm for verification).
- `AGENTS.md` (with `CLAUDE.md` pointer) following the monorepo convention; `specs/`
  with `features/`, `plans/`, `guides/release-pipeline.md`.
- CI (`ci.yml`, on PR and push): `npm ci`, `npm run lint` (n8n-node lint, no `--fix`),
  `npm run build`, `npm test`, `npx @n8n/scan-community-package n8n-nodes-brault` on the
  built package. This is the pre-push gate too.
- Publish (`publish.yml` from the n8n starter): on tag `v*`, build and `npm publish
  --provenance --access public`. First publish needs npm trusted publishing configured by
  the operator (npmjs.com → package → Trusted Publishers → GitHub Actions, workflow
  `publish.yml`) or a granular `NPM_TOKEN` secret.
- After publish: operator submits through the n8n Creator Portal.

## 11. Testing

- Jest unit tests (mocked `this.helpers.httpRequest`): host resolution and cache,
  pagination loop, idempotency header presence, error mapping table, signature parser and
  verifier (valid, expired, rolled secret, tampered body), multipart chunking (part count,
  last-part size, abort on failure), trigger lifecycle (static data set/cleared).
- Operation descriptions: a snapshot-free structural test asserting every operation has
  `name`, `action`, `description`, a route in the catalogue and a scope.
- Manual smoke (operator, plain-language checklist) with `npm run dev` against
  `https://api.stg.brault.app` and the stg key: trigger on `file.created` and
  `comment.created`, upload a binary from a Read Binary node, import from URL with wait,
  list files with Return All, create a comment, create a shared link, create a transfer with
  two files, download a file to binary.

## 12. Operator tasks (not blocking the build)

1. npm: create the `brault` user or org and, after the first publish, add the trusted
   publisher (or provide a granular token as `NPM_TOKEN`).
2. n8n Creator Portal account and submission.
3. Review the smoke checklist on stg before the first tag.
4. Optional follow-up: workflow templates on n8n.io and the Zapier app.

## 13. Decisions log

| # | Decision | Why |
| --- | --- | --- |
| D1 | Programmatic style for both nodes | Multi-step uploads, plane routing, binaries, cursor pagination. |
| D2 | Unscoped package name `n8n-nodes-brault` | Discoverable, no npm org prerequisite. |
| D3 | Webhook secret in workflow static data | Only place n8n offers per-workflow; the n8n webhook path is already unguessable; signature check is on by default. |
| D4 | Regional host discovered from `/v1/me`, cached 10 min | Honours ADR-041 without asking the user for a region. |
| D5 | Limits Pro 5 / Growth 25 / Custom 25 | Operator choice 2026-09-10; one endpoint per workflow made Pro 3 too tight. |
| D6 | Limit ≤ 1,000 items per Get Many execution | Protects monthly quotas (Lite 1,000, Pro 100,000). |
