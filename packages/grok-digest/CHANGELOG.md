# Changelog

## 0.1.0

First release of the `grok-digest` package.

- Astro integration that serves the bookmarks page, topic feeds, favicon, and `robots.txt`.
- Schema version 1, the `bookmarks.json` array existing sites already use. `SCHEMA_VERSION` is exported from `grok-digest/schema`.
- `grok-digest validate` checks `bookmarks.json` and, when present, `processed.json` and `removed.json`.
