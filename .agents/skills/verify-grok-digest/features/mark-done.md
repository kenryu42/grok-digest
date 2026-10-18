# Mark bookmarks done

A reader works through saved posts by marking each one done. A done card leaves the list, comes back dimmed with `Show done` in the `Sort and filter` menu, and stays done after a reload. The cards below close the gap with a short animation. Each mark shows a `Marked done` toast with `Undo` for 5 seconds.

## Sub-features

- `done-button` marks a card done with its `Done` button and unmarks it with the same button.
- `done-swipe` works on a touch screen. Swiping a card left past half of the round buttons behind it (`Later`, then `Done`, or `Inbox` on a done card) leaves them open, as in Mail, centered on the part of the card on screen; a short, slow drag closes again. However far or fast it is swiped, the card stops at the buttons: only a tap on `Done` marks it. Tapping the open card or touching another one closes the buttons. Dragging right gives a little and springs back, with no buttons behind it.
- `later` moves a card to the end of the list with the round `Later` button, the clock button in a card's footer on desktop, or `l`. The order is kept across reloads, and swipe mode follows it.
- `done-cleanup` shows `Copy for Grok` above the list while `Show done` is on and anything is done. It copies `Remove these bookmarks from my Grok Digest:` and the done posts' links, one per line, for the owner to paste to the Grok bot.
- `done-keyboard` moves between cards with `j` and `k` and marks the focused card with `e` on desktop.
- `done-undo` restores the last card with the toast's `Undo` button, or with `u`, and the toast closes by itself after 5 seconds.
- `done-show` updates the status line (`14 bookmarks to read`) and the count on `Show done`, and with `Show done` on lists done cards in place, dimmed (`15 bookmarks, 1 done`).
- `done-persist` keeps done marks across a reload.

## How to get to it (user POV)

- Open a card by tapping or clicking its headline, then tap or click `Done` at its bottom.
- On a phone, swipe a card to the left. The line `Tap a card to open it. Swipe it left to mark it done.` under the count says so.
- On desktop, press `j` to focus the first card, then `e`.
- Tap `Undo` in the toast at the bottom of the screen, or press `u`.
- Open `Sort and filter` and turn on `Show done` to see what is done.

## Driving it with verify.mjs

Preconditions:

- A healthy run (`$V doctor "$RUN"` shows only `✓`).
- `$V open "$RUN" / --viewport mobile --fresh` reports `"status": "15 bookmarks to read"`.
- Cards show only their headline, with no `Done` button. Open the card first for the button steps: `$V click "$RUN" --card 0 --selector h2`.

- **Swipe.** Swipe the first card. Run `$V swipe "$RUN" --card 0` (160px in 128ms). The reply shows `"status": "14 bookmarks to read"` and 14 visible cards, and `$V wait "$RUN" --selector "[data-undo]"` succeeds.
- **Toast proof.** Run `$V snapshot "$RUN" mark-done-swipe` and `$V screenshot "$RUN" mark-done-swipe`. The snapshot has the status `14 bookmarks to read`, the text `Marked done` and `button "Undo"`.
- **Undo.** Tap Undo. Run `$V click "$RUN" --name Undo`. The status goes back to `15 bookmarks to read`, and `$V eval "$RUN" 'localStorage.getItem("grok-digest:/:done")'` prints `"[]"`.
- **Short, slow drag.** Run `$V swipe "$RUN" --card 0 --distance 60 --duration 600`. The status stays `15 bookmarks to read`, no `[data-undo]` appears, and the card springs back (its `[data-swipe-surface]` has no inline `transform` afterwards).
- **Open the buttons.** Run `$V swipe "$RUN" --card 0 --distance 110 --duration 600`. The status stays `15 bookmarks to read`, the card's `li` has `data-actions="left"`, and `$V screenshot "$RUN" mark-done-buttons` shows an amber `Later` and a green `Done` circle beside the card, centered on its visible part. Tapping the card (`$V click "$RUN" --card 0 --selector 'h2 button'`) closes them without opening it.
- **No full swipe.** Run `$V swipe "$RUN" --card 0 --distance 300 --duration 150`. Nothing is marked: the status stays `15 bookmarks to read` and the card rests with its buttons open.
- **Later.** With the buttons open, `$V click "$RUN" --card 0 --selector '[data-swipe-action="later"]'`. That card is now the list's last, and `localStorage.getItem("grok-digest:/:later")` lists its id. Reload with `open` (no `--fresh`): it is still last.
- **Done button behind the card.** Open the buttons on the first card and `$V click "$RUN" --card 0 --selector '[data-swipe-action="done"]'`. The status shows `14 bookmarks to read` and the toast reads `Marked done`. Open `Sort and filter` and tap `Show done 1`: the status reads `15 bookmarks, 1 done`, the address has `done=show`, and `$V click "$RUN" --name "Copy for Grok"` fills the clipboard with `Remove these bookmarks from my Grok Digest:` and that card's link. With `Show done` off the button is absent.
- **Drag right.** Run `$V swipe "$RUN" --card 0 --distance=-100 --duration 400` (the `=` is needed for a negative number). Nothing is marked, the card moved right by less than half the drag before springing back, and the green `Done` panel never showed.
- **Done button.** Open the first card with `$V click "$RUN" --card 0 --selector h2`, then run `$V click "$RUN" --card 0 --name Done`. The status shows `14 bookmarks to read`, and the toast appears.
- **Toast timeout.** Wait out the toast. Run `$V wait "$RUN" --selector "[data-undo]" --gone`. It succeeds within about 5 seconds and the card stays hidden.
- **Persistence.** Reload without clearing. Run `$V open "$RUN" "/?done=show"`. The status reads `15 bookmarks, 1 done` and that card has `data-done`.
- **Unmark.** Open the done card and tap its pressed `Done` button. The status reads `15 bookmarks` with no done count.
- **Keyboard (desktop).** Run `$V open "$RUN" / --viewport desktop --fresh`, then `$V key "$RUN" j`. The reply's `focused` is the first card's id (`b-…`). Then `$V key "$RUN" e`: the status shows `14 bookmarks to read` and `focused` moves to the next card. Then `$V key "$RUN" u`: the status shows `15 bookmarks to read` again.
- **Desktop has no swipe hint.** At desktop, `$V eval "$RUN" '[...document.querySelectorAll("p")].some((p) => p.textContent.startsWith("Tap a card") && p.checkVisibility())'` prints `false`.

## Gotchas

- `swipe` refuses to run on the desktop viewport. Swiping is touch-only, by design.
- Whether a swipe counts as a flick depends on its speed. Each touch step costs the driver about 17ms, so a `--duration` under about 40ms is no faster than 40ms.
- With `Show done` on, a done card stays visible but dimmed and its `Done` button has `aria-pressed="true"`. Count done cards with `[data-done]`.
- The driver's swipes are perfectly straight, and Chrome never takes a sideways drag over for scrolling. Safari on iOS does once the finger drifts down a little, which cancels the touch and springs the card back. After changing swipe code, also drag a card left and slightly down in Safari in the iOS Simulator (`open_url` to the run's `URL`, then a `touch_path`), and check that it is marked done.
- A swipe blocks clicks for 400ms. Don't chain an `eval` click right after one.
