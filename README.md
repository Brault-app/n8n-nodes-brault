# n8n-nodes-brault

[![npm version](https://img.shields.io/npm/v/n8n-nodes-brault.svg)](https://www.npmjs.com/package/n8n-nodes-brault)
[![CI](https://github.com/Brault-app/n8n-nodes-brault/actions/workflows/ci.yml/badge.svg)](https://github.com/Brault-app/n8n-nodes-brault/actions/workflows/ci.yml)

The native n8n node for [Brault](https://brault.app), the digital asset library for
creative teams. Trigger workflows from Brault events and automate files, boards,
comments, review links and transfers against the [Brault Public API](https://developers.brault.app).

## What you can do

- **Trigger on 40+ events** — a file uploaded, a comment posted, a transfer downloaded,
  an import finished, and everything else in the [event catalogue](https://developers.brault.app/docs/webhooks).
- **Files** — upload, download, import from a URL, move, copy, tag, delete/restore, and
  manage versions.
- **Boards and properties** — create and update boards, add or remove files, set
  brandspace and board property values.
- **Comments and review links** — post and resolve comments and replies, create shared
  links for review.
- **Transfers** — send files by link, from existing library items or from binary data
  produced earlier in the workflow.
- **Search** — free-text search across a brandspace.
- **Use it as a tool for n8n AI agents** — the `Brault` node is exposed with
  `usableAsTool: true`, so an AI Agent node can call any of its operations directly.

## Install

**n8n Cloud or self-hosted** — Settings → Community Nodes → install `n8n-nodes-brault`.
Once the package passes n8n's verification, it also appears directly in the nodes panel
search.

Requires n8n **1.80** or later.

```bash
npm install n8n-nodes-brault
```

(self-hosted, outside the Community Nodes UI)

## Credentials

Create a `Brault API` credential with an API key and a base URL.

1. In Brault, go to **Settings → Developers → API keys** and create a key. See
   [Get an API key](https://developers.brault.app/docs/get-an-api-key).
2. Paste the key (starts with `bsk_`) into the credential's **API Key** field.
3. Leave **Base URL** at `https://api.brault.app` unless Brault support gave you another
   host.

A key can never do more than the person who created it can do in the app, and each
scope below only narrows that further. Pick the scopes your workflow needs:

| Resource | Scope needed |
| --- | --- |
| Library, Folder, File, Import, Search, Bulk Download | `files:read` (read operations), `files:write` (create, update, delete) |
| Property (brandspace properties, used on files) | `files:read` / `files:write` |
| Board, Board Property | `boards:read` / `boards:write` |
| Comment, Reply | `comments:read` / `comments:write` |
| Page | `pages:read` / `pages:write` |
| Shared Link | `shares:read` / `shares:write` |
| Transfer | `transfers:read` / `transfers:write` |
| Member, Role | `members:read` |
| Brandspace | any key (no scope required) |
| Brault Trigger | `webhooks:manage` |

A key acts as its creator and pauses automatically if that person loses access to the
brandspace. For a shared automation like this one, create the key from a long-lived
admin account rather than a single contributor's, so the workflow does not stop the day
that person leaves the brandspace.

## Brault Trigger

The `Brault Trigger` node registers a webhook endpoint in Brault when you activate the
workflow, and removes it when you deactivate the workflow. Choose one or more events
from the **Events** list (or `*` for every event); n8n handles endpoint creation,
removal and the "Listen for test event" flow for you.

- **Signature verification** is on by default (**Options → Verify Signature**). The node
  checks the `Brault-Signature` header against the endpoint secret and rejects a
  delivery whose signature does not match or is older than 5 minutes; turn it off only
  for local debugging.
- **One endpoint per workflow.** Each active workflow gets its own endpoint, named
  `n8n · <workflow name>` in Brault's Settings → Developers → Webhooks. Deactivating the
  workflow deletes that endpoint.
- **Plan limits** on webhook endpoints: Lite 1, Pro 5, Growth 25, Custom 25 (each
  workflow needs its own endpoint, so this caps how many `Brault Trigger` workflows can
  be active at once). See [Plans and limits](https://developers.brault.app/docs/plans-and-limits).
  Webhook deliveries do not count against your monthly request quota; calls the `Brault`
  node makes do.
- **Sample payload.** To see a delivery before wiring up the rest of the workflow, send
  a test event from the developers panel, or:

  ```bash
  curl -X POST https://api.brault.app/v1/webhooks/<webhook_id>/test \
    -H "Authorization: Bearer $BRAULT_API_KEY"
  ```

## Brault node

Covers nearly every `/v1` resource, 17 resources and 92 operations in total:

| Resource | Operations |
| --- | --- |
| Library | Get Many, Get, Create, Update, Delete |
| Folder | Get Many, Get, Create, Update, Move, Delete, Restore |
| File | Get Many, Get, Update, Move, Copy, Delete, Restore, Get Download URL, Download, Get Similar, Get Boards, Set Property Value, Import From URL, Upload, Get Versions, Activate Version, Delete Version |
| Import | Get |
| Search | Search |
| Comment | Get Many, Get, Create, Update, Delete, Resolve, Reopen |
| Reply | Get Many, Create, Update, Delete |
| Board | Get Many, Get, Create, Update, Delete, Query, Add Files, Remove File, Set File Property, Get Members |
| Board Property | Get Many, Get, Create, Update, Delete, Add Option, Update Option, Delete Option |
| Property | Get Many, Get, Create, Update, Delete, Add Option, Update Option, Delete Option |
| Page | Get Many, Get, Create, Delete, Publish, Unpublish, Append Blocks |
| Shared Link | Get Many, Get, Create, Update, Delete |
| Transfer | Get Many, Get, Create, Update, Delete |
| Bulk Download | Create, Get |
| Brandspace | Get, Get Usage |
| Member | Get Many, Get |
| Role | Get Many |

Notes that apply across every "Get Many" operation:

- **Return All** (boolean, default off) follows Brault's cursor pagination until every
  page is fetched. Leave it off and set **Limit** (default 50, capped at 1,000 per
  execution) to keep a large brandspace from exhausting your monthly quota in one run.
- Every `POST` that creates something sends an `Idempotency-Key` header generated per
  item per execution, so retrying a failed item inside the same execution never creates
  a duplicate.
- A `429` response is retried once automatically when `Retry-After` is 10 seconds or
  less; otherwise the node throws with the `Retry-After` value in the error description
  so you can route it to a Wait node.

## Examples

**a. New file → Slack message with a thumbnail**
`Brault Trigger` (event `file.created`) → `Brault` (File → Get Download URL, rendition
`Thumbnail`) → `Slack` (Send Message, attach the thumbnail URL and the file name from
the trigger payload).

**b. Google Drive file → Brault upload → shared review link**
`Google Drive Trigger` (new file) → `Google Drive` (Download File) → `Brault` (File →
Upload, binary field from the previous node) → `Brault` (Shared Link → Create, type
`review`, file ID from the Upload step's output) → send the link URL wherever the
review request goes.

**c. New comment → Notion task**
`Brault Trigger` (event `comment.created`) → `Brault` (File → Get, ID from the trigger
payload, to pull the file name and library for context) → `Notion` (Create Database
Page, task title from the comment body, link back to the file).

## Development

```bash
npm install
npm run dev     # starts a local n8n instance with this package linked
npm test        # jest unit tests
npm run lint    # n8n-node lint (no --fix)
npm run build   # n8n-node build
npm run scan    # packs the tarball and runs @n8n/scan-community-package against it
npm run release # lints, builds, bumps the version, updates CHANGELOG.md, tags, pushes
```

See `AGENTS.md` for the full pre-push gate and release flow, and
`specs/guides/smoke-checklist.md` for the manual smoke procedure against staging before
a release.

## License

[MIT](LICENSE)
