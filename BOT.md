# Grok Digest: the bot's manual

You keep a Grok Digest site. Its owner shares X posts with you. You turn each post into one entry in `data/bookmarks.json` and push it to `main`. GitHub Actions then rebuilds the page, where the owner reads the summaries and comes back to old bookmarks in a daily review.

The owner saves posts to read them later and then forgets them. Everything you write exists to make a post worth coming back to: a headline that says what it's about, a summary, the key points, and one thing to try.

This file ships with the `grok-digest` package. After `bun install`, the copy at `node_modules/grok-digest/BOT.md` matches the version the site builds with, so read that copy when this one and the installed one differ.

## The site repository

| Path                           | What it is                                                                | You                     |
| ------------------------------ | ------------------------------------------------------------------------- | ----------------------- |
| `data/bookmarks.json`          | The bookmarks, one object per post.                                       | Add, edit, remove       |
| `data/processed.json`          | Ids of the shares you have handled, such as email message ids.            | Add one id per share    |
| `data/removed.json`            | Status ids of bookmarks the owner asked you to remove.                    | Add an id when removing |
| `package.json`, `bun.lock`     | Depend on `grok-digest`. Every deploy takes the newest release by itself. | Never commit changes    |
| `.github/workflows/deploy.yml` | Validates the data, builds the page, and publishes it to GitHub Pages.    | Never change            |

`processed.json` and `removed.json` are JSON arrays of non-empty strings. The page reads only `bookmarks.json`.

## Set up a checkout

```sh
bun install
bun update grok-digest
bun run validate
```

`bun update grok-digest` gives you the release the next deploy will use. It changes `bun.lock`; leave that change out of your commits.

## Save a shared post

1. If the share's id is already in `data/processed.json`, stop. You have handled it.
2. Find the post's status id: the number at the end of its URL.
3. If that id is in `data/removed.json`, the owner removed it. Do not add it again; add the share's id to `processed.json` and stop.
4. If that id is already in `data/bookmarks.json`, do not add a second entry. Add the share's id to `processed.json` and stop.
5. Read the post. If the author continues it as a thread (it says 🧵 or "1/", or the author replies to themselves to go on), read the whole thread. Follow every link in it to the page it really lands on.
6. Write the entry described below and append it to the array in `data/bookmarks.json`.
7. Add the share's id to `data/processed.json`.
8. If any entry's author name contains `(sample)`, delete those entries. They are the template's placeholders.
9. Run `bun run validate` and fix the entry until it passes.
10. Commit with the message `Save bookmark (@handle)`, using the post author's handle, and push to `main`.

## The entry

```json
{
  "id": "2110149626133438732",
  "url": "https://x.com/poteto/status/2110149626133438732",
  "author": { "name": "lauren", "handle": "poteto" },
  "posted_at": "2026-10-13T23:24:10.000Z",
  "saved_at": "2026-10-15T11:21:40+09:00",
  "topic": "ai-agents",
  "shelf_life": "evergreen",
  "tldr": "Stale workaround comments spread because coding agents copy them",
  "summary": "Argues you should delete most code comments, because coding agents copy existing workaround comments and spread hacks through the codebase.",
  "text": "ban and delete most if not all code comments!\n\nagents love copying what already exists. https://t.co/Xq7mPLe0Ab",
  "key_points": [
    "Agents imitate existing code, so stale workaround comments spread like weeds.",
    "Keep only comments that must exist, such as browser-quirk explanations."
  ],
  "action": "Have an agent run /no-comments on one repo and sort each comment into refactor or delete.",
  "links": [{ "title": "pstack: the /no-comments skill", "url": "https://github.com/example/pstack" }],
  "media": [
    {
      "url": "https://pbs.twimg.com/media/G3xAmPLeAAAbCdE.jpg",
      "alt": "A diff that deletes a workaround comment",
      "link": "https://t.co/Xq7mPLe0Ab"
    }
  ]
}
```

Write every field, in this order. The build rejects an entry with a missing field or a field not listed here. `text` and `action` may be empty strings, and `key_points`, `links`, and `media` may be empty arrays. Entries saved before `media` existed have no `media` field; that is valid, and you don't need to add one.

### id

The post's status id as a string, the number at the end of its URL. It must be unique in the file.

### url

The post's `https` link on `x.com` or `twitter.com`. A `www.` or `mobile.` prefix is allowed.

### author

`name` is the display name. `handle` is the X handle without `@`: 1 to 15 letters, digits, or underscores.

### posted_at

When the author published the post, not when you received it. Write a date and time with an offset, such as `2026-10-13T23:24:10.000Z`. A date alone, such as `2026-10-13`, is also accepted.

If you can't read the time from the post, work it out from the status id: milliseconds since the Unix epoch = (id >> 22) + 1288834974657.

### saved_at

When you received the share: the current date and time as you handle it. Write it once and never change it, even when you edit the entry later.

It must be a date and time with an offset, such as `2026-10-15T11:21:40+09:00`, or UTC with `Z`. A date alone is rejected. Use the owner's local offset when you know it. The daily review counts days in the owner's time zone, so the right offset keeps "Saved yesterday" true around midnight.

### topic

One of these ids:

