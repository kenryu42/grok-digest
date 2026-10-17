# Mark bookmarks done

A reader works through saved posts by marking each one done. A done card leaves Today and Inbox, shows up in Done, dims in All, and stays done after a reload. The cards below close the gap with a short animation. Each mark shows a `Marked done` toast with `Undo` for 5 seconds.

## Sub-features

- `done-button` marks a card done with its `Done` button and unmarks it with the same button.
- `done-swipe` works on a touch screen. Swiping a card left past half of the round buttons behind it (`Delete`, then `Done`, or `Inbox` on a done card) leaves them open, as in Mail; a short, slow drag closes again. A drag well past the buttons, or a quick flick past them, marks the card done at once. Tapping the open card or touching another one closes the buttons. Dragging right gives a little and springs back, with no buttons behind it.
- `delete` hides a card on this device: the round `Delete` button, the trash button in a card's footer on desktop, or `#`. A `Deleted` toast offers `Undo`. A deleted card leaves every view, its count and search.
- `delete-queue` lists the deleted cards above the list (`1 to delete`), with `Copy for Grok`, which copies `Remove these bookmarks from my Grok Digest:` and one post link per line, and `Restore` for each card. A card leaves the list once the bot has removed it from the data.
- `done-keyboard` moves between cards with `j` and `k` and marks the focused card with `e` on desktop.
- `done-undo` restores the last card with the toast's `Undo` button, or with `u`, and the toast closes by itself after 5 seconds.
- `done-views` updates the counts on `Today`, `Inbox`, `Done` and `All` (the bottom tab bar on phones, the row above the list on desktop), and lists done cards under `Done`.
- `done-persist` keeps done marks across a reload.

## How to get to it (user POV)

- Tap or click `Done` at the bottom of a card.
- On a phone, swipe a card to the left. The line `Tap a card to open it. Swipe it left to mark it done.` under the count says so.
- On desktop, press `j` to focus the first card, then `e`.
- Tap `Undo` in the toast at the bottom of the screen, or press `u`.
- Choose `Done` in the `Choose a view` group (the bottom tab bar on phones) to see what is done.

## Driving it with verify.mjs

Preconditions:

- A healthy run (`$V doctor "$RUN"` shows only `✓`).
- `$V open "$RUN" "/?view=inbox" --viewport mobile --fresh` reports `"status": "15 bookmarks"`.
- Phones start at `Minimal`, where cards have no `Done` button. Set `Deep` first for the button steps: `$V click "$RUN" --name Detail`, then `$V click "$RUN" --selector '[data-depth-stop="points"]'`.

- **Swipe.** Swipe the first card. Run `$V swipe "$RUN" --card 0` (160px in 128ms). The reply shows `"status": "14 bookmarks"` and 14 visible cards, and `$V wait "$RUN" --selector "[data-undo]"` succeeds.
- **Toast proof.** Run `$V snapshot "$RUN" mark-done-swipe` and `$V screenshot "$RUN" mark-done-swipe`. The snapshot has `button "Inbox 14" [pressed=true]`, `button "Done 1"`, the text `Marked done` and `button "Undo"`.
- **Undo.** Tap Undo. Run `$V click "$RUN" --name Undo`. The status goes back to `15 bookmarks`, and `$V eval "$RUN" 'localStorage.getItem("grok-digest:/:done")'` prints `"[]"`.
- **Short, slow drag.** Run `$V swipe "$RUN" --card 0 --distance 60 --duration 600`. The status stays `15 bookmarks`, no `[data-undo]` appears, and the card springs back (its `[data-swipe-surface]` has no inline `transform` afterwards).
- **Open the buttons.** Run `$V swipe "$RUN" --card 0 --distance 110 --duration 600`. The status stays `15 bookmarks`, the card's `li` has `data-actions="left"`, and `$V screenshot "$RUN" mark-done-buttons` shows a red `Delete` and a green `Done` circle beside the card. Tapping the card (`$V click "$RUN" --card 0 --selector 'h2 button'`) closes them without opening it.
- **Delete.** Open the buttons again, then `$V click "$RUN" --card 0 --selector '[data-swipe-action="delete"]'`. The status shows `14 bookmarks`, every view count drops by one, the toast reads `Deleted`, `localStorage.getItem("grok-digest:/:deleted")` lists the card's id, and `1 to delete` shows above the list. `$V click "$RUN" --name "Copy for Grok"` fills the clipboard with the request. Tap `1 to delete` to open the list and `Restore`: the status is back to `15 bookmarks`.
- **Drag right.** Run `$V swipe "$RUN" --card 0 --distance=-100 --duration 400` (the `=` is needed for a negative number). Nothing is marked, the card moved right by less than half the drag before springing back, and the green `Done` panel never showed.
- **Done button.** After setting `Deep`, run `$V click "$RUN" --card 0 --name Done`. The status shows `14 bookmarks`, and the toast appears.
- **Toast timeout.** Wait out the toast. Run `$V wait "$RUN" --selector "[data-undo]" --gone`. It succeeds within about 5 seconds and the card stays hidden.
- **Persistence.** Reload without clearing. Run `$V open "$RUN" "/?view=done"`. The status is `1 bookmark` and the snapshot shows `button "Done 1" [pressed=true]`.
- **Unmark.** In Done, at `Deep`, run `$V click "$RUN" --card 0 --name Done`. The status reads `Nothing marked done yet.`
- **Keyboard (desktop).** Run `$V open "$RUN" "/?view=inbox" --viewport desktop --fresh`, then `$V key "$RUN" j`. The reply's `focused` is the first card's id (`b-…`). Then `$V key "$RUN" e`: the status shows `14 bookmarks` and `focused` moves to the next card. Then `$V key "$RUN" u`: the status shows `15 bookmarks` again.
- **Desktop has no swipe hint.** At desktop, `$V eval "$RUN" '[...document.querySelectorAll("p")].some((p) => p.textContent.startsWith("Tap a card") && p.checkVisibility())'` prints `false`.

## Gotchas

- `swipe` refuses to run on the desktop viewport. Swiping is touch-only, by design.
- Whether a swipe counts as a flick depends on its speed. Each touch step costs the driver about 17ms, so a `--duration` under about 40ms is no faster than 40ms.
- In `All`, a done card stays visible but dimmed and its `Done` button has `aria-pressed="true"`. Count with the `Done` view instead.
- The driver's swipes are perfectly straight, and Chrome never takes a sideways drag over for scrolling. Safari on iOS does once the finger drifts down a little, which cancels the touch and springs the card back. After changing swipe code, also drag a card left and slightly down in Safari in the iOS Simulator (`open_url` to the run's `URL`, then a `touch_path`), and check that it is marked done.
- A swipe blocks clicks for 400ms. Don't chain an `eval` click right after one.
- Today's picks are cached per day. A card marked done stays in today's count (`n of 5 reviewed today`) rather than being replaced.
