# Mark bookmarks done

A reader works through saved posts by marking each one done. A done card leaves Today and Inbox, shows up in Done, dims in All, and stays done after a reload. Each mark shows a `Marked done` toast with `Undo` for 5 seconds.

## Sub-features

- `done-button` marks a card done with its `Done` button and unmarks it with the same button.
- `done-swipe` marks a card done by swiping it left on a touch screen. A short swipe snaps back.
- `done-keyboard` moves between cards with `j` and `k` and marks the focused card with `e` on desktop.
- `done-undo` restores the last card with the toast's `Undo` button, or with `u`, and the toast closes by itself after 5 seconds.
- `done-views` updates the counts on `Today`, `Inbox`, `Done` and `All`, and lists done cards under `Done`.
- `done-persist` keeps done marks across a reload.

## How to get to it (user POV)

- Tap or click `Done` at the bottom of a card.
- On a phone, swipe a card to the left. The line `Swipe a card left to mark it done.` under the count says so.
- On desktop, press `j` to focus the first card, then `e`.
- Tap `Undo` in the toast at the bottom of the screen, or press `u`.
- Choose `Done` in the `Choose a view` group to see what is done.

## Driving it with verify.mjs

Preconditions:

- A healthy run (`$V doctor "$RUN"` shows only `✓`).
- `$V open "$RUN" "/?view=inbox" --viewport mobile --fresh` reports `"status": "15 bookmarks"`.

- **Swipe.** Swipe the first card. Run `$V swipe "$RUN" --card 0`. The reply shows `"status": "14 bookmarks"` and 14 visible cards, and `$V wait "$RUN" --selector "[data-undo]"` succeeds.
- **Toast proof.** Run `$V snapshot "$RUN" mark-done-swipe` and `$V screenshot "$RUN" mark-done-swipe`. The snapshot has `button "Inbox 14" [pressed=true]`, `button "Done 1"`, the text `Marked done` and `button "Undo"`.
- **Undo.** Tap Undo. Run `$V click "$RUN" --name Undo`. The status goes back to `15 bookmarks`, and `$V eval "$RUN" 'localStorage.getItem("grok-digest:/:done")'` prints `"[]"`.
- **Short swipe.** Run `$V swipe "$RUN" --card 0 --distance 60`. The status stays `15 bookmarks` and no `[data-undo]` appears.
- **Done button.** Run `$V click "$RUN" --card 0 --name Done`. The status shows `14 bookmarks`, and the toast appears.
- **Toast timeout.** Wait out the toast. Run `$V wait "$RUN" --selector "[data-undo]" --gone`. It succeeds within about 5 seconds and the card stays hidden.
- **Persistence.** Reload without clearing. Run `$V open "$RUN" "/?view=done"`. The status is `1 bookmark` and the snapshot shows `button "Done 1" [pressed=true]`.
- **Unmark.** In Done, run `$V click "$RUN" --card 0 --name Done`. The status reads `Nothing marked done yet.`
- **Keyboard (desktop).** Run `$V open "$RUN" "/?view=inbox" --viewport desktop --fresh`, then `$V key "$RUN" j`. The reply's `focused` is the first card's id (`b-…`). Then `$V key "$RUN" e`: the status shows `14 bookmarks` and `focused` moves to the next card. Then `$V key "$RUN" u`: the status shows `15 bookmarks` again.
- **Desktop has no swipe hint.** At desktop, `$V eval "$RUN" '[...document.querySelectorAll("p")].some((p) => p.textContent.startsWith("Swipe") && p.checkVisibility())'` prints `false`.

## Gotchas

- `swipe` refuses to run on the desktop viewport. Swiping is touch-only, by design.
- In `All`, a done card stays visible but dimmed and its `Done` button has `aria-pressed="true"`. Count with the `Done` view instead.
- A swipe blocks clicks for 400ms. Don't chain an `eval` click right after one.
- Today's picks are cached per day. A card marked done stays in today's count (`n of 5 reviewed today`) rather than being replaced.