| Topic id            | Label on the page   |
| ------------------- | ------------------- |
| `ai-agents`         | AI agents           |
| `models-releases`   | Models & releases   |
| `dev-tools`         | Dev tools           |
| `startups-business` | Startups & business |
| `japan-tech`        | Japan tech          |
| `design`            | Design              |
| `other`             | Other               |

### shelf_life

`news` when the post's value fades within weeks: launches, releases, announcements, funding, events, outages, drama. `evergreen` when it stays useful: ideas, techniques, how-tos, prompts, tools worth adopting later, essays. If a launch post also teaches how to use the thing, choose `evergreen`.

The daily review brings `news` back only the day after it was saved and a week later. `evergreen` comes back a day, a week, a month, and three months later, and on the same date in later years.

### tldr

A headline of at most 12 words that says what the reader gets from the post. It is the card's title and the feed item's title.

- Say the concrete thing: "Bun 1.4 ships a built-in Postgres client", not "Interesting news about Bun".
- Plain text: no emoji, hashtags, @handles, quotes, or final period.
- Don't start with the author's name; the card shows it.
- Use the language of `summary`. Don't repeat `summary` or its first sentence.

### summary

One or two sentences on what the post says and why it matters. For a thread, summarize the whole thread.

### text

The post's own words, copied exactly as posted, with its line breaks. For a thread, the author's posts in order, separated by a blank line. Keep a `t.co` line that stands for an image or video as it is; the image itself goes in `media`. Write `""` when the post has no text.

Keep it complete. Most AI assistants can't open x.com, so when the owner copies a bookmark into one, this text is all it gets of the post.

### key_points

The takeaways, one short sentence each, usually two to four. Say what the post teaches, not what it covers: "Agents imitate existing code, so stale comments spread", not "The thread explains how comments spread". Write `[]` when there is nothing beyond the summary.

### action

One sentence on the most useful thing the owner could do because of the post: a command to run, a tool or prompt to try, a setting to change. It shows under the card's title even when the card is collapsed.

- Start with a verb, and be specific enough to do without opening the post.
- When the post includes a prompt, command, or snippet, base the action on it.
- At most about 25 words, in the language of `summary`.
- Write `""` when there is honestly nothing to do, such as news, an opinion, or a joke. Never invent busywork.

### links

Every link in the post and its thread, followed to where it really lands. Expand `t.co` links.

- `url`: the final `https` address without tracking parameters such as `utm_*`. Skip links that are not `https`.
- `title`: the page's own title, cut to about 8 words, or a plain description such as `GitHub repo: example/pstack`.
- Leave out links to the post itself, to the author's profile, and to the post's images or videos.
- Write `[]` when there are none.

### media

The images in the post and its thread, in thread order, so the card can show each one with the post it came from. One object per photo:

- `url`: the image's `https://pbs.twimg.com/` address, such as `https://pbs.twimg.com/media/G3xAmPLeAAAbCdE.jpg`. A `?format=jpg&name=large` query is fine. Never a `t.co` link or an `x.com/…/photo/1` page; the build rejects any other host.
- `alt`: the author's alt text for the image when it has one, otherwise a few words on what it shows. Leave `alt` out rather than writing `""`.
- `link`: the short link that stands for the image in `text`, copied exactly as it appears there, such as `https://t.co/Xq7mPLe0Ab` or `pic.x.com/Xq7mPLe0Ab`. X gives all the photos of one post a single link, so photos from the same post share it. The card shows the images where that link is and hides the link. The build rejects a `link` that is not in `text`. Leave `link` out only when `text` has no link for the image; the card then shows it after the post.
- For a video or GIF, add its poster image (the `pbs.twimg.com` thumbnail X shows before it plays) when you can find it. Skip it otherwise.
- Don't add link-preview cards or the author's profile picture.
- Write `[]` when the post has no images.

Images never go in `links`, and `text` keeps the post's exact words, including any `t.co` lines that stood for the images.

## Change or remove a bookmark

To change one, edit its fields in place. Keep `id` and `saved_at`. Commit with `Update bookmark (@handle)`.

To remove one, delete its entry from `data/bookmarks.json` and add its id to `data/removed.json`, so a later share of the same post doesn't bring it back. Commit with `Remove bookmark (@handle)`.

Run `bun run validate` before every commit.

## When validation fails

`bun run validate` names the file, the problem, and where it is:

```text
data/bookmarks.json is invalid:
✖ Invalid option: expected one of "news"|"evergreen"
  → at [3].shelf_life
```

`[3]` is the entry's position in the array, counting from 0. Fix the field and run it again. A deploy with invalid data fails, and the page that was live stays live, so never push data that fails validation.

## A daily digest (optional routine)

If the owner wants a nudge to come back, run this every morning:

1. Read `data/bookmarks.json` from the site repository.
2. Using today's date in the owner's time zone, pick up to 3 bookmarks: first any `evergreen` bookmark saved exactly 1, 7, 30 or 90 days ago or on today's date in an earlier year, and any `news` bookmark saved 1 or 7 days ago; then fill the rest with bookmarks saved at least a day ago that you have not sent in the last 14 days. Skip anything saved today. Send nothing if nothing qualifies.
3. For each, send the `tldr`, why it is back ("Saved a week ago"), the `action` as "Try: …" when it is not empty, and a link to `<site>/#b-<id>`.
4. End with a link to `<site>/?view=today`, where `<site>` is the page's address.
