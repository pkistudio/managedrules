# managedrules

Source-of-truth repository for shared PkiStudio prompts, Copilot instructions, release profiles, and synchronization rules.

Product repositories pull from this repository. `managedrules` does not push or distribute files to product repositories by itself.

## Layout

- `rules/prompts/`: shared prompt files copied to product repositories under `.github/prompts/`.
- `rules/instructions/`: shared instruction files copied to product repositories under `.github/instructions/`.
- `rules/workflows/`: bootstrap workflow templates that product repositories can copy once and own.
- `profiles/`: repository-specific release profiles copied to `.github/release-profile.md`.
- `manifests/`: per-repository sync manifests that map source files to target paths.
- `scripts/sync-managed-rules.mjs`: sync script that compares target files and opens a PR when differences exist.

## Product Wiki Source

Product repositories should keep Wiki-facing release notes, page update instructions, or draft page content under `wikisrc/`.

Recommended layout:

```text
wikisrc/
  <version>/
    <WikiPageName>.md
```

When a product change requires a Wiki update, add the matching `wikisrc/` entry in the same product repository PR as the code or documentation change. During the Wiki publication checkpoint, inspect `wikisrc/` first and use those versioned entries to update the separate Wiki checkout. The Wiki commit remains separate from the product repository commit, but the required update source is versioned with the product change.

## Managed Repositories

- `pkistudio/pkistudiojs`
- `pkistudio/pvkgadgets`
- `pkistudio/certgadgets`
- `pkistudio/asn1instancebuilder`
- `pkistudio/asn1defsifter`

## Versioning

This repository uses Git tags for versioning. It is not published as an npm package.

- Use `main` for normal product repository sync.
- Create annotated tags such as `v0.1.0` at stable rule snapshots.
- Record notable changes in `CHANGELOG.md` before tagging.
- Product repositories may sync from `main`, a tag, or a specific commit by setting `managedrules_ref` in their workflow dispatch.

Recommended tag categories:

- `rules`: prompt or instruction changes.
- `profiles`: product release profile changes.
- `sync`: manifest, workflow bootstrap, or sync script changes.

Create and push a release tag with:

```sh
git tag -a v0.1.0 -m "managedrules v0.1.0"
git push origin main v0.1.0
```

## Dry Run

Use a dry run to compare a product repository checkout without changing files:

```sh
node scripts/sync-managed-rules.mjs \
  --manifest manifests/pvkgadgets.yml \
  --target-dir ../pvkgadgets \
  --dry-run
```

The script exits with code `1` when differences are found during a dry run. This makes it usable as a drift check in CI.

## Open A Sync PR From A Product Checkout

Run the script without `--dry-run` to create a branch, commit synchronized files, push the branch, and open a PR:

```sh
node scripts/sync-managed-rules.mjs \
  --manifest manifests/pvkgadgets.yml \
  --target-dir ../pvkgadgets
```

Requirements:

- Node.js
- `git`
- GitHub CLI (`gh`) authenticated with permission to push branches and create PRs

## Product Repository Workflow

Each product repository should keep its own `.github/workflows/sync-managed-rules.yml`. Use `rules/workflows/sync-managed-rules.yml` as the bootstrap template when adding the workflow to a product repository for the first time.

That workflow checks out both the product repository and `pkistudio/managedrules`, then runs the sync script with the product repository's manifest. It can be run manually, optionally against a specific `managedrules_ref`, and also runs weekly.

The manifests intentionally do not sync workflow files. After bootstrap, the workflow belongs to each product repository. Managed rule sync PRs update prompts, instructions, and `.github/release-profile.md` only.