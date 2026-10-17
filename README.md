# grok-digest

`grok-digest` renders a Grok Digest site: X bookmarks summarized by Grok, searchable, sorted by topic, with one RSS feed per topic. A site repository holds only its `data/` files, a `package.json`, and a deploy workflow. The page, the feeds, and the schema come from this package.

[`BOT.md`](BOT.md) is the manual for the Grok bot that writes a site's data: what to do with a shared post, every field of an entry, and how to change or remove one. It ships in the package, so `node_modules/grok-digest/BOT.md` always matches the installed version.

Every deploy installs the newest `grok-digest`, so a release reaches each site the next time its Grok bot pushes a bookmark.

## Set up a site

Create a public repository and copy the [`template/`](https://github.com/kenryu42/grok-digest/tree/main/template) directory into it (skip `template/data` when the repository already has data). Enable GitHub Pages with **GitHub Actions** as the source, then:

```sh
bun install
git add bun.lock
git commit -m "Install grok-digest"
git push
```

The rest is in `template/README.md`. To convert a site that still holds a copy of the page source, follow [MIGRATION.md](https://github.com/kenryu42/grok-digest/blob/main/MIGRATION.md).

A site repository contains:

| Path                           | Contents                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `data/bookmarks.json`          | The bookmarks. The Grok bot appends to it.                                        |
| `data/processed.json`          | Optional. Ids the bot has handled.                                                |
| `data/removed.json`            | Optional. Ids the bot has removed.                                                |
| `custom/`                      | Optional. The owner's changes to the page, described below.                       |
| `package.json`                 | Depends on `"grok-digest": "latest"` and maps the scripts to the CLI below.       |
| `bun.lock`                     | The lockfile.                                                                     |
| `.github/workflows/deploy.yml` | Validates the data, builds with the newest `grok-digest`, and publishes to Pages. |

## How a site takes new versions

`deploy.yml` runs `bun install --frozen-lockfile`, then `bun update grok-digest`. The update moves `grok-digest` to the newest version that `package.json` allows, inside that run only, and commits nothing. With `"latest"`, that is the newest release.

To hold a site on one version, set the dependency to that exact version, such as `"grok-digest": "0.1.3"`. `bun update grok-digest` keeps an exact version where it is. Set it back to `"latest"` to follow releases again.

If a release fails a site's build, the deploy stops and the page that was live stays live.

## Customize a site

A site changes its page from `custom/`, and keeps every release for the parts it leaves alone. A site without `custom/` gets the page exactly as released. The owner asks the Grok bot for a change; [`BOT.md`](BOT.md) tells it how, under "Change the page".

| Path                                  | Changes                                                                                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `custom/config.json`                  | Settings: `title`, `defaultView`, `reviewSize`, `detail.phone`, `detail.desktop`, and `swipeMode`. `validate` checks the file.                                                                                                                         |
| `custom/theme.css`                    | Plain CSS loaded after the page's own: the color variables, fonts, and any selector.                                                                                                                                                                   |
| `custom/components/<Component>.astro` | Replaces `Header`, `Footer`, or `BookmarkCard`. Tailwind classes in it work.                                                                                                                                                                           |
| `custom/components/<Component>.tsx`   | Replaces a part of the controls: `ControlsLayout`, `ViewTabs`, `SearchField`, `TopicChips`, `DetailControl`, `StatusLine`, `KeyboardHints`, `UndoToast`, or `DoneCleanup`; or of swipe mode: `SwipeHeader`, `SwipeCard`, `SwipeFooter`, or `SwipeEnd`. |
| `custom/components/.ejected/`         | Written by `eject` and `merge`. The component as the site last took it from the package.                                                                                                                                                               |

`grok-digest eject <Component>` copies the package's component into `custom/components/`, with its imports pointed at `grok-digest/internal/…`, the package's own modules. When a release changes that component, the build warns, and `grok-digest merge` runs `git merge-file` to apply the change to the site's copy. A change that conflicts with the site's own leaves conflict markers and makes `merge` exit with 1, and the build refuses the file until they are resolved.

The page finds cards and their parts by `data-` attributes, so an ejected `BookmarkCard` keeps them. `Header` and `Footer` carry none.

The controls island keeps its state and behavior in `useBookmarkControls` and renders `ControlsLayout`, which renders the other parts. Each part gets one prop, `controls`: the state and the functions that change it. The parts import each other through `virtual:grok-digest/components/<Component>`, which the integration resolves to the site's copy when there is one. Its fields are listed in `CUSTOMIZING.md`; renaming or removing one is a breaking change for ejected parts.

Swipe mode works the same way with `useSwipeMode` and a `swipe` prop. `SwipeMode` keeps the frame that paging and swiping depend on: the dialog, the full-height pages that scroll-snap, and the element a swipe moves. The parts render inside it. `SwipeCard` also gets `page.card`, the bookmark's server-rendered card, for anything the text blocks leave out.

## CLI

```text
grok-digest build                Build the site into dist/.
grok-digest dev                  Serve the site at http://localhost:4321 and reload on changes.
grok-digest preview              Serve the site built in dist/.
grok-digest validate [file ...]  Check the data files and custom/config.json.
grok-digest eject <component>    Copy a page component or a part of the controls into custom/components/.
grok-digest merge                Bring ejected components up to the installed version.

--data-dir <dir>  The folder that holds the data files. Defaults to "data".
--host            With dev or preview, also serve on this machine's network address.
```

`--host` lets a phone on the same Wi-Fi open the site: the command prints a `Network` address, such as `http://192.168.0.10:4321`, to open on the phone. Anyone on that network can reach it while it runs.

`build`, `dev`, and `preview` read two environment variables. `SITE_URL` is the site's origin, such as `https://<your-username>.github.io`, and becomes Astro's `site`. `BASE_PATH` is the path the site is served under, such as `/<repository-name>`, and becomes Astro's `base`, so links on a `github.io/<repository-name>/` site stay under that path. The deploy workflow sets both from GitHub Pages.

`validate` with no file checks `data/bookmarks.json` and whichever of `data/processed.json`, `data/removed.json`, and `custom/config.json` exist. It prints one line per file, such as `✓ data/bookmarks.json: 2 bookmarks`, and fails naming the entry and the field of an invalid file.

The site needs no Astro config. The package depends on the Astro version it was tested with and runs it.

## Data files

`grok-digest/schema` exports `SCHEMA_VERSION`, the zod schemas, and `parseBookmarks`:

```js
import { SCHEMA_VERSION, bookmarkSchema, parseBookmarks, TOPICS } from "grok-digest/schema";
```

`SCHEMA_VERSION` is `1`. The JSON files have no version field. A `bookmarks.json` that already validates is version 1. `posted_at` with milliseconds and a `Z` offset, as the bot writes it, is version 1. The optional `media` field, a post's images, is part of version 1 too: a bookmark without it parses with `media` set to `[]`. So is a link's optional `image`, X's copy of its preview image.

| File                  | Version 1 shape                                                      |
| --------------------- | -------------------------------------------------------------------- |
| `data/bookmarks.json` | Array of bookmark objects. Every field is described in `BOT.md`.     |
| `data/processed.json` | Array of non-empty id strings. Optional. The page does not read it.  |
| `data/removed.json`   | Same shape as `processed.json`. Optional. The page does not read it. |

Every site takes every release, so every release reads every data file an earlier release accepted. The policy is in `MIGRATION.md`.

## The page

The page title is "Grok Digest" unless `custom/config.json` sets `title`. The footer reads "Unofficial. Summaries created with Grok." Every page sends `<meta name="robots" content="noindex,nofollow">` and `<meta name="referrer" content="no-referrer">`. `robots.txt` disallows all crawlers. Feeds live at `rss.xml` and `rss/<topic-id>.xml`. Card anchors are `#b-<id>`.

The page opens on Today, a daily review of up to five bookmarks, and has Inbox, Done, and All views. Search, topic, and view are `?q=`, `?topic=`, and `?view=` on the page address. The behavior is documented in `template/README.md`.

## Package exports

| Export               | Role                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `grok-digest`        | Default export, the Astro integration `grokDigest({ dataDir })`, for a site that keeps its own Astro config.                                                                                           |
| `grok-digest/schema` | `SCHEMA_VERSION`, `bookmarkSchema`, `bookmarksFileSchema`, `stateFileSchema`, `parseBookmarks`, `parseDataFile`, `TOPICS`, `TOPIC_LABELS`, and the `Bookmark`, `BookmarkFileEntry`, and `Topic` types. |
| `grok-digest` bin    | The CLI above.                                                                                                                                                                                         |

## Develop

You need Bun 1.4 and Node.js 22.12 or later.

```sh
bun install
bun run dev      # builds the package, then serves template/ at http://localhost:4321 and the printed Network address
bun run test
bun run check    # typecheck, oxlint, oxfmt, comment lint, jscpd, knip, tests, starter build
bun run format
```

`bun run check` ends by packing the package with `bun pm pack`, installing the tarball into a copy of `template/` outside the repository, and building it with `SITE_URL=https://example.github.io` and `BASE_PATH=/bm-check`. It checks that the written links stay under that path. This is the same install a site's deploy does.

## Publish

Releases are cut from GitHub Actions. Open **Actions** > **Prepare Release** > **Run workflow** and choose:

| Input     | Meaning                                                                        |
| --------- | ------------------------------------------------------------------------------ |
| `bump`    | `patch`, `minor`, or `major`, applied to the version in `package.json`.        |
| `version` | Optional. An exact version such as `0.2.0`, without the `v`. Overrides `bump`. |
| `dry_run` | Run every check on the new version and stop before changing Git.               |

`prepare-release.yml` refuses a version that is not newer, whose tag exists, or that is already on npm. It sets the new version, runs `bun run check`, commits `release: v<version>` to `main`, pushes the commit and the `v<version>` tag together, and starts `publish.yml` on that tag.

`publish.yml` checks the tag again, packs the tarball, publishes that exact tarball to npm with provenance, and creates a GitHub release with generated notes and the tarball attached. Rerunning it for a tag that is already on npm skips the publish and finishes the release.

npm accepts the publish through trusted publishing, so the repository holds no npm token. On npmjs.com, the package's **Settings** list `kenryu42/grok-digest` with workflow `publish.yml` as a trusted publisher.

Version 0.1.0 was published from a maintainer's machine, because npm offers trusted publishing only for a package that already exists.

## License

MIT
