# Search and filter

A reader narrows the list by typing a search across all bookmarks, by picking a topic, or from the `Sort and filter` menu, which orders the list (`Newest` or `Oldest` saved) or shows done bookmarks. The list opens on what is not done, newest saved first. The filters are kept in the address bar, so a filtered list can be reloaded or shared. On phones one row stays pinned at the top while scrolling: the topics scroll sideways in it, next to the `Sort and filter` button and a search icon, and opening search turns the row into the search field. There is no bottom bar.

## Sub-features

- `search-desktop` searches from the always-visible `Search bookmarks` field and shows `<n> results in all bookmarks`.
- `search-mobile` opens the field from the `Search bookmarks` icon with the keyboard focused, and `Cancel` clears it and closes it.
- `search-slash` focuses search with the `/` key.
- `search-empty` shows `No bookmarks match your search.` for a query with no match.
- `topic-chip` filters by a topic chip. Tapping the chosen chip again, or `All topics`, clears it.
- `sort` reorders the cards from `Sort by` in the `Sort and filter` menu, scrolls back to the top, and marks the button with a dot while it is not `Newest`.
- `filter-done` shows done bookmarks, dimmed, with `Show done`. A search ignores it.
- `filter-menu` opens below its button on desktop and full width under the top row on phones, floats over the list without moving it, and closes on a tap outside it or `Escape`.
- `topic-row-scroll` scrolls the chosen chip into view in the one-row chip list on phones.
- `topic-row-sideways` lets the phone chip row move only sideways: a vertical or diagonal drag on it never shifts the chips up or down. Chrome does not show the old fault, so check a diagonal drag in Safari in the iOS Simulator. In Chrome, `getComputedStyle` on the row gives `overflowY` `hidden` and `touchAction` `pan-x`.
- `filter-url` mirrors the filters in `?q=`, `?topic=`, `?sort=` and `?done=show`, and restores them on load.
- `sticky-bar` keeps the one-row top bar at the top of a phone screen while scrolling.

## How to get to it (user POV)

- Desktop: click the `Search all bookmarks` field above the topics, or the `Sort and filter` button at the end of the topic row.
- Phone: tap the magnifier button (`Search bookmarks`) at the right end of the top row, or the `Sort and filter` button left of it.
- Press `/` anywhere outside a text field.
- Tap a chip in the `Filter by topic` row.
- Open an address with `?q=`, `?topic=`, `?sort=` or `?done=show`.

## Driving it with verify.mjs

Preconditions:

- A healthy run.
- `$V open "$RUN" / --viewport mobile --fresh` reports `"status": "15 bookmarks to read"`.

- **Mobile search opens.** Run `$V click "$RUN" --name "Search bookmarks"`, then `$V eval "$RUN" 'document.activeElement.type'`. It prints `"search"`.
- **Match.** Run `$V type "$RUN" tokyo`. The status reads `5 results in all bookmarks`, and `$V eval "$RUN" 'location.search'` contains `q=tokyo`.
- **No match.** Replace the query: `$V click "$RUN" --name Cancel`, then `$V click "$RUN" --name "Search bookmarks"`, then `$V type "$RUN" volcano`. The status reads `No bookmarks match your search.`
- **Cancel.** Run `$V click "$RUN" --name Cancel`. The search field is hidden again (`$V eval "$RUN" 'document.querySelector("input[type=search]").checkVisibility()'` prints `false`), the status is back to `15 bookmarks to read`, and `q=` is gone from the URL.
- **Topic chip.** Run `$V click "$RUN" --name Design`. The status reads `3 bookmarks to read`, `location.search` contains `topic=design`, and the chip row has scrolled (`$V eval "$RUN" 'document.querySelector("fieldset[aria-label=\"Filter by topic\"]").scrollLeft'` is above 0). Take `$V screenshot "$RUN" search-topic-design`.
- **Clear topic.** Run `$V click "$RUN" --name Design` again. `topic=` leaves the URL and `All topics` is pressed.
- **Sort.** Run `$V click "$RUN" --name "Sort and filter"`, then `$V click "$RUN" --name Oldest`. `location.search` is `?sort=oldest`, and the cards' first `time` (`[...document.querySelectorAll("[data-bookmark-id]:not([hidden])")].map((c) => c.querySelector("time").dateTime)`) now rises from the oldest save. Take `$V screenshot "$RUN" search-sort-menu` with the menu open: it covers the top of the list without pushing it down.
- **Restore from URL.** Run `$V open "$RUN" "/?q=tokyo"`. The status reads `5 results in all bookmarks` and the search field is visible with `tokyo`.
- **Sticky bar.** With no search open, run `$V open "$RUN" / --viewport mobile`, then `$V eval "$RUN" 'scrollTo(0, 3000)'`, then `$V eval "$RUN" 'document.querySelector("fieldset[aria-label=\"Filter by topic\"]").getBoundingClientRect().top'`. It prints about `8`. With search open, the search field takes the row at about `8` and the chips are hidden. Take `$V screenshot "$RUN" search-sticky-bar`.
- **Desktop.** Run `$V open "$RUN" "/" --viewport desktop --fresh`, then `$V key "$RUN" /` and `$V type "$RUN" tokyo`. The status shows results. The bar is not pinned: after `scrollTo(0, 3000)`, the search field's `top` is negative. `Sort and filter` opens its menu right under the button, right-aligned with it.

## Gotchas

- While a search is active, the status reads `<n> results in all bookmarks`: it includes done cards in the chosen topic whatever the menu says.
- On phones the field stays open while it holds text. Clearing it with the field's own ✕ and then leaving the field closes it.
- `type` goes to whatever has focus. Open the field before typing, or the characters trigger shortcuts.
- Chip counts depend on the fixture: Design has 3 cards, including the thread entry.
