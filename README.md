# Casebook

Casebook is a desktop app for browsing and maintaining Markdown-native test cases that live
inside your repository.

Instead of pushing QA assets into a separate tool, Casebook treats test cases as versioned project
files. Each project keeps its own case library under `casebook/tests`, and the app turns that
directory into a searchable, readable desktop workspace with parsing, rendering, timestamps, and
status updates.

## Why Casebook

Casebook is built for teams that want test cases to stay close to the codebase:

- Markdown files can be reviewed, diffed, and versioned with Git.
- Test cases live next to the product context they describe.
- A local desktop app provides a better reading and maintenance experience than opening raw files.
- The case library stays portable because the source of truth is still plain text in the repo.

## What It Does

Casebook currently supports the following workflow:

- Open any local project directory from the desktop app.
- Bootstrap a minimal `casebook/` structure if the selected project does not have one yet.
- Recursively scan `casebook/tests` for Markdown case files.
- Parse frontmatter and render Markdown content in the app.
- Surface parse warnings when metadata is incomplete or invalid.
- Prefer Git history for timestamps and fall back to filesystem metadata when needed.
- Update case workflow status directly from the UI.

## Project Structure

Casebook expects each project to keep its case library under a `casebook/` directory:

```text
your-project/
└── casebook/
    ├── config.yml
    └── tests/
        └── ...
```

`casebook/tests/` is the source of truth for case files.

Current structure rules:

- Casebook scans files recursively under `casebook/tests/`.
- Only `.md` files are treated as cases.
- Case IDs are derived from each file's relative path under `casebook/tests/`.
- `casebook/config.yml` currently supports `tests_alias`, which is used as the library label in the UI.

When you open a project that does not contain `casebook/`, the app bootstraps the minimal skeleton
required for scanning:

- `casebook/`
- `casebook/tests/`
- `casebook/config.yml`
- `casebook/AGENTS.md`

## Case Format

Each case is a Markdown file with optional YAML frontmatter.

### Required frontmatter

- `title`
- `platform`

### Optional frontmatter

- `priority`
- `status`

### Supported status values

- `todo`
- `in_progress`
- `pass`
- `blocked`

### Recommended body sections

- `## Preconditions`
- `## Steps`
- `## Expected Result`

Example:

```md
---
title: Open a project and load the case library
platform: desktop
priority: P1
status: todo
---

## Preconditions

- The project exists on disk.
- The user can access the project directory.

## Steps

1. Launch Casebook.
2. Choose the local project directory.
3. Wait for the scan to complete.

## Expected Result

- Casebook displays the library tree.
- Markdown cases are available in the detail view.
```

Parsing is intentionally tolerant:

- Missing metadata produces warnings instead of making the file unreadable.
- Missing `title` falls back to the filename.
- Missing `platform` falls back to the top-level path segment when possible.
- Invalid frontmatter is surfaced as a parse problem, but the file content can still be shown.

## How Casebook Reads Data

For each discovered case file, Casebook records:

- relative path inside `casebook/tests/`
- absolute path on disk
- raw Markdown content
- created timestamp
- updated timestamp
- update source label

Timestamp behavior:

- `updated_at` prefers Git history when available
- otherwise it falls back to filesystem modification time
- `created_at` is derived from the first Git commit seen for that file when history exists

## Requirements

To run or build the app locally, you need:

- Node.js
- npm
- Rust
- Tauri build prerequisites for your platform

The repository uses:

- Vue 3 for the frontend
- Tauri 2 for the desktop shell
- Rust for filesystem scanning and status updates

## Development

Install dependencies and start the desktop app in development mode:

```bash
npm install
npm run tauri:dev
```

Useful scripts:

```bash
npm run dev
npm run build
npm run tauri:build
```

## Production Build

To verify the frontend and Rust code locally:

```bash
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

To build desktop bundles through Tauri:

```bash
npm run tauri:build
```

## Release Workflow

This repository publishes desktop bundles to GitHub Releases through
[`/.github/workflows/release.yml`](./.github/workflows/release.yml).

Current release behavior:

- pushing a tag that matches `v*` triggers an automated release build
- the workflow builds on macOS and Windows
- release assets are uploaded to GitHub Releases
- the release tag must match the version in `src-tauri/tauri.conf.json`

### Tag-based release

1. Update `src-tauri/tauri.conf.json` so `version` matches the release you want to publish.
2. Commit and push your changes.
3. Create and push a version tag in the form `vX.Y.Z`.

```bash
git tag v0.1.0
git push origin v0.1.0
```

### Manual release dispatch

The same workflow also supports manual dispatch from the GitHub Actions UI.

When running it manually:

- choose the `Release` workflow
- select the branch to run from
- provide the required `tag` input, for example `v0.1.0`

The workflow uses that tag for version validation, release naming, and asset upload.

## Current Notes

- Casebook is currently a desktop app built with Vue and Tauri.
- The automated GitHub Release workflow currently targets macOS and Windows.
- The top-level README documents the current repository contract and app behavior; it should stay in
  sync with `src-tauri/tauri.conf.json`, `.github/workflows/release.yml`, and the case parsing logic.
