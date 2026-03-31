# Casebook

Casebook is a Tauri desktop app for browsing Markdown-native test cases that live inside a
project's `casebook/tests` directory.

## MVP

- Open any local project directory
- Detect whether `casebook/tests` exists
- Recursively scan Markdown case files
- Parse frontmatter and required sections on the frontend
- Show Git-based update time when available, otherwise fall back to file modification time

## Development

```bash
npm install
npm run tauri:dev
```

## Build

```bash
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

## Release

This repository publishes desktop bundles to GitHub Releases with GitHub Actions.

1. Update `src-tauri/tauri.conf.json` so `version` matches the release you want to publish.
2. Commit and push your changes.
3. Create and push a tag in the form `vX.Y.Z`.

```bash
git tag v0.1.0
git push origin v0.1.0
```

Pushing the tag triggers `.github/workflows/release.yml`, builds the app on macOS and Windows,
creates or updates the matching GitHub Release, and uploads the generated installers.
