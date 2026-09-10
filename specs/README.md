# specs/

Spec-driven development for `n8n-nodes-brault`. This is the single source of truth for
what this package does and why — read the relevant file here before implementing,
never guess.

## Folders

- `features/` — design docs: what the credential and nodes do, their resources and
  operations, and how they map onto the Brault Public API. Start with
  `features/2026-09-10-n8n-node-design.md`.
- `plans/` — phased, numbered implementation plans that turn a feature design into
  ordered tasks.
- `guides/` — how-we-build docs: the CI/release pipeline, style conventions.

Not every folder is populated yet — this package is new. Create a folder only when
there is content to place in it (see the root monorepo `AGENTS.md` for the full
spec-filename convention shared across Brault repos).

## How this repo differs from the others

`n8n-nodes-brault` has no backend, database, or infrastructure of its own — it is a
thin client wrapping the Brault Public API for n8n. There is no `specs/contracts/`
folder here: the contracts this package must match live in
`brault-backend/specs/contracts/` (the sibling repo). When in doubt about a field name,
enum value, or error shape, that is the file to check.
