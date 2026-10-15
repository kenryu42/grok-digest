# Changelog

## 0.1.0

First release of the `grok-digest` package.

- Astro integration that serves the bookmarks page, topic feeds, favicon, and `robots.txt`.
- Schema version 1, the `bookmarks.json` array existing sites already use. `SCHEMA_VERSION` is exported from `grok-digest/schema`.
- `grok-digest validate` checks `bookmarks.json` and, when present, `processed.json` and `removed.json`.
- `grok-digest build`, `dev`, and `preview` run the site with the Astro version the package depends on, so a site needs no Astro config. `SITE_URL` and `BASE_PATH` set Astro's `site` and `base`.
