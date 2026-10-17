# Search and filter

A reader narrows the list by typing a search across all bookmarks, or by picking a topic. The filter is kept in the address bar, so a filtered view can be reloaded or shared. On phones one row stays pinned at the top while scrolling: the topics scroll sideways in it, next to the `Detail` button and a search icon, and opening search turns the row into the search field. The views live in the bottom tab bar.

## Sub-features

- `search-desktop` searches from the always-visible `Search bookmarks` field and shows `<n> results in all bookmarks`.
- `search-mobile` opens the field from the `Search bookmarks` icon with the keyboard focused, and `Cancel` clears it and closes it.
- `search-slash` focuses search with the `/` key.
- `search-empty` shows `No bookmarks match your search.` for a query with no match.
- `topic-chip` filters by a topic chip. Tapping the chosen chip again, or `All topics`, clears it.
- `topic-row-scroll` scrolls the chosen chip into view in the one-row chip list on phones.
- `topic-row-sideways` lets the phone chip row move only sideways: a vertical or diagonal drag on it never shifts the chips up or down. Chrome does not show the old fault, so check a diagonal drag in Safari in the iOS Simulator. In Chrome, `getComputedStyle` on the row gives `overflowY` `hidden` and `touchAction` `pan-x`.
- `filter-url` mirrors the filters in `?q=`, `?topic=` and `?view=`, and restores them on load.
- `sticky-bar` keeps the one-row top bar at the top of a phone screen while scrolling, and the views in the bottom tab bar.

## How to get to it (user POV)

- Desktop: click the `Search all bookmarks` field above the views.
- Phone: tap the magnifier button (`Search bookmarks`) at the right end of the top row.
- Press `/` anywhere outside a text field.
- Tap a chip in the `Filter by topic` row.
- Open an address with `?q=`, `?topic=` or `?view=`.

## Driving it with verify.mjs

Preconditions:

- A healthy run.
- `$V open "$RUN" "/?view=all" --viewport mobile --fresh` reports `"status": "15 bookmarks"`.

- **Mobile search opens.** Run `$V click "$RUN" --name "Search bookmarks"`, then `$V eval "$RUN" 'document.activeElement.type'`. It prints `"search"`.
- **Match.** Run `$V type "$RUN" tokyo`. The status reads `5 results in all bookmarks`, and `$V eval "$RUN" 'location.search'` contains `q=tokyo`.
- **No match.** Replace the query: `$V click "$RUN" --name Cancel`, then `$V click "$RUN" --name "Search bookmarks"`, then `$V type "$RUN" volcano`. The status reads `No bookmarks match your search.`
- **Cancel.** Run `$V click "$RUN" --name Cancel`. The search field is hidden again (`$V eval "$RUN" 'document.querySelector("input[type=search]").checkVisibility()'` prints `false`), the status is back to `15 bookmarks`, and `q=` is gone from the URL.
- **Topic chip.** Run `$V click "$RUN" --name Design`. The status reads `3 bookmarks`, `location.search` contains `topic=design`, and the chip row has scrolled (`$V eval "$RUN" 'document.querySelector("fieldset[aria-label=\"Filter by topic\"]").scrollLeft'` is above 0). Take `$V screenshot "$RUN" search-topic-design`.
- **Clear topic.** Run `$V click "$RUN" --name Design` again. `topic=` leaves the URL and `All topics` is pressed.
- **Restore from URL.** Run `$V open "$RUN" "/?q=tokyo&view=all"`. The status reads `5 results in all bookmarks` and the search field is visible with `tokyo`.
- **Sticky bar.** With no search open, run `$V open "$RUN" "/?view=all" --viewport mobile`, then `$V eval "$RUN" 'scrollTo(0, 3000)'`, then `$V eval "$RUN" 'document.querySelector("fieldset[aria-label=\"Filter by topic\"]").getBoundingClientRect().top'`. It prints about `8`, and the views' tab bar (`nav[aria-label=Views]`) spans 745 to 812, the bottom of the screen. With search open, the search field takes the row at about `8` and the chips are hidden. Take `$V screenshot "$RUN" search-sticky-bar`.
- **Desktop.** Run `$V open "$RUN" "/" --viewport desktop --fresh`, then `$V key "$RUN" /` and `$V type "$RUN" tokyo`. The status shows results. The bar is not pinned: after `scrollTo(0, 3000)`, the views' `nav[aria-label=Views]` `top` is negative.

## Gotchas

- While a search is active, no view button is pressed, and choosing a view clears the search.
- On phones the field stays open while it holds text. Clearing it with the field's own ✕ and then leaving the field closes it.
- `type` goes to whatever has focus. Open the field before typing, or the characters trigger shortcuts.
- Chip counts depend on the fixture: Design has 3 cards, including the thread entry.
