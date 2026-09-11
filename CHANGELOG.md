# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## [0.1.2] - 2026-09-11

### Fixed

- Node and credential icons use the official Brault mark in both themes (the dark variant was an inverted interpretation and did not follow the brand guidelines).

## [0.1.1] - 2026-09-11

- Every parameter declares an explicit default so n8n's community-package scanner passes (no functional change).

## 0.1.0 - 2026-09-10

### Added

- Package scaffold: build/lint/test tooling, CI workflow, and repo conventions.
- Credential `braultApi` (API key + base URL) with a `GET /v1/me` connection test.
- Node `Brault`: 17 resources and 92 operations covering libraries, folders, files
  (including binary upload, download and version management), imports, search,
  comments, replies, boards, board properties, brandspace properties, pages, shared
  links, transfers, bulk downloads, brandspace, members and roles. Exposed as a tool
  for n8n AI agents (`usableAsTool: true`).
- Node `Brault Trigger`: webhook lifecycle (create on activate, delete on deactivate)
  for any event in the Brault catalogue, with `Brault-Signature` verification on by
  default.
- The Brault mark as the package icon, replacing the placeholder rounded-square "B"
  used during development, with light and dark themed variants
  (`icon: { light, dark }`).
- `specs/guides/smoke-checklist.md`: the operator's manual smoke procedure against
  staging.
