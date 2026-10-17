# Swipe mode

A reader can go through the cards in the current view one per screen, full screen, like a short-video feed. Swipe up for the next card and down for the previous one; swipe a card left to open round `Later` and `Done` buttons behind it, as in Mail (`Inbox` for a card already done), or right to open `Share` and `Copy`. The card stops at the buttons however far it is swiped; only a tap acts. Each card shows at `Deep` (summary, key points and the `Try:` action) whatever the list's `Detail` level, followed by the post's links as the same clickable cards the list shows, and a card with an original post ends with a peek at it: an `Original post` label and its first two lines, fading out. Tapping the peek (or anywhere on the card) opens the post in place, and `Show less` at its end closes it. Leaving swipe mode keeps the list at its own level. `Speed read` flashes the card's text one word at a time in the center of the screen, fading each word in and out, at 250 words per minute by default. It starts off each time swipe mode opens. When a card's text ends, the whole card shows and the reader decides when to swipe on.

## Sub-features

- `swipe-open` opens swipe mode from the round button in the middle of the bottom tab bar on phones (`Swipe through cards`), the `Swipe` button next to the views on desktop, or `s`. It starts at the card at the top of the list.
- `swipe-navigate` moves to the next or previous card with a vertical swipe (or the mouse wheel, `j`/`k`, arrow keys). The top of the next card (its topic line, dimmed, under a rounded edge) always peeks above the bottom buttons, and tapping it moves there. The first time swipe mode ever opens, the cards lift once to show more of the next one and settle back; a touch stops it, and it never plays again. A card taller than the screen scrolls within itself first, so a flick stops at its end and the next swipe moves on. A card always opens at its top, including one scrolled down earlier and swiped back to.
- `swipe-done` marks the current card done with the round `Done` button, the footer's `Done` (desktop) or `e`, then moves on. A `Marked done` toast offers `Undo` for 5 seconds (also `u`), which unmarks it and goes back to it.
- `swipe-later` moves the card to the end of the deck, and of the list, with the round `Later` button, the footer's clock button (desktop) or `l`; the next card takes its place.
- `swipe-right` opens `Share` (the system share sheet, when the browser has one) and `Copy`. A tap on the card closes open buttons.
- `swipe-expand` opens the current card's original post from the peek at its end, a tap anywhere on the card or Enter, and closes it with `Show less` or another tap. A left swipe that starts on the peek still marks the card done.
- `speed-read` toggles speed reading with `Speed read` (or `r`). It is off whenever swipe mode opens. Reading starts a moment after a card arrives, ramps up over the first words, pauses longer at sentence ends and between sections, and times Japanese by its characters. A label above the word names the section (`Summary`, `Key point`, `Try`, `Original post`), and a thin bar under the header shows progress. The focus letter of each word stays on the center line, in the accent color.
- `speed-pause` pauses with a tap, the round button, or Space, and shows the current section's text with the current word highlighted. It also pauses when the page is hidden. With reduced motion, reading waits for a tap and words don't fade.
- `speed-finish` shows the whole card when the text ends and does not move on by itself. The round button becomes `Read again`.
- `speed-rate` changes the pace with the slider (200 to 600 wpm, 250 to start) or `-` and `=`, and remembers it.
- `swipe-actions` copies the card (`Copy`, `c`) or opens it on X (`Open on X`, `o`). On touch screens the footer shows only `Open on X`; Copy and Done live behind the card.
- `swipe-close` closes with the X button, `Close` on the end screen, or Escape, and leaves the list at the last card shown.

## How to get to it (user POV)

- Phone: tap the round button in the middle of the bottom tab bar.
- Desktop: click `Swipe` next to the views, or press `s`.
- Inside, swipe or use the buttons along the bottom; `Speed read` is at the top right.

## Driving it with verify.mjs

Preconditions:

- A healthy run with the default fixture.
- `$V open "$RUN" "/?view=inbox" --viewport mobile --fresh`. The list starts at `Minimal`; swipe mode shows `Deep` anyway.

