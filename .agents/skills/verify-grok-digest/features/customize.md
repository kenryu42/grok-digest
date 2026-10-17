# Customize the page

A site owner (or their Grok bot) changes the page from a `custom/` folder next to `data/`: settings in `custom/config.json`, CSS in `custom/theme.css`, and ejected components in `custom/components/`. Everything left alone stays as released.

## Sub-features

- `config-title` names the page in the header, the tab and the home screen app.
- `config-default-view` opens the page on another view without `?view=` in the address.
- `config-detail` sets the starting Detail level on phones and on wider screens.
- `config-swipe-mode` hides the Swipe button, the `s` shortcut and its keyboard hint.
- `config-review-size` sets how many bookmarks Today brings back.
- `theme` overrides the color variables, in light and dark.
- `eject` copies `Header`, `Footer` or `BookmarkCard` into `custom/components/`, where edits show on the page.
- `eject-controls` copies a part of the controls (`ControlsLayout`, `ViewTabs`, `SearchField`, `TopicChips`, `DetailControl`, `StatusLine`, `KeyboardHints`, `UndoToast`, `DeleteQueue`) as a `.tsx` file. The controls keep working with any of them ejected.
- `eject-swipe` copies a part of swipe mode (`SwipeHeader`, `SwipeCard`, `SwipeFooter`, `SwipeEnd`). Paging, swipe-to-done, Undo, speed reading and the keys keep working with any of them ejected.
- `merge` brings a newer default into an ejected component (covered by `test/custom.test.ts`, which simulates an older release).

## How to get to it (user POV)

- The owner asks the Grok bot, which follows "Change the page" in `BOT.md`.
- By hand in a site repository: edit the files in `custom/`, and run `bunx grok-digest eject <Component>` or `bunx grok-digest merge`.

## Driving it with verify.mjs

Preconditions:

- A fresh `$V launch`. The dev server restarts by itself when a file appears in or disappears from `$RUN/site/custom/`, and reloads when `custom/config.json` changes. Wait about 5 seconds after writing files.

- **Write the customization.** From `$RUN/site`, run `node <checkout>/src/cli.ts eject BookmarkCard`, change `Open on X` to `Read on X` in `custom/components/BookmarkCard.astro`, write `custom/theme.css` with `:root { --brand: oklch(0.6 0.2 250); }` and `.dark { --brand: oklch(0.7 0.18 250); }`, and write `custom/config.json` with `{"title":"Reading Room","defaultView":"all","detail":{"phone":"points"},"swipeMode":false}`.
- **Phone.** `$V open "$RUN" / --viewport mobile --fresh`. The status reads `15 bookmarks` with `All 15` pressed and no `?view=`, the header and `document.title` read `Reading Room`, cards start at `data-depth="points"`, the tab bar has four buttons and no `Swipe through cards`, and cards link `Read on X`. `$V swipe "$RUN" --card 0` still marks the card done (`grok-digest:/:done`), and `$V key "$RUN" s` opens no dialog.
- **Controls.** From `$RUN/site`, eject every control part, change `Today` to `Review` in `custom/components/ViewTabs.tsx`'s labels and drop `<KeyboardHints controls={controls} />` from `custom/components/ControlsLayout.tsx`. On a phone the first tab reads `Review`, and views, topic chips, search (`Search bookmarks`, then `type`), the `Detail` button and slider, Done, and `Undo` all work as before. On desktop the shortcut hint is gone and `j`, `e`, `u`, `/` still work.
- **Swipe mode.** From `$RUN/site`, eject the four swipe parts and add `<p data-mine>{page.card.querySelectorAll("figure img").length} images</p>` under the headline in `custom/components/SwipeCard.tsx`. Open swipe mode with `Swipe through cards`: the thread card (`A dashboard redesign told across a three-post thread`) reads `3 images`, as many as its card in the list shows. Then follow [Swipe mode](./swipe-mode.md): `$V swipe "$RUN" --selector "[data-swipe-pager]" --up --distance 300` pages, a left swipe marks done with `Undo`, `Speed read` plays, and `Escape` closes.
- **Desktop.** `$V open "$RUN" / --viewport desktop --fresh`. Cards start at `full`, and the keyboard hint has no `s swipe`.
- **Theme.** Read `getComputedStyle(document.documentElement).getPropertyValue("--brand")`. It is the `.dark` value when the page is dark, otherwise the `:root` one.

## Gotchas

- The run's site is deleted by `$V stop`, so the `custom/` folder goes with it.
- Today's picks are cached per day in `localStorage`, so a new `reviewSize` shows only with `--fresh` or the next day.
