# Read a card

Each card shows who posted, when it was saved, Grok's one-line takeaway and an optional `Try:` action. Expanded, it adds the summary, key points, links from the post and the original post with its images in place. The card's buttons copy it for an AI assistant or open the post on X. Phones start with cards collapsed. Desktop starts expanded.

## Sub-features

- `card-toggle` expands or collapses one card by tapping its header.
- `card-toggle-all` expands or collapses every card with `Expand all` or `Collapse all`, and remembers the choice.
- `card-phone-default` collapses cards on a first visit at phone width and expands them at desktop width.
- `card-post-images` shows each image under the post text it belongs to. A single image is uncropped; several images form a cropped grid.
- `card-copy` copies a Markdown version of the card and shows `Copied`.
- `card-open` opens the post on X in a new tab.
- `card-linked` opens the card named in a `#b-<id>` link, switches to `All`, and scrolls to it.
- `card-dates` shows the saved date in the header. On phones the posted date moves inside the expanded card.

## How to get to it (user POV)

- Tap a card's header (the title area) to toggle it.
- Tap `Expand all` or `Collapse all` next to the count.
- Tap `Copy` or `Open on X` at the bottom of a card. On desktop, `c` and `o` act on the focused card.
- Open a link ending in `#b-<bookmark id>`.

## Driving it with verify.mjs

Preconditions:

- A healthy run with the default fixture.

- **Phone default.** Run `$V open "$RUN" "/?view=all" --viewport mobile --fresh`, then `$V eval "$RUN" '[...document.querySelectorAll("[data-bookmark-id] details")].filter((d) => d.open).length'`. It prints `0`, and the button reads `Expand all`.
- **Desktop default.** Run `$V open "$RUN" "/?view=all" --viewport desktop --fresh`. The same expression prints `15`, and the button reads `Collapse all`.
- **Toggle one.** At mobile, run `$V click "$RUN" --card 0 --selector summary`. That card's `details` is open (`$V eval "$RUN" 'document.querySelector("[data-bookmark-id] details").open'` prints `true`). Take `$V screenshot "$RUN" read-card-expanded`.
- **Toggle all and remember.** Run `$V click "$RUN" --name "Expand all"`, then `$V open "$RUN" "/?view=all"` without `--fresh`. All 15 are open, and `localStorage.getItem("grok-digest:/:cards-collapsed")` is `"false"`.
- **Thread images.** Run `$V eval "$RUN" '[...document.querySelector("#b-1000000000000000200 blockquote").children].map((c) => c.tagName + ":" + (c.querySelectorAll("img").length || c.textContent.trim().slice(0, 30)))'`. The order is text, an image list with 2 images, text, an image list with 1 image, matching the thread's posts. The single image has the class `object-contain`, and grid images have `object-cover`.
- **Copy.** Run `$V click "$RUN" --card 0 --name Copy`. The button label becomes `Copied`, and `$V eval "$RUN" '(await navigator.clipboard.readText()).split("\n")[0]'` prints `"A post I saved from X:"`.
- **Open on X.** Run `$V eval "$RUN" '[...document.querySelectorAll("[data-bookmark-id] a")].find((a) => a.textContent.includes("Open on X")).href'`. It is the bookmark's `https://x.com/…/status/<id>` with `target="_blank"`. Don't click it in proof runs, because it leaves for x.com.
- **Linked card.** Run `$V open "$RUN" "/?view=inbox#b-1000000000000000200" --viewport mobile --fresh`. The URL switches to `?view=all`, the `All` view is pressed, and that card's `details` is open. The card starts below the pinned bar, not under it: `$V eval "$RUN" '({bar: document.querySelector("fieldset[aria-label=\"Filter by topic\"]").parentElement.getBoundingClientRect().bottom, card: document.querySelector("#b-1000000000000000200").getBoundingClientRect().top})'` prints `card` greater than `bar` (about 125 against 113). Take `$V screenshot "$RUN" read-card-linked-mobile`.
- **Phone dates.** For the first card, the header shows only `Oct 15, 2026`, and the expanded body shows `Posted Oct 14, 2026`. Card dates are formatted in UTC, so they don't change with the machine's time zone.

## Gotchas

- Fixture images are made-up `pbs.twimg.com` addresses and render broken. Check order and classes, not pixels.
- `Expand all` and `Collapse all` change every card, including hidden ones, and the choice is stored. Use `--fresh` to see the defaults again.
- Tapping the `Try:` box toggles the card too, because it is part of the header.
- Clipboard reads work because `open` grants clipboard access to the page's origin. A real browser asks the reader.
