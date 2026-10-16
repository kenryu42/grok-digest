# Text size

A reader can make the text on the cards and in swipe mode smaller or bigger from the `Aa` button next to the dark mode button. It opens a row of four `A`s, from small to large: `Small` (90%), `Default`, `Large` (115%) and `Larger` (130%). The chosen one is highlighted, and the cards change size at once. The page's controls (views, search, topic chips, `Detail`, the tab bar and swipe mode's header and footer) keep their size. The choice is kept in the browser for every Grok Digest site and applies before the page first draws, so the text never jumps on load. A tap outside the row or Escape closes it.

## Sub-features

- `text-size-pick` sets the size from the `Aa` row. The pressed `A` shows the current size, and it stays open so sizes can be compared.
- `text-size-scope` scales every card's text, including its buttons and badges, and swipe mode's cards and speed-reading word. The controls keep their size.
- `text-size-remember` keeps the size across reloads. `Default` clears the stored value.
- `text-size-close` closes the row with a tap outside it or Escape.

## How to get to it (user POV)

- Tap the `Aa` button at the top right, next to the sun or moon, then tap one of the four `A`s.

## Driving it with verify.mjs

Preconditions:

- A healthy run with the default fixture.
- `$V open "$RUN" "/?view=all" --viewport mobile --fresh`.

- **Default.** `document.documentElement.dataset.textSize` is `undefined`, and the first card's `[data-read-summary]` has a computed `fontSize` of `17px`.
- **Open.** Run `$V click "$RUN" --name "Text size"`. Its `aria-expanded` is `true`, the group `Choose a text size` shows, and only `Default` has `aria-pressed="true"`. Take `$V screenshot "$RUN" text-size-open`.
- **Larger.** Run `$V click "$RUN" --name Larger`. `<html>` has `data-text-size="larger"`, `localStorage.getItem("grok-digest:text-size")` is `"larger"`, the summary is `22.1px` and the card title (`[data-card-toggle]`) `26px`, while the first `nav[aria-label=Views] button` stays `11px`. Only `Larger` is pressed. Take `$V screenshot "$RUN" text-size-larger`.
- **Close.** `$V key "$RUN" Escape` removes the group. Opening it again and tapping a card's `Copy` removes it as well.
- **Reload.** `$V open "$RUN" "/?view=all"` (no `--fresh`) still shows `data-text-size="larger"` and a `22.1px` summary.
- **Swipe mode.** Run `$V click "$RUN" --name "Swipe through cards"`. The current card's `h2` is `28.6px`. Turn on `Speed read`: `[data-speed-word]` is `46.8px`. Swiping to the next card still works.
- **Back to Default.** Open the row and run `$V click "$RUN" --name Default`. `data-text-size` is gone and the stored value is `null`.
- **Desktop.** Repeat **Open** and pick `Small` at `--viewport desktop`: the summary is `15.3px` and the search field stays `14px`.

## Gotchas

- `--fresh` clears the stored size, so every recipe starts at `Default`.
- The four `A`s are named by `aria-label` (`Small` and so on), not by their visible text.
- A card that changes size moves the cards below it. Read positions after the change, not across it.
