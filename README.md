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
