# Grok Digest site

This repository is one person's Grok Digest site. The page, the feeds, and the schema come from the [`grok-digest`](https://github.com/kenryu42/grok-digest) package. This repository holds the data and the workflow that publishes the page to GitHub Pages.

`data/bookmarks.json` is the list of saved posts. A Grok bot appends an entry when you share an X post by email. GitHub Actions then rebuilds and publishes the page.

## Set up

1. Create a public repository and copy the files from the `template/` directory of [kenryu42/grok-digest](https://github.com/kenryu42/grok-digest) into it. Copy `template/data` only when the repository does not already have data files.
2. Open **Settings** > **Pages**. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Install dependencies and commit the lockfile:

   ```sh
   pnpm install
   git add pnpm-lock.yaml
   git commit -m "Install grok-digest"
   git push
   ```

4. Open the **Actions** tab, select **Deploy to GitHub Pages**, and click **Run workflow** if the push did not start a run.

When the run finishes, the page is at `https://<your-username>.github.io/<repository-name>/`. The run summary shows the link. Later pushes to `main`, including each push from the bot, deploy again.

You do not set the URL in the repository. The workflow asks GitHub Pages for the site's origin and base path and passes them to the build as `SITE_URL` and `BASE_PATH`. A repository named `<your-username>.github.io` or a custom domain works the same way.

If the deploy fails at the `configure-pages` step, Pages is not enabled yet. Do step 2, then run the workflow again.

`grok-digest` has to be on npm before `pnpm install` can succeed. The package repository's README lists the publishing steps.

## Updates

`.github/dependabot.yml` asks Dependabot to open a pull request when a new `grok-digest` is published. Merge it to update the site. The dependency range is `^0.1.0`, so a pull request that stays inside `0.1.x` is a schema version 1 release and needs no data changes. A pull request that raises the minor version is a new schema version. Read that release's changelog, and follow the migration it describes, before merging.

Renovate does the same job if you already run it. Remove `.github/dependabot.yml` so the two do not open two pull requests.

Pinning the dependency to the dist-tag `latest` (`"grok-digest": "latest"`) is the alternative with no bot. pnpm keeps the version in `pnpm-lock.yaml` until you run `pnpm update grok-digest` and commit the lockfile. The GitHub Actions install is frozen, so it does not move to a newer release on its own.

## Data files

The page reads `data/bookmarks.json` only. `data/processed.json` and `data/removed.json` are arrays of id strings for the bot. `pnpm validate` checks whichever of the three are present, against schema version 1.

`data/bookmarks.json` is a JSON array with one object per bookmark:

```json
[
  {
    "id": "1000000000000000001",
    "url": "https://x.com/example_agents/status/1000000000000000001",
    "author": { "name": "Example Agent Lab", "handle": "example_agents" },
    "posted_at": "2026-01-15",
    "topic": "ai-agents",
    "summary": "One or two sentences about the post.",
    "text": "The post's own words, copied as posted.",
    "key_points": ["A takeaway.", "Another takeaway."]
  }
]
```

Every field is required. `text` may be an empty string, and `key_points` may be an empty array. The build rejects fields that are not in this table.

| Field           | Type             | Rules                                                                                                                     |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `id`            | string           | Unique in the file. Use the post's status ID, the number at the end of its URL.                                           |
| `url`           | string           | An `https` link on `x.com` or `twitter.com`. A `www.` or `mobile.` prefix is allowed.                                     |
| `author.name`   | string           | The display name. Must not be empty.                                                                                      |
| `author.handle` | string           | 1 to 15 letters, digits, or underscores. A leading `@` is allowed and removed.                                            |
| `posted_at`     | string           | A date such as `2026-01-15`, or a date and time with an offset such as `2026-01-15T09:30:00+09:00`.                       |
| `topic`         | string           | One of the topic IDs below.                                                                                               |
| `summary`       | string           | Must not be empty.                                                                                                        |
| `text`          | string           | The post's own words. May be empty when the post has no text. The card shows it under the summary, and search matches it. |
| `key_points`    | array of strings | Can be empty. Each string must not be empty.                                                                              |

The page sorts bookmarks newest first by `posted_at`, so the order in the file does not matter.

| Topic ID            | Label on the page   |
| ------------------- | ------------------- |
| `ai-agents`         | AI agents           |
| `models-releases`   | Models & releases   |
| `dev-tools`         | Dev tools           |
| `startups-business` | Startups & business |
| `japan-tech`        | Japan tech          |
| `design`            | Design              |
| `other`             | Other               |

The template ships three fake entries so the page has something to show. Each one has `(sample)` in its author name. Delete them from `data/bookmarks.json` once real bookmarks arrive. An empty list (`[]`) is valid and shows a short "No bookmarks yet" message.

When a file is invalid, `pnpm validate` and the build fail and nothing deploys. The page that was live stays live. The failed run names the entry and the field:

```text
data/bookmarks.json is invalid:
✖ Invalid option: expected one of "ai-agents"|"models-releases"|"dev-tools"|"startups-business"|"japan-tech"|"design"|"other"
  → at [2].topic
```

`[2]` is the entry's position in the file, counting from 0.

Schema version 1 has no migration. The rules for a future version are in [MIGRATION.md](https://github.com/kenryu42/grok-digest/blob/main/MIGRATION.md) in the package repository.

## The page

The search box and the topic chips are stored in the page address.

- `?topic=design` shows the Design bookmarks.
- `?q=tokyo` shows bookmarks whose author, post, summary, or key points contain `tokyo`.
- The two combine, as in `?q=tokyo&topic=japan-tech`.

An unknown `topic` is dropped. The page keeps the rest of the address, including a `#b-<id>` link to one card.

The feed is at `rss.xml`. Each topic has a feed at `rss/<topic-id>.xml`, for example `rss/design.xml`. A feed item links to the card on this page and includes the summary, the key points, and the original post.

On a `github.io/<repository-name>/` site, `robots.txt` is not at the host root, so a feed reader can fetch the feed. On a custom domain, `robots.txt` disallows every path. A reader that honors that file will refuse the feed.

The page is unlisted, not private. Anyone with the link can read it. The repository is public too, including the commit history of `data/bookmarks.json`.

Every page has `<meta name="robots" content="noindex,nofollow">`. `robots.txt` disallows all crawlers, and it takes effect on a custom domain or a `<your-username>.github.io` repository, where it is at the host root. Links to X use `rel="noreferrer"`, and the page sets `<meta name="referrer" content="no-referrer">`.

The footer reads "Unofficial. Summaries created with Grok."

## Develop locally

You need Node.js 22.12 or later and pnpm 10.

```sh
pnpm install
pnpm validate  # check data/*.json against schema version 1
pnpm dev       # http://localhost:4321
pnpm build
pnpm preview
```

To build with a GitHub Pages project path:

```sh
SITE_URL=https://<your-username>.github.io BASE_PATH=/<repository-name> pnpm build
BASE_PATH=/<repository-name> pnpm preview
```
