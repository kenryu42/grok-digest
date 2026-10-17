# Read a card

Each card shows who posted, when it was saved and Grok's one-line takeaway. A `Detail` slider sets how much every card shows: `Minimal` (the title), `Light` (adds the summary), `Deep` (adds the key points, the `Try:` action and the card's buttons) or `Full` (adds the post's links as clickable cards, with X's preview image when the link has one that loads and a link icon otherwise, and the original post with its images in place). Tapping a card's header opens that one card in full, and tapping again returns it to the list's level. Changing the level morphs the cards into place without overshooting and keeps the card you were reading in view. A closing card keeps its text in place while it shrinks, so its height only ever goes down. Phones start at `Minimal`. Desktop starts at `Full`. On phones the slider opens from the `Detail` button in the top row (an icon-only circle named `Detail: <level>`, such as `Detail: Minimal`, whose three-row icon fills one row from the bottom per level: none at `Minimal`, all three at `Full`) and closes on a tap outside it; on desktop it sits above the list.

## Sub-features

- `card-depth` sets every card's level with the `Detail` slider: tap a stop, drag the thumb, or use the arrow keys on the focused slider. Desktop also takes the keys `1` to `4`.
- `card-depth-remember` keeps the chosen level across reloads.
- `card-phone-default` starts at `Minimal` on a first visit at phone width and at `Full` at desktop width.
- `card-toggle` opens one card in full by tapping its header, and returns it to the list's level on a second tap. With the list at `Full`, the tap closes the card to its title.
- `card-post-images` shows each image under the post text it belongs to. A single image is uncropped; several images form a cropped grid.
- `card-copy` copies a Markdown version of the card and shows `Copied`.
- `card-open` opens the post on X in a new tab.
- `card-linked` opens the card named in a `#b-<id>` link in full, switches to `All`, and scrolls to it.
- `card-dates` shows the saved date in the header. On phones the posted date moves to the bottom of the card at `Full`.

## How to get to it (user POV)

- Phone: tap the `Detail` button in the top row, then tap `Minimal`, `Light`, `Deep` or `Full`, or drag the thumb. Desktop: use the slider above the list.
- Tap a card's header (author line and title) to open or close it. On desktop, focus the title with `j` or `k` and press Enter.
- Tap `Copy` or `Open on X` at the bottom of a card, shown from `Deep` up. On desktop, `c` and `o` act on the focused card.
- Open a link ending in `#b-<bookmark id>`.

## Driving it with verify.mjs

Preconditions:

- A healthy run with the default fixture.

- **Phone default.** Run `$V open "$RUN" "/?view=all" --viewport mobile --fresh`, then `$V eval "$RUN" '[...new Set([...document.querySelectorAll("[data-bookmark-id]")].map((c) => c.dataset.depth))]'`. It prints `["headline"]` (the stored name for `Minimal`), the top row's button is named `Detail: Minimal`, and the slider (`input[aria-label=Detail]`) has `aria-valuetext="Minimal"`. The first card's summary, points and buttons are hidden (`checkVisibility()` is false on each `[data-level]`).
- **Desktop default.** Run `$V open "$RUN" "/?view=all" --viewport desktop --fresh`. The same expression prints `["full"]`.
- **Change the level.** At mobile, run `$V click "$RUN" --name Detail` (its `aria-expanded` becomes `true`), then `$V click "$RUN" --selector '[data-depth-stop="gist"]'`. Every card's `data-depth` becomes `gist` (`Light`), the summary shows, and the button reads `Detail: Light`. Its icon fills its bottom row: `button[aria-label^=Detail] svg` has `data-filled-rows="1"` (`0` at `Minimal`, `3` at `Full`). A tap on a card closes the slider again. Run `$V screenshot "$RUN" read-card-gist` after about half a second, once the morph settles.
- **Remember the level.** Run `$V open "$RUN" "/?view=all"` without `--fresh`. Cards are still at `gist`, and `localStorage.getItem("grok-digest:/:cards-depth")` is `"\"gist\""`.
- **Open one card.** Run `$V click "$RUN" --card 0 --selector h2`. That card's `data-depth` is `full`, its title button has `aria-expanded="true"`, and the other cards stay at `gist`. Run it again: the card goes back to `gist`. To check the motion, start a `requestAnimationFrame` loop with `eval` that records the card's height and whether its `[data-read-point]` items are visible, then tap again: on opening, the height only rises to its final value. On closing it only falls, the points stay visible until the last frame, and `data-depth` reads `gist` only once the card has settled.
- **Keyboard (desktop).** At desktop, `$V key "$RUN" 1` sets every card to `headline`. `$V key "$RUN" j` focuses the first card's title, then `$V key "$RUN" Enter` opens it in full.
- **Thread images.** Run `$V eval "$RUN" '[...document.querySelector("#b-1000000000000000200 blockquote").children].map((c) => c.tagName + ":" + (c.querySelectorAll("img").length || c.textContent.trim().slice(0, 30)))'`. The order is text, an image list with 2 images, text, an image list with 1 image, matching the thread's posts. The single image has the class `object-contain`, and grid images have `object-cover`.
- **Copy.** At `Deep` or `Full`, run `$V click "$RUN" --card 0 --name Copy`. The button label becomes `Copied`, and `$V eval "$RUN" '(await navigator.clipboard.readText()).split("\n")[0]'` prints `"A post I saved from X:"`.
- **Open on X.** Run `$V eval "$RUN" '[...document.querySelectorAll("[data-bookmark-id] a")].find((a) => a.textContent.includes("Open on X")).href'`. It is the bookmark's `https://x.com/…/status/<id>` with `target="_blank"`. Don't click it in proof runs, because it leaves for x.com.
- **Linked card.** Run `$V open "$RUN" "/?view=inbox#b-1000000000000000200" --viewport mobile --fresh`. The URL switches to `?view=all`, the `All` view is pressed, that card's `data-depth` is `full` while the rest stay at `headline` (`Minimal`). The card starts below the pinned bar, not under it: `$V eval "$RUN" '({bar: document.querySelector("fieldset[aria-label=\"Filter by topic\"]").parentElement.getBoundingClientRect().bottom, card: document.querySelector("#b-1000000000000000200").getBoundingClientRect().top})'` prints `card` greater than `bar` (65 against 53). Take `$V screenshot "$RUN" read-card-linked-mobile`.
- **Phone dates.** For the first card, the header shows only `Oct 15, 2026`. Opened in full, the card ends with `Posted Oct 14, 2026`. Card dates are formatted in UTC, so they don't change with the machine's time zone.

## Gotchas

- Fixture images are made-up `pbs.twimg.com` addresses and render broken. Check order and classes, not pixels.
- A level change animates for half a second. Positions read during it are mid-flight, so wait about 0.6 seconds before measuring or taking a screenshot.
- Moving the slider clears cards opened by tapping. The level applies to every card, including hidden ones, and is stored. Use `--fresh` to see the defaults again.
- At `Minimal` and `Light` a card has no buttons. Copy, Done and Open on X need `Deep` or higher, or the card opened in full.
- The slider's stops are not buttons, so `--name Light` finds nothing. Tap them with `--selector '[data-depth-stop="gist"]'`. The stop names are the stored level names: `headline` is `Minimal`, `gist` is `Light`, `points` is `Deep`. On phones, open the `Detail` button first or the stops are hidden.
- Clipboard reads work because `open` grants clipboard access to the page's origin. A real browser asks the reader.
