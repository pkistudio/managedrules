# Changelog

All notable changes to this repository are tracked here. This repository uses Git tags for versioning.

## v0.1.2 - 2026-05-22

### Sync

- Corrected managed sync PR body text so it no longer says workflow files are synchronized.

## v0.1.1 - 2026-05-22

### Rules

- Updated shared ADR instructions to include code review guidance for checking proposed changes against existing ADRs.
- Added ADR review focus areas for dependencies, database strategy, authentication and authorization, API design, cryptography, deployment architecture, runtime infrastructure, and major framework choices.
- Clarified when to suggest adding a new ADR and to prefer the existing `docs/adr/0000-template.md` template when available.

## v0.1.0 - 2026-05-22

Initial managed rules foundation.

### Rules

- Added the standard PkiStudio release prompt.
- Added shared ADR instructions.
- Added shared release instructions.
- Added the product-owned sync workflow bootstrap template.

### Profiles

- Added release profiles for `pkistudio/pkistudiojs`, `pkistudio/pvkgadgets`, `pkistudio/certgadgets`, and `pkistudio/asn1instancebuilder`.
- Populated product-specific package names, version files, verification commands, publishing workflows, Pages artifact paths, Wiki paths, and release hooks.

### Sync

- Added per-product manifests that map managed rule source files to product repository target paths.
- Added `scripts/sync-managed-rules.mjs` for pull-based product repository sync PRs.
- Made product repositories responsible for owning their bootstrap sync workflow.

### Documentation

- Documented repository layout, pull-based sync, dry-run checks, and product repository bootstrap workflow usage.
- Updated the license format to match the PkiStudio repository style.