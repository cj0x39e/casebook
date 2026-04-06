# Casebook Specification

## Directory Conventions

- All test cases are stored under `casebook/tests/`
- Casebook only scans `.md` files under `casebook/tests/`

## Frontmatter

- Required fields: `title`, `platform`
- Optional fields: `priority`, `status`
- Valid `status` values are configured in `casebook/config.yml`, defaults: `todo`, `pass`, `blocked`

## Body Structure

- Recommended section: `## Preconditions`
- Recommended section: `## Steps`
- Recommended section: `## Expected Results`