- **Open.** Run `$V click "$RUN" --name "Swipe through cards"`. `dialog[open]` exists, named `Swipe mode`, and the counter (`[data-swipe-counter]`) reads `1 / 15`. The card shows its summary, key points and `Try:` line (`[data-swipe-page][data-current] article > div p` count is above 1) though the list is at `Minimal`. Take `$V screenshot "$RUN" swipe-open`.
- **Peek and nudge.** Right after opening, `[data-swipe-pager]` has `data-nudge` and `localStorage.getItem("grok-digest:/:swipe-nudged")` is `"true"`. About a second in, `$V screenshot "$RUN" swipe-nudge` shows the cards lifted with more of the next one in view; two seconds later the next card's topic line sits just above the footer. Run `$V click "$RUN" --selector '[data-swipe-page]:not([data-current]) article > p'`: the counter reads `2 / 15` and no card is expanded. Close, `open` without `--fresh` and open swipe mode again: no `data-nudge`.
- **Next and back.** Run `$V swipe "$RUN" --selector "[data-swipe-pager]" --up --distance 300 --duration 150`. After about a second the counter reads `2 / 15`. `$V key "$RUN" k` goes back to `1 / 15`.
- **Expand.** The first card ends with `[data-swipe-peek]`, whose text starts `Original post` and then the post. Run `$V click "$RUN" --selector "[data-swipe-page][data-current] [data-swipe-peek]"`. The peek is gone and the post shows in full (`[data-swipe-page][data-current] article > div p` count grows from 5 to 6). `$V click "$RUN" --name "Show less"` brings the peek back and the count to 5. A tap elsewhere on the card (`--selector "[data-swipe-page][data-current] article"`) toggles it the same way.
- **Buttons.** Run `$V swipe "$RUN" --selector "[data-swipe-page][data-current] h2" --distance 170 --duration 700`. The current page has `data-swiping="left"` and `$V screenshot "$RUN" swipe-buttons` shows `Later` and `Done` circles. `$V click "$RUN" --name Later`: the counter stays `1 / 15` and the next card shows.
- **Done from the buttons.** Run `$V swipe "$RUN" --selector "[data-swipe-page][data-current] h2" --distance 300 --duration 400`. Nothing is marked; the buttons stay open. `$V click "$RUN" --selector "dialog [data-swipe-tray=left] button:last-child"`: `localStorage.getItem("grok-digest:/:done")` lists that card's id, the counter moves on, and the toast in `dialog output` reads `Marked done`.
- **Undo.** Run `$V click "$RUN" --selector "dialog output button"`. The done list is empty again and the counter is back on that card.
- **Swipe right.** Run `$V swipe "$RUN" --selector "[data-swipe-page][data-current] h2" --distance=-150 --duration 700`. The page has `data-swiping="right"` with `Share` and `Copy` circles. `$V click "$RUN" --name Copy` fills the clipboard and closes them; nothing is marked and the counter stays.
- **Speed read.** Run `$V click "$RUN" --name "Speed read"`. Within a second `[data-speed-word]` shows a word, the label above it reads `Summary`, and the slider reads `250`. The word changes when read again a second later. Take `$V screenshot "$RUN" swipe-speed-read`.
- **Pause.** Run `$V click "$RUN" --selector "[data-swipe-page][data-current] article"`. `[data-speed-paused]` shows the section's text with one word highlighted (`.bg-brand-soft`). `$V click "$RUN" --name Play` resumes.
- **Finish and wait.** Press `$V key "$RUN" =` 14 times (600 wpm). Within a few seconds `[data-speed-stage]` is gone, the card's full text shows, the round button is named `Read again`, and the counter has not moved.
- **Next card reads.** Run `$V key "$RUN" j`. The counter moves on and a word shows in `[data-speed-word]` again.
- **Close.** Run `$V key "$RUN" Escape`. No `dialog` remains and `document.documentElement.style.overflow` is `""`. The list's cards are still at `headline` (`Minimal`): `[...new Set([...document.querySelectorAll("[data-bookmark-id]")].map((c) => c.dataset.depth))]` prints `["headline"]`.
- **Speed read resets.** Open swipe mode again. `Speed read` has `aria-pressed="false"` and no `[data-speed-stage]` shows, while the slider keeps the speed set earlier once speed reading is turned on.
- **Tall card.** Run `$V open "$RUN" "/?view=all"`, `$V key "$RUN" s`, then open the first card in full with `$V click "$RUN" --selector "[data-swipe-page][data-current] article"`. It overflows: `document.querySelector("[data-swipe-page][data-current] > div:not([aria-hidden])")` has `scrollHeight` above `clientHeight`. A flick (`$V swipe "$RUN" --selector "[data-swipe-page][data-current]" --up --distance 200 --duration 80`) scrolls that element to its end while the counter stays on `1 / 15`. A second flick moves to `2 / 15`. Flick back down (`--distance=-300 --duration 150`) to `1 / 15`: that element's `scrollTop` is `0` again, so the card shows from its top.

## Gotchas

- When the open card is taller than the screen (the first fixture card is, at 375×812), the first upward flick scrolls inside the card and only the next one moves to `2 / 15`. Use `$V key "$RUN" j` when a recipe only needs the next card.
- Swipe mode is a modal dialog, and the list's buttons stay in the DOM behind it. Card buttons named `Done` or `Copy` come later in the page, so scope with `--selector "dialog button"` when a name could match both.
- A left swipe needs `touch-pan-y` on the card's own scroll area (the section's child that is not `aria-hidden`); without it the browser cancels the drag with `pointercancel` and nothing is marked. Prove swipes with a real `$V swipe`, not by setting `data-swiping`.
- Target the current card with `[data-swipe-page][data-current]`. Targeting the first `article` makes the driver scroll back to it before swiping.
- Words fade out fully between steps, so a screenshot can land on a blank moment. Read `[data-speed-word]`'s text instead of trusting one screenshot.
- The counter changes when a scroll passes 40% of the screen, so read it about a second after a swipe.
