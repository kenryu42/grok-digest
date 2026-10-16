# Read a card

Each card shows who posted, when it was saved and Grok's one-line takeaway. A `Detail` slider above the list sets how much every card shows: `Headline`, `Gist` (adds the summary), `Points` (adds the key points, the `Try:` action and the card's buttons) or `Full` (adds links from the post and the original post with its images in place). Tapping a card's header opens that one card in full, and tapping again returns it to the list's level. Changing the level morphs the cards into place and keeps the card you were reading in view. Phones start at `Headline`. Desktop starts at `Full`.

## Sub-features

- `card-depth` sets every card's level with the `Detail` slider: tap a stop, drag the thumb, or use the arrow keys on the focused slider. Desktop also takes the keys `1` to `4`.
- `card-depth-remember` keeps the chosen level across reloads.
- `card-phone-default` starts at `Headline` on a first visit at phone width and at `Full` at desktop width.
- `card-toggle` opens one card in full by tapping its header, and returns it to the list's level on a second tap. With the list at `Full`, the tap closes the card to its headline.
- `card-post-images` shows each image under the post text it belongs to. A single image is uncropped; several images form a cropped grid.
- `card-copy` copies a Markdown version of the card and shows `Copied`.
- `card-open` opens the post on X in a new tab.
- `card-linked` opens the card named in a `#b-<id>` link in full, switches to `All`, and scrolls to it.
- `card-dates` shows the saved date in the header. On phones the posted date moves to the bottom of the card at `Full`.

## How to get to it (user POV)

- Tap `Headline`, `Gist`, `Points` or `Full` in the `Detail` slider in the bar, or drag its thumb.
- Tap a card's header (author line and title) to open or close it. On desktop, focus the title with `j` or `k` and press Enter.
- Tap `Copy` or `Open on X` at the bottom of a card, shown from `Points` up. On desktop, `c` and `o` act on the focused card.
- Open a link ending in `#b-<bookmark id>`.

## Driving it with verify.mjs

Preconditions:

- A healthy run with the default fixture.

- **Phone default.** Run `$V open "$RUN" "/?view=all" --viewport mobile --fresh`, then `$V eval "$RUN" '[...new Set([...document.querySelectorAll("[data-bookmark-id]")].map((c) => c.dataset.depth))]'`. It prints `["headline"]`, and the slider (`input[aria-label=Detail]`) has `aria-valuetext="Headline"`. The first card's summary, points and buttons are hidden (`checkVisibility()` is false on each `[data-level]`).
- **Desktop default.** Run `$V open "$RUN" "/?view=all" --viewport desktop --fresh`. The same expression prints `["full"]`.
- **Change the level.** At mobile, run `$V click "$RUN" --selector '[data-depth-stop="gist"]'`. Every card's `data-depth` becomes `gist` and the summary shows. Run `$V screenshot "$RUN" read-card-gist` after about half a second, once the morph settles.
- **Remember the level.** Run `$V open "$RUN" "/?view=all"` without `--fresh`. Cards are still at `gist`, and `localStorage.getItem("grok-digest:/:cards-depth")` is `"\"gist\""`.
- **Open one card.** Run `$V click "$RUN" --card 0 --selector h2`. That card's `data-depth` is `full`, its title button has `aria-expanded="true"`, and the other cards stay at `gist`. Run it again: the card goes back to `gist`.
- **Keyboard (desktop).** At desktop, `$V key "$RUN" 1` sets every card to `headline`. `$V key "$RUN" j` focuses the first card's title, then `$V key "$RUN" Enter` opens it in full.
- **Thread images.** Run `$V eval "$RUN" '[...document.querySelector("#b-1000000000000000200 blockquote").children].map((c) => c.tagName + ":" + (c.querySelectorAll("img").length || c.textContent.trim().slice(0, 30)))'`. The order is text, an image list with 2 images, text, an image list with 1 image, matching the thread's posts. The single image has the class `object-contain`, and grid images have `object-cover`.
- **Copy.** At `Points` or `Full`, run `$V click "$RUN" --card 0 --name Copy`. The button label becomes `Copied`, and `$V eval "$RUN" '(await navigator.clipboard.readText()).split("\n")[0]'` prints `"A post I saved from X:"`.
- **Open on X.** Run `$V eval "$RUN" '[...document.querySelectorAll("[data-bookmark-id] a")].find((a) => a.textContent.includes("Open on X")).href'`. It is the bookmark's `https://x.com/…/status/<id>` with `target="_blank"`. Don't click it in proof runs, because it leaves for x.com.
- **Linked card.** Run `$V open "$RUN" "/?view=inbox#b-1000000000000000200" --viewport mobile --fresh`. The URL switches to `?view=all`, the `All` view is pressed, that card's `data-depth` is `full` while the rest stay at `headline`. The card starts below the pinned bar, not under it: `$V eval "$RUN" '({bar: document.querySelector("fieldset[aria-label=\"Filter by topic\"]").parentElement.getBoundingClientRect().bottom, card: document.querySelector("#b-1000000000000000200").getBoundingClientRect().top})'` prints `card` greater than `bar` (173 against 161). Take `$V screenshot "$RUN" read-card-linked-mobile`.
- **Phone dates.** For the first card, the header shows only `Oct 15, 2026`. Opened in full, the card ends with `Posted Oct 14, 2026`. Card dates are formatted in UTC, so they don't change with the machine's time zone.

## Gotchas

- Fixture images are made-up `pbs.twimg.com` addresses and render broken. Check order and classes, not pixels.
- A level change animates for half a second. Positions read during it are mid-flight, so wait about 0.6 seconds before measuring or taking a screenshot.
- Moving the slider clears cards opened by tapping. The level applies to every card, including hidden ones, and is stored. Use `--fresh` to see the defaults again.
- At `Headline` and `Gist` a card has no buttons. Copy, Done and Open on X need `Points` or higher, or the card opened in full.
- The slider's stops are not buttons, so `--name Gist` finds nothing. Tap them with `--selector '[data-depth-stop="gist"]'`.
- Clipboard reads work because `open` grants clipboard access to the page's origin. A real browser asks the reader.
