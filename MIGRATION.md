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
cp ../grok-digest/template/package.json ../grok-digest/template/astro.config.mjs ../grok-digest/template/.gitignore .
cp ../grok-digest/template/README.md .
mkdir -p .github/workflows
cp ../grok-digest/template/.github/workflows/deploy.yml .github/workflows/deploy.yml
cp ../grok-digest/template/.github/dependabot.yml .github/dependabot.yml
```

In `package.json`, set `grok-digest` to the version that was published, with a caret, for example `"grok-digest": "^0.1.0"`. The caret accepts later patch releases (and later 0.1.x releases) and refuses the next minor, which is where a schema change will land. Then install and check the data against schema version 1:

```sh
pnpm install
pnpm validate
SITE_URL=https://<your-username>.github.io BASE_PATH=/<repository-name> pnpm build
```

`pnpm validate` prints one line per file, such as `✓ data/bookmarks.json: 2 bookmarks`. A file that does not match schema version 1 fails the command and names the entry and the field. Do not rewrite a file to get past that: the published package would be rejecting a version 1 file, which is a bug.

Commit the new files, including `pnpm-lock.yaml`, and push to `main`. The deploy workflow validates the data, builds with the `SITE_URL` and `BASE_PATH` that GitHub Pages reports, and publishes the same project site as before. Pages stays on **GitHub Actions** as its source.

## Receiving later package versions

Dependabot reads `.github/dependabot.yml` and opens a pull request when a new `grok-digest` version is published. Merging that request and the lockfile update is the whole site update. The workflow deploys on the merge.

Two other ways to take updates:

- Renovate, if the GitHub account already runs it. Point it at this repository the same way Dependabot is pointed at npm. Delete `.github/dependabot.yml` in that case so the two bots do not open duplicate pull requests.
- Pin the dependency to the dist-tag `latest` (`"grok-digest": "latest"`). pnpm still installs the version recorded in `pnpm-lock.yaml` until you refresh it with `pnpm update grok-digest` and commit the lockfile. A frozen install in GitHub Actions will not float on its own. Dependabot is the path that opens the pull request for you; `latest` is the path where you choose when to refresh.

While the package is 0.x, `"grok-digest": "^0.1.0"` does not install `0.2.0`. A pull request that changes the range across a minor boundary is a schema boundary. Read the changelog before merging it.

## Schema version policy

`grok-digest/schema` exports `SCHEMA_VERSION`. It is a number, currently `1`. The JSON files do not contain a version field, so a file written before this package existed is version 1 when it matches the rules below.

Version 1 files:

| File                  | Shape                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/bookmarks.json` | A JSON array of bookmark objects. Fields, types, and topic ids are the table in the root README. Every field is required. `text` may be `""`. `key_points` may be `[]`. |
| `data/processed.json` | A JSON array of non-empty strings. The bot records ids it has handled. The site does not read this file.                                                                |
| `data/removed.json`   | The same shape as `processed.json`, for ids the bot has removed. The site does not read this file.                                                                      |

`posted_at` may be a date (`2026-01-15`) or a datetime with an offset (`2026-10-13T23:24:10.000Z`). Both are version 1.

Policy:

- A release that still exports `SCHEMA_VERSION` 1 accepts every existing version 1 file unchanged. Take it from the Dependabot pull request.
- `SCHEMA_VERSION` increases only when a file that was valid would then be rejected or read differently. That release is breaking. Until 1.0.0, the minor version is the breaking slot (`0.1.0` to `0.2.0`). From 1.0.0, the major version is the breaking slot. The starter range does not include that release until a pull request edits `package.json`.
- The changelog of that release is the migration: which file changes, and the exact rewrite. Version 1 has no rewrite. Do one only when a release tells you to, and do it in the same commit as the version bump so a half-migrated file is never what `main` builds.
