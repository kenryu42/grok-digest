# grok-digest

`grok-digest` is the Astro integration behind a Grok Digest site: X bookmarks summarized by Grok, searchable, sorted by topic, with one RSS feed per topic. Sites install it and keep their own `data/` files. A new package version reaches those sites as a dependency bump.

The npm package name `grok-digest` was free at the time this repository was restructured, so the package is unscoped.

## Repository layout

| Path                   | Contents                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/grok-digest` | The published package. The integration, the page, the schema, and the `grok-digest validate` CLI. |
| `template/`            | The thin site. Copy this directory into a user's repository.                                      |
| `MIGRATION.md`         | How to convert an existing copy, such as `kenryu42/bm-65zhrc`, and the schema version policy.     |

A user repository contains `data/*.json`, `astro.config.mjs`, `package.json`, the deploy workflow, and Dependabot config. It does not contain the page source. `template/astro.config.mjs` is the whole config: it passes `SITE_URL` and `BASE_PATH` through to Astro and registers `grokDigest({ dataDir: "./data" })`.

`dataDir` is the folder of `bookmarks.json`, relative to the Astro project root. It defaults to `data`.

The integration injects the page, the feeds, the favicon, and `robots.txt`, and it registers React and Tailwind. `SITE_URL` becomes Astro's `site`. `BASE_PATH` becomes Astro's `base`, so links on a `github.io/<repository-name>/` site stay under that path.

## Set up a site

Create a public repository, copy `template/` into it (skip `template/data` when the repository already has data), enable GitHub Pages with **GitHub Actions** as the source, then `pnpm install`, commit `pnpm-lock.yaml`, and push. The rest is in `template/README.md`.

Turn off **Template repository** on this repository. A GitHub template copy would clone the package source into every site. New sites copy `template/` only. Existing sites follow `MIGRATION.md`. This repository's CI workflow runs `pnpm check` and does not deploy a site. The sample page is the `template/` build inside that check. A live page belongs to each user repository.

## Updates

`template/.github/dependabot.yml` is what a user repository commits as `.github/dependabot.yml`. Dependabot opens a pull request for each new `grok-digest` version. Merging it updates the site.

Renovate is the same mechanism if that account already runs Renovate. Drop the Dependabot file so only one bot opens pull requests.

The other option is the dist-tag `latest`: set the dependency to `"grok-digest": "latest"` and run `pnpm update grok-digest` when you want the new version. The lockfile holds the resolved version until that command, and the deploy workflow installs with `--frozen-lockfile`, so a site does not move forward on its own.

`template/package.json` depends on `^0.1.0`. That range accepts later `0.1.x` releases and refuses `0.2.0`. A schema change ships as the next minor version while the package is 0.x, and as the next major from 1.0.0.

## Schema version 1

`grok-digest/schema` exports `SCHEMA_VERSION`, the zod schemas, and `parseBookmarks`.

```js
import { SCHEMA_VERSION, bookmarkSchema, parseBookmarks, TOPICS } from "grok-digest/schema";
```

`SCHEMA_VERSION` is `1`. The JSON files have no version field. A `bookmarks.json` that already validates is version 1, including files written before this package existed. `posted_at` with milliseconds and a `Z` offset, as the bot writes it, is version 1.

| File                  | Version 1 shape                                                        |
| --------------------- | ---------------------------------------------------------------------- |
| `data/bookmarks.json` | Array of bookmark objects. The field table is in `template/README.md`. |
| `data/processed.json` | Array of non-empty id strings. Optional. The page does not read it.    |
| `data/removed.json`   | Same shape as `processed.json`. Optional. The page does not read it.   |

`grok-digest validate data/bookmarks.json` checks files from a user repository. With no arguments it checks `data/bookmarks.json` and any of the two state files that exist. `pnpm validate` in `template/` runs that command.

A release that keeps `SCHEMA_VERSION` at 1 accepts every version 1 file unchanged. `SCHEMA_VERSION` increases only when a previously valid file would be rejected or read differently. The changelog of that release describes the rewrite, and the starter's version range does not install it until someone edits `package.json`. The full policy is in `MIGRATION.md`. Version 1 has no rewrite.

## The page

The page title is "Grok Digest". The footer reads "Unofficial. Summaries created with Grok." Every page sends `<meta name="robots" content="noindex,nofollow">` and `<meta name="referrer" content="no-referrer">`. `robots.txt` disallows all crawlers. Feeds live at `rss.xml` and `rss/<topic-id>.xml`. Card anchors are `#b-<id>`.

Search and topic filters are `?q=` and `?topic=` on the page address. The behavior is documented in `template/README.md`.

## Develop

You need Node.js 22.12 or later and pnpm 10.

```sh
pnpm install
pnpm dev       # builds the package, then serves template/ at http://localhost:4321
pnpm test
pnpm check     # typecheck, oxlint, oxfmt, comment lint, jscpd, knip, tests, starter build
pnpm format
pnpm --filter grok-digest build
```

`pnpm check` builds the package, then builds `template/` with `SITE_URL=https://example.github.io` and `BASE_PATH=/bm-check` and checks that the written links stay under that path. `node scripts/check-starter.mjs --packed` repeats the build from `pnpm pack` in a directory outside the workspace.

To preview the sample site on a project path:

```sh
pnpm --filter grok-digest build
SITE_URL=https://<your-username>.github.io BASE_PATH=/grok-digest pnpm --filter grok-digest-starter build
```

The artifact is `template/dist`.

## Publish

Publishing is manual. This repository does not create the npm token and the release workflow does not run until you push a tag.

1. Create an npm access token that can publish `grok-digest`, and add it to this repository as the Actions secret `NPM_TOKEN`. Do not commit the token.
2. Set `packages/grok-digest/package.json` `version` to the release, and write the matching entry in `packages/grok-digest/CHANGELOG.md`. A schema change increments `SCHEMA_VERSION` in the same commit and follows the policy in `MIGRATION.md`.
3. Merge that commit to `main`.
4. Tag the merge commit and push the tag. The tag is `v` plus the version in `package.json`, for example `v0.1.0`:

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

`.github/workflows/release.yml` runs on that tag. It refuses the job when the tag and `package.json` disagree, then runs `pnpm publish --access public --provenance --no-git-checks` from `packages/grok-digest`. Provenance uses GitHub's OIDC token (`id-token: write`). `prepack` builds `dist/` before the tarball is made.

After the first publish, migrate existing sites with `MIGRATION.md`. New sites copy `template/`.

## Package exports

| Export               | Role                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `grok-digest`        | Default export, the Astro integration `grokDigest({ dataDir })`.                                                                                                                                       |
| `grok-digest/schema` | `SCHEMA_VERSION`, `bookmarkSchema`, `bookmarksFileSchema`, `stateFileSchema`, `parseBookmarks`, `parseDataFile`, `TOPICS`, `TOPIC_LABELS`, and the `Bookmark`, `BookmarkFileEntry`, and `Topic` types. |
| `grok-digest` bin    | `grok-digest validate [file ...] [--data-dir <dir>]`.                                                                                                                                                  |
