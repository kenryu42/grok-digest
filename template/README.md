# Grok Digest site

This repository is one person's Grok Digest site. The page, the feeds, and the schema come from the [`grok-digest`](https://github.com/kenryu42/grok-digest) package. This repository holds the data and the workflow that publishes the page to GitHub Pages.

`data/bookmarks.json` is the list of saved posts. A Grok bot appends an entry when you share an X post by email. GitHub Actions then rebuilds and publishes the page.

## Set up

1. Create a public repository and copy the files from the `template/` directory of [kenryu42/grok-digest](https://github.com/kenryu42/grok-digest) into it. Copy `template/data` only when the repository does not already have data files.
2. Open **Settings** > **Pages**. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Install dependencies with [Bun](https://bun.sh) and commit the lockfile:

   ```sh
   bun install
   git add bun.lock
   git commit -m "Install grok-digest"
   git push
   ```

4. Open the **Actions** tab, select **Deploy to GitHub Pages**, and click **Run workflow** if the push did not start a run.

When the run finishes, the page is at `https://<your-username>.github.io/<repository-name>/`. The run summary shows the link. Later pushes to `main`, including each push from the bot, deploy again.

You do not set the URL in the repository. The workflow asks GitHub Pages for the site's origin and base path and passes them to the build as `SITE_URL` and `BASE_PATH`. A repository named `<your-username>.github.io` or a custom domain works the same way.

If the deploy fails at the `configure-pages` step, Pages is not enabled yet. Do step 2, then run the workflow again.

## Updates

Each deploy builds with the newest `grok-digest`. `package.json` asks for `"latest"`, and the workflow runs `bun update grok-digest` before it builds, so a new release shows up the next time the bot pushes a bookmark. Nothing is committed back to the repository.

To stay on one version, set `"grok-digest"` in `package.json` to that exact version, such as `"0.1.3"`, then run `bun install` and commit `package.json` and `bun.lock`. Set it back to `"latest"` the same way to follow releases again.

## Change the page

Ask the Grok bot. It changes the page from a `custom/` folder in this repository: settings such as the title, the view the page opens on, and how many bookmarks Today brings back go in `custom/config.json`, colors and fonts in `custom/theme.css`, and a reworked header, footer, card, part of the controls, or part of swipe mode in `custom/components/`. Everything else keeps updating with each release, and the bot carries new releases into the parts it changed. Delete `custom/` to go back to the page as released.

## Data files

The page reads `data/bookmarks.json` only. `data/processed.json` and `data/removed.json` are arrays of id strings for the bot. `bun run validate` checks whichever of the three are present, against schema version 1.

`data/bookmarks.json` is a JSON array with one object per bookmark. The bot's manual, [`BOT.md`](https://github.com/kenryu42/grok-digest/blob/main/BOT.md), lists every field with an example entry and the rules for each, and says how to save, change, and remove a bookmark. After `bun install`, the copy at `node_modules/grok-digest/BOT.md` matches the version this site builds with. Point a new Grok Bot at that file.

The page sorts bookmarks by `saved_at`, most recently saved first, so the order in the file does not matter. A card shows the post date next to the save date when they differ, and shows the post's images from `media` inside the original post, each where its short link was. Each of `links` shows as a card you can click, with X's copy of its preview `image` above its title when it has one.

The template ships three fake entries so the page has something to show. Each one has `(sample)` in its author name. Delete them from `data/bookmarks.json` once real bookmarks arrive. An empty list (`[]`) is valid and shows a short "No bookmarks yet" message.

When a file is invalid, `bun run validate` and the build fail and nothing deploys. The page that was live stays live. The failed run names the entry and the field:

```text
data/bookmarks.json is invalid:
✖ Invalid option: expected one of "ai-agents"|"models-releases"|"dev-tools"|"startups-business"|"japan-tech"|"design"|"other"
  → at [2].topic
```

`[2]` is the entry's position in the file, counting from 0.

Every later release reads version 1 files unchanged. The policy is in [MIGRATION.md](https://github.com/kenryu42/grok-digest/blob/main/MIGRATION.md) in the package repository.

## The page

The page opens on **Today**: up to five bookmarks to look at again. It brings back bookmarks saved yesterday, a week ago, a month ago, three months ago, and on today's date in earlier years, then fills the rest from older bookmarks you have not marked done. A `news` bookmark comes back only the day after it was saved and a week later, and never fills a free slot. The five stay the same all day. When there is nothing to review, the page opens on **Inbox** instead.

Each card has a **Done** button. **Inbox** lists what is not done, **Done** what is, and **All** everything. A search looks through every bookmark, whichever view is open. Done marks, today's five, and **Collapse all** are kept in your browser, so another browser or device starts fresh.

The **Aa** button next to the dark mode button sets the size of the text on the cards and in swipe mode: Small, Default, Large, or Larger. The search box, the views, and the other controls keep their size. Your choice is kept in your browser.

On a phone, use **Add to Home Screen** to open the page like an app.

**Copy** puts the bookmark on the clipboard as Markdown for any AI assistant: the tldr, the author and post date, the X link, the original post and its image addresses, the summary, the key points, the action, and the links. Paste it and add your question.

On a keyboard, `j` and `k` move between cards, `Enter` opens or closes one, `e` marks it done, `c` copies it, `o` opens it on X, and `/` jumps to the search box.

The view, the search box, and the topic chips are stored in the page address.

- `?view=inbox`, `?view=done`, and `?view=all` open those views. Without `view`, the page opens on Today, or on Inbox when Today is empty. `?view=today` always opens Today.
- `?topic=design` shows the Design bookmarks.
- `?q=tokyo` shows bookmarks whose author, tldr, post, summary, key points, action, or link titles contain `tokyo`.
- The two combine, as in `?q=tokyo&topic=japan-tech`.

An unknown `topic` or `view` is dropped. The page keeps the rest of the address, including a `#b-<id>` link to one card. That link opens the All view so the card shows even when it is done.

The feed is at `rss.xml`. Each topic has a feed at `rss/<topic-id>.xml`, for example `rss/design.xml`. A feed item is titled with the tldr, dated when the bookmark was saved, links to the card on this page, and includes the summary, the action, the key points, the links with their preview images, the original post, and its images.

On a `github.io/<repository-name>/` site, `robots.txt` is not at the host root, so a feed reader can fetch the feed. On a custom domain, `robots.txt` disallows every path. A reader that honors that file will refuse the feed.

The page is unlisted, not private. Anyone with the link can read it. The repository is public too, including the commit history of `data/bookmarks.json`.

Every page has `<meta name="robots" content="noindex,nofollow">`. `robots.txt` disallows all crawlers, and it takes effect on a custom domain or a `<your-username>.github.io` repository, where it is at the host root. Links to X use `rel="noreferrer"`, and the page sets `<meta name="referrer" content="no-referrer">`.

The footer reads "Unofficial. Summaries created with Grok."

## Develop locally

You need Bun 1.4 and Node.js 22.12 or later.

```sh
bun install
bun run validate  # check data/*.json
bun run dev       # http://localhost:4321
bun run build
bun run preview
```

To build with a GitHub Pages project path:

```sh
SITE_URL=https://<your-username>.github.io BASE_PATH=/<repository-name> bun run build
BASE_PATH=/<repository-name> bun run preview
```
