# x-bookmarks

Your X bookmarks as a searchable page on GitHub Pages, sorted by topic. A Grok bot adds an entry to `data/bookmarks.json` each time you share an X post by email. GitHub Actions then rebuilds and publishes the page. You never edit code.

## Why each person gets their own repository

This repository is a template. Each person who uses it creates their own public copy, and that copy holds two things:

- `data/bookmarks.json`, the list of saved posts.
- The site that GitHub Pages builds from that list.

One repository per person keeps the setup simple. The bot needs write access to one file in one repository. Your bookmarks never mix with anyone else's, and you can delete everything by deleting the repository. Template updates do not reach copies automatically. That is deliberate, because a change to the template cannot break a page that already works.

The copy is public because GitHub Pages is free for public repositories. Free accounts cannot publish Pages from a private repository.

## Set up your copy

1. On this repository's GitHub page, click **Use this template**, then **Create a new repository**.
2. Choose a name, keep the repository **Public**, and click **Create repository**.
3. In the new repository, open **Settings** > **Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. Open the **Actions** tab, select **Deploy to GitHub Pages**, and click **Run workflow**.

When the run finishes, your page is at `https://<your-username>.github.io/<repository-name>/`. The run summary shows the link. Every later push to `main`, including each push from the bot, deploys again.

You do not set the URL anywhere. The workflow asks GitHub Pages for the site's origin and base path and passes them to the build as `SITE_URL` and `BASE_PATH`. A repository named `<your-username>.github.io` or a custom domain works the same way.

If the deploy fails at the `configure-pages` step, Pages is not enabled yet. Do steps 3 and 4, then run the workflow again.

## Remove the sample entries

The template ships three fake entries so the page has something to show. Each one has `(sample)` in its author name. Delete them from `data/bookmarks.json` once real bookmarks arrive. An empty list (`[]`) is valid and shows a short "No bookmarks yet" message.

## The `bookmarks.json` format

`data/bookmarks.json` is the only source of data for the page. It is a JSON array with one object per bookmark:

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

`src/lib/bookmarks.ts` defines this format as a zod schema. `src/lib/topics.ts` defines the topics. Change those two files to change the format or the topic list.

### What happens when an entry is invalid

The build checks the whole file before it renders anything. If the JSON does not parse, or any entry breaks a rule above, the build fails and nothing deploys. The page that was live before stays live. The failed run in the **Actions** tab names the entry and field, for example:

```text
data/bookmarks.json is invalid:
✖ Invalid option: expected one of "ai-agents"|"models-releases"|"dev-tools"|"startups-business"|"japan-tech"|"design"|"other"
  → at [2].topic
```

`[2]` is the entry's position in the file, counting from 0.

## Share a filtered page

The search box and the topic chips are stored in the page address. Copy the address to share that view.

- `?topic=design` shows the Design bookmarks.
- `?q=tokyo` shows bookmarks whose author, post, summary, or key points contain `tokyo`.
- The two combine, as in `?q=tokyo&topic=japan-tech`.

An unknown `topic` is dropped. The page keeps the rest of the address, including a `#b-<id>` link to one card.

## Follow new bookmarks

The site publishes a feed at `rss.xml`. Paste that address into a feed reader, such as NetNewsWire, Feedly, or Reeder. The reader checks the feed and lists bookmarks you have not seen, so you do not have to open the page to notice a new one.

Each topic has a feed at `rss/<topic-id>.xml`. The Design feed is `rss/design.xml`. A feed item links to the card on this page and includes the summary, the key points, and the original post.

The links inside the feed use `SITE_URL`. A local build without `SITE_URL` writes them as `http://localhost:4321`. The GitHub Actions workflow sets `SITE_URL`, so the published feed uses the real address.

On a `github.io/<repository-name>/` site, `robots.txt` is not at the host root, so a feed reader can fetch the feed. On a custom domain, `robots.txt` disallows every path. A reader that honors that file will refuse the feed.

## Privacy

The page is unlisted, not private. Anyone with the link can read it, and the footer says so. Everything in the repository is public too, including the commit history of `data/bookmarks.json`.

The page asks search engines not to index it in two ways:

- Every page has `<meta name="robots" content="noindex,nofollow">`. This is the signal that works on a GitHub Pages project site.
- `public/robots.txt` disallows all crawlers. Crawlers read `robots.txt` only at the root of a host. On `<your-username>.github.io/<repository-name>/` the file is not at the root, so it has no effect there. It does take effect on a custom domain or on a `<your-username>.github.io` repository.

Links to X use `rel="noreferrer"`, and the page sets `<meta name="referrer" content="no-referrer">`, so X does not receive your page's URL when you open a post.

## Develop locally

You need Node.js 22.12 or later and pnpm 10.

```sh
pnpm install
pnpm dev       # start a dev server at http://localhost:4321
pnpm test      # run the unit tests for the schema and search
pnpm check     # type-check, lint, check formatting and duplication, find unused code, run the tests
pnpm format    # format the code with Oxfmt
pnpm build     # build into dist/
pnpm preview   # serve dist/ locally
```

To build with a GitHub Pages project path, set the same variables that the workflow sets:

```sh
SITE_URL=https://<your-username>.github.io BASE_PATH=/<repository-name> pnpm build
BASE_PATH=/<repository-name> pnpm preview
```

## Project layout

The stack is Astro with static output, React islands, TypeScript, Tailwind CSS v4, and shadcn/ui.

| Path                                 | Contents                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `data/bookmarks.json`                | The bookmarks. The bot edits only this file.                                                          |
| `src/lib/bookmarks.ts`               | The zod schema and `parseBookmarks`, which validates the file and sorts it.                           |
| `src/lib/topics.ts`                  | Topic IDs and their labels.                                                                           |
| `src/lib/search.ts`                  | The search and topic filter logic. It has no React or DOM code.                                       |
| `src/lib/filter.ts`                  | Reads and writes the `q` and `topic` parameters in the page address.                                  |
| `src/lib/feed.ts`                    | Builds the RSS feed for the whole list and for one topic.                                             |
| `src/pages/index.astro`              | The page.                                                                                             |
| `src/pages/rss.xml.ts`               | The feed of every bookmark.                                                                           |
| `src/pages/rss/[topic].xml.ts`       | One feed per topic.                                                                                   |
| `src/components/BookmarkCard.astro`  | One bookmark card. Rendered to static HTML at build time.                                             |
| `src/components/BookmarkFilters.tsx` | The search box and topic chips. A React island that hides and shows the static cards.                 |
| `src/components/ThemeToggle.tsx`     | The light and dark toggle. A React island.                                                            |
| `src/layouts/Layout.astro`           | The HTML shell, the robots meta tag, and the script that applies the theme before first paint.        |
| `src/components/ui/`                 | shadcn/ui components. Add more with `pnpm dlx shadcn@latest add <component>`, then run `pnpm format`. |
| `.github/workflows/deploy.yml`       | Runs `pnpm check`, builds, and deploys to GitHub Pages on every push to `main`.                       |

The page follows the system color scheme. The toggle stores an override in `localStorage`. If you toggle back to the system's scheme, the override is removed and the page follows the system again.

## Mark this repository as a template

The **Use this template** button appears only after the owner turns it on. In this repository, open **Settings** > **General** and select **Template repository**.
