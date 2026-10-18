# Read a card

Each card in the list shows who posted, when it was saved and Grok's one-line takeaway, and nothing else, on every screen size. Tapping a card's header opens that one card in full: the summary, the key points, the `Try:` action, the post's links as clickable cards (with X's preview image when the link has one that loads and a link icon otherwise), the original post with its images in place, and the card's buttons. Tapping again closes it to its headline. Opening and closing morph the card into place without overshooting and keep it in view. A closing card keeps its text in place while it shrinks, so its height only ever goes down.

## Sub-features

- `card-headline` shows every card as its headline on load, at phone and desktop width.
- `card-toggle` opens one card in full by tapping its header, and closes it to its headline on a second tap. Other cards stay closed.
- `card-post-images` shows each image under the post text it belongs to. A single image is uncropped; several images form a cropped grid.
- `card-copy` copies a Markdown version of the card and shows `Copied`.
- `card-open` opens the post on X in a new tab.
- `card-linked` opens the card named in a `#b-<id>` link in full and scrolls to it. When the card is done it turns on `Done`, so it always shows.
- `card-dates` shows the saved date in the header. On phones the posted date moves to the bottom of the opened card.

## How to get to it (user POV)

- Tap a card's header (author line and title) to open or close it. On desktop, focus the title with `j` or `k` and press Enter.
- Tap `Copy` or `Open on X` at the bottom of an opened card. On desktop, `c` and `o` act on the focused card.
- Open a link ending in `#b-<bookmark id>`.

## Driving it with verify.mjs

Preconditions:

- A healthy run with the default fixture.

- **Headlines on load.** Run `$V open "$RUN" / --viewport mobile --fresh`, then `$V eval "$RUN" '[...new Set([...document.querySelectorAll("[data-bookmark-id]")].map((c) => c.dataset.depth))]'`. It prints `["headline"]`. The first card's summary, points and buttons are hidden (`checkVisibility()` is false on each `[data-level]`). At `--viewport desktop --fresh` it prints `["headline"]` too.
- **Open one card.** Run `$V click "$RUN" --card 0 --selector h2`. That card's `data-depth` is `full`, its title button has `aria-expanded="true"`, the summary, points and buttons show, and the other cards stay at `headline`. Run `$V screenshot "$RUN" read-card-open` after about half a second, once the morph settles. Run the click again: the card goes back to `headline`. To check the motion, start a `requestAnimationFrame` loop with `eval` that records the card's height and whether its `[data-read-point]` items are visible, then tap again: on opening, the height only rises to its final value. On closing it only falls, the points stay visible until the last frame, and `data-depth` reads `headline` only once the card has settled.
- **Keyboard (desktop).** At desktop, `$V key "$RUN" j` focuses the first card's title, then `$V key "$RUN" Enter` opens it in full.
- **Thread images.** Run `$V eval "$RUN" '[...document.querySelector("#b-1000000000000000200 blockquote").children].map((c) => c.tagName + ":" + (c.querySelectorAll("img").length || c.textContent.trim().slice(0, 30)))'`. The order is text, an image list with 2 images, text, an image list with 1 image, matching the thread's posts. The single image has the class `object-contain`, and grid images have `object-cover`.
- **Copy.** With the first card open, run `$V click "$RUN" --card 0 --name Copy`. The button label becomes `Copied`, and `$V eval "$RUN" '(await navigator.clipboard.readText()).split("\n")[0]'` prints `"A post I saved from X:"`.
- **Open on X.** Run `$V eval "$RUN" '[...document.querySelectorAll("[data-bookmark-id] a")].find((a) => a.textContent.includes("Open on X")).href'`. It is the bookmark's `https://x.com/…/status/<id>` with `target="_blank"`. Don't click it in proof runs, because it leaves for x.com.
- **Linked card.** Run `$V open "$RUN" "/#b-1000000000000000200" --viewport mobile --fresh`. The address keeps no filter (the card is not done), and that card's `data-depth` is `full` while the rest stay at `headline`. Mark it done, then `open` the same address without `--fresh`: the address gains `?done=show` and the card shows, open. The card starts below the pinned bar, not under it: `$V eval "$RUN" '({bar: document.querySelector("fieldset[aria-label=\"Filter by topic\"]").parentElement.getBoundingClientRect().bottom, card: document.querySelector("#b-1000000000000000200").getBoundingClientRect().top})'` prints `card` greater than `bar` (65 against 53). Take `$V screenshot "$RUN" read-card-linked-mobile`.
- **Phone dates.** For the first card, the header shows only `Oct 15, 2026`. Opened in full, the card ends with `Posted Oct 14, 2026`. Card dates are formatted in UTC, so they don't change with the machine's time zone.

## Gotchas

- Fixture images are made-up `pbs.twimg.com` addresses and render broken. Check order and classes, not pixels.
- Opening or closing a card animates for half a second. Positions read during it are mid-flight, so wait about 0.6 seconds before measuring or taking a screenshot.
- A closed card has no buttons. Copy, Done and Open on X need the card opened first. Opened cards are not remembered across reloads.
- Clipboard reads work because `open` grants clipboard access to the page's origin. A real browser asks the reader.
