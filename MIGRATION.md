# Migrating a site to the grok-digest package

A site such as [kenryu42/bm-65zhrc](https://github.com/kenryu42/bm-65zhrc) is a copy of this repository from when the site code lived at the root. This converts that copy into a thin site that installs `grok-digest` and keeps the existing `data/` files.

Do this only after `grok-digest` is on npm. Publishing is a manual step in the package repository; see the root README.

The data files do not change. Schema version 1 is the format those files already have.

## Convert the repository

Clone the site and the package repository side by side. The example uses `bm-65zhrc`.

```sh
git clone git@github.com:kenryu42/bm-65zhrc.git
git clone --depth 1 git@github.com:kenryu42/grok-digest.git
cd bm-65zhrc
```

Confirm the data files are the only content you need to keep, then remove the copied site code:

```sh
git rm -r src public scripts .agents .claude
git rm -r --ignore-unmatch .github/workflows
git rm AGENTS.md components.json tsconfig.json package.json pnpm-lock.yaml .oxlintrc.json .oxfmtrc.json README.md
```

`data/bookmarks.json`, `data/processed.json`, and `data/removed.json` stay where they are. If `processed.json` or `removed.json` is absent, leave it absent. The validator checks a state file only when the file exists, and an empty bookmarks list (`[]`) is valid.

Copy the thin starter, without its sample data:

```sh
cp ../grok-digest/template/package.json ../grok-digest/template/.gitignore ../grok-digest/template/README.md .
mkdir -p .github/workflows
cp ../grok-digest/template/.github/workflows/deploy.yml .github/workflows/deploy.yml
git rm --ignore-unmatch .github/dependabot.yml
```

`package.json` asks for `"grok-digest": "latest"`. Install with [Bun](https://bun.sh) and check the data:

```sh
bun install
bun run validate
SITE_URL=https://<your-username>.github.io BASE_PATH=/<repository-name> bun run build
```

`bun run validate` prints one line per file, such as `✓ data/bookmarks.json: 2 bookmarks`. A file that does not match schema version 1 fails the command and names the entry and the field. Do not rewrite a file to get past that: the published package would be rejecting a version 1 file, which is a bug.

Commit the new files, including `bun.lock`, and push to `main`. The deploy workflow validates the data, builds with the `SITE_URL` and `BASE_PATH` that GitHub Pages reports, and publishes the same project site as before. Pages stays on **GitHub Actions** as its source.

## Receiving later package versions

The deploy workflow runs `bun update grok-digest` before it builds, so every deploy takes the newest release. A site needs no bot and no pull request to update. `template/README.md` shows how to hold a site on one version.

## Schema version policy

`grok-digest/schema` exports `SCHEMA_VERSION`. It is a number, currently `1`. The JSON files do not contain a version field, so a file written before this package existed is version 1 when it matches the rules below.

Version 1 files:

| File                  | Shape                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/bookmarks.json` | A JSON array of bookmark objects. Fields, types, and topic ids are the tables in `template/README.md`. Every field is required. `text` may be `""`. `key_points` may be `[]`. |
| `data/processed.json` | A JSON array of non-empty strings. The bot records ids it has handled. The site does not read this file.                                                                      |
| `data/removed.json`   | The same shape as `processed.json`, for ids the bot has removed. The site does not read this file.                                                                            |

`posted_at` may be a date (`2026-01-15`) or a datetime with an offset (`2026-10-13T23:24:10.000Z`). Both are version 1.

Policy:

- Every site builds with the newest release, so a release must read every file an earlier release accepted, and read it the same way.
- A release may add a new shape, such as a new optional field or a new topic. It keeps accepting the old shapes. `SCHEMA_VERSION` increases when a release adds a shape that an older release would reject, and the bot may write the new shape only after that release is out.
- A file never has to be rewritten to keep building. If a release changes how something is stored, the package reads the old form and converts it while building, and `grok-digest validate` keeps accepting it.
- The release notes name each new shape and the `SCHEMA_VERSION` that introduced it.
