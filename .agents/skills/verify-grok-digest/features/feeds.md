# RSS feeds

A reader can follow new bookmarks in a feed reader: one feed for everything at `/rss.xml` and one per topic at `/rss/<topic>.xml`. The page footer links to the main feed and to the Design feed, and the page head advertises the main feed.

## Sub-features

- `feed-all` lists every bookmark, newest saved first.
- `feed-topic` lists only one topic's bookmarks, for each of the 7 topics.
- `feed-discovery` puts `<link rel="alternate" type="application/rss+xml">` in the page head and two feed links in the footer.

## How to get to it (user POV)

- Follow `Follow new bookmarks` or `Design` in the page footer.
- Add the page's address to a feed reader, which finds the advertised feed.
- Fetch `/rss.xml` or `/rss/ai-agents.xml`, `/rss/models-releases.xml`, `/rss/dev-tools.xml`, `/rss/startups-business.xml`, `/rss/japan-tech.xml`, `/rss/design.xml` or `/rss/other.xml`.

## Driving it with verify.mjs

Preconditions:

- A healthy run. `URL` is the address `launch` printed (also `jq -r .url "$RUN/state.json"`).

- **All feed.** Run `curl -s "$URL/rss.xml" -o "$RUN/evidence/feeds-all.xml"` and count with `grep -o "<item>" "$RUN/evidence/feeds-all.xml" | wc -l`. It prints `15`. The feed is one line, so `grep -c` would print 1.
- **Topic feed.** Run `curl -s "$URL/rss/design.xml" -o "$RUN/evidence/feeds-design.xml"`. It has 3 `<item>` entries. Each item's `<link>` points back to the page at that card's anchor, `/#b-<id>`, for the Design bookmarks `…105`, `…112` and `…200`.
- **Discovery.** Run `$V open "$RUN" "/" --fresh`, then `$V eval "$RUN" '[...document.querySelectorAll("link[rel=alternate], footer a")].map((e) => e.getAttribute("href"))'`. It lists `/rss.xml` twice (head and footer) and `/rss/design.xml`.
- **Footer path.** Run `$V click "$RUN" --name "Follow new bookmarks"`, then `$V eval "$RUN" 'location.pathname'`. It prints `"/rss.xml"`. On the first request the dev server compiles the feed on demand, so if it still prints `"/"`, run the `eval` again after a second.
- **Item link lands on the card.** Open an item's link on a phone: `$V open "$RUN" "/#b-1000000000000000200" --viewport mobile --fresh`. The card is expanded and starts below the pinned bar (see [Read a card](./read-a-card.md), `card-linked`).

## Gotchas

- Feed links are absolute only when `SITE_URL` is set. In a plain dev run they fall back to the dev origin, so don't assert on the host.
- `curl` needs the exact port from `launch`, which is not always 4321.
- `click` waits for the page to settle and then reports the URL. An XML response has no status line, so `status` is `null` there.
