# Swipe mode

A reader can go through the cards in the current view one per screen, full screen, like a short-video feed. Swipe up for the next card and down for the previous one; swipe left to mark a card done, which moves on to the next. While a card is dragged left, a green `Done` panel shows behind it (a muted `Back to inbox` panel for a card already done), as in the list. Swiping right does nothing and springs back, so a stray sideways drag never acts. Each card shows at the list's detail level, and a tap opens it in full. `Speed read` flashes the card's text one word at a time in the center of the screen, fading each word in and out, at 350 words per minute by default. It starts off each time swipe mode opens. When a card's text ends, the whole card shows and the reader decides when to swipe on.

## Sub-features

- `swipe-open` opens swipe mode from the round button in the middle of the bottom tab bar on phones (`Swipe through cards`), the `Swipe` button next to the views on desktop, or `s`. It starts at the card at the top of the list.
- `swipe-navigate` moves to the next or previous card with a vertical swipe (or the mouse wheel, `j`/`k`, arrow keys). A card taller than the screen scrolls within itself first, so a flick stops at its end and the next swipe moves on.
- `swipe-done` marks the current card done with a left swipe, the `Done` button or `e`, then moves on. A `Marked done` toast offers `Undo` for 5 seconds (also `u`), which unmarks it and goes back to it.
- `swipe-right` does nothing: the card gives a little and springs back.
- `swipe-expand` opens the current card in full with a tap (or Enter), and back with another.
- `speed-read` toggles speed reading with `Speed read` (or `r`). It is off whenever swipe mode opens. Reading starts a moment after a card arrives, ramps up over the first words, pauses longer at sentence ends and between sections, and times Japanese by its characters. A label above the word names the section (`Summary`, `Key point`, `Try`, `Original post`), and a thin bar under the header shows progress. The focus letter of each word stays on the center line, in the accent color.
- `speed-pause` pauses with a tap, the round button, or Space, and shows the current section's text with the current word highlighted. It also pauses when the page is hidden. With reduced motion, reading waits for a tap and words don't fade.
- `speed-finish` shows the whole card when the text ends and does not move on by itself. The round button becomes `Read again`.
- `speed-rate` changes the pace with the slider (200 to 900 wpm, 350 to start) or `-` and `=`, and remembers it.
- `swipe-actions` copies the card (`Copy`, `c`) or opens it on X (`Open on X`, `o`).
- `swipe-close` closes with the X button, `Close` on the end screen, or Escape, and leaves the list at the last card shown.

## How to get to it (user POV)

- Phone: tap the round button in the middle of the bottom tab bar.
- Desktop: click `Swipe` next to the views, or press `s`.
- Inside, swipe or use the buttons along the bottom; `Speed read` is at the top right.

## Driving it with verify.mjs

Preconditions:

- A healthy run with the default fixture.
- `$V open "$RUN" "/?view=inbox" --viewport mobile --fresh`. The list is at `Minimal`, so cards show only their titles and speed reading has no text. Set `Deep` first: `$V click "$RUN" --name Detail`, then `$V click "$RUN" --selector '[data-depth-stop="points"]'`.

- **Open.** Run `$V click "$RUN" --name "Swipe through cards"`. `dialog[open]` exists, named `Swipe mode`, and the counter (`[data-swipe-counter]`) reads `1 / 15`. Take `$V screenshot "$RUN" swipe-open`.
- **Next and back.** Run `$V swipe "$RUN" --selector "[data-swipe-pager]" --up --distance 300 --duration 150`. After about a second the counter reads `2 / 15`. `$V key "$RUN" k` goes back to `1 / 15`.
- **Tall card.** Run `$V open "$RUN" "/?view=all"`, set `Full` (`--selector '[data-depth-stop="full"]'`), then `$V key "$RUN" s`. The first card overflows: `document.querySelector("[data-swipe-page][data-current] > div:not([aria-hidden])")` has `scrollHeight` above `clientHeight`. A flick (`$V swipe "$RUN" --selector "[data-swipe-page][data-current]" --up --distance 200 --duration 80`) scrolls that element to its end while the counter stays on `1 / 15`. A second flick moves to `2 / 15`.
- **Expand.** Run `$V click "$RUN" --selector "[data-swipe-page][data-current] article"`. The card shows its original post too (`[data-swipe-page][data-current] article > div p` count grows).
- **Done by swipe.** Before swiping, record the green panel: `$V eval "$RUN" 'window.seen = []; const page = document.querySelector("[data-swipe-page][data-current]"); new MutationObserver(() => seen.push(page.querySelector("span.bg-done").checkVisibility())).observe(page, { attributes: true }); 1'`. Run `$V swipe "$RUN" --selector "[data-swipe-page][data-current] article" --distance 120 --duration 80`. `seen` includes `true` (the green `Done` panel showed during the drag) and ends with `false`. `localStorage.getItem("grok-digest:/:done")` lists that card's id, the counter moves on, and the toast in `dialog output` reads `Marked done`.
- **Undo.** Run `$V click "$RUN" --selector "dialog output button"`. The done list is empty again and the counter is back on that card.
- **Swipe right.** Run `$V swipe "$RUN" --selector "[data-swipe-page][data-current] article" --distance=-120 --duration 300`. Nothing is marked and the counter stays.
- **Speed read.** Run `$V click "$RUN" --name "Speed read"`. Within a second `[data-speed-word]` shows a word, the label above it reads `Summary`, and the slider reads `350`. The word changes when read again a second later. Take `$V screenshot "$RUN" swipe-speed-read`.
- **Pause.** Run `$V click "$RUN" --selector "[data-swipe-page][data-current] article"`. `[data-speed-paused]` shows the section's text with one word highlighted (`.bg-brand-soft`). `$V click "$RUN" --name Play` resumes.
- **Finish and wait.** Press `$V key "$RUN" =` 22 times (900 wpm). Within a few seconds `[data-speed-stage]` is gone, the card's full text shows, the round button is named `Read again`, and the counter has not moved.
- **Next card reads.** Run `$V key "$RUN" j`. The counter moves on and a word shows in `[data-speed-word]` again.
- **Close.** Run `$V key "$RUN" Escape`. No `dialog` remains and `document.documentElement.style.overflow` is `""`.
- **Speed read resets.** Open swipe mode again. `Speed read` has `aria-pressed="false"` and no `[data-speed-stage]` shows, while the slider keeps the speed set earlier once speed reading is turned on.

## Gotchas

- Swipe mode is a modal dialog, and the list's buttons stay in the DOM behind it. Card buttons named `Done` or `Copy` come later in the page, so scope with `--selector "dialog button"` when a name could match both.
- Target the current card with `[data-swipe-page][data-current]`. Targeting the first `article` makes the driver scroll back to it before swiping.
- Words fade out fully between steps, so a screenshot can land on a blank moment. Read `[data-speed-word]`'s text instead of trusting one screenshot.
- The counter changes when a scroll passes 40% of the screen, so read it about a second after a swipe.
