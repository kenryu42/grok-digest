# Customizing Grok Digest components

Reference for editing a component ejected with `bunx grok-digest eject <Component>`. The rules for when and how to change the page are in `BOT.md` under "Change the page".

The page's parts are [Astro components](https://docs.astro.build/en/basics/astro-components/), ejected as `.astro` files:

| Component      | What it is                                              | It gets                      |
| -------------- | ------------------------------------------------------- | ---------------------------- |
| `Header`       | The mascot, the title, and the dark mode button.        | `title`, from the settings   |
| `Footer`       | The feed links and the notes at the bottom.             | Nothing                      |
| `BookmarkCard` | One bookmark's card. The page renders one per bookmark. | `bookmark`, the parsed entry |

The controls above the cards are React components, ejected as `.tsx` files. Each gets one prop, `controls`, and must keep its named export, such as `export function ViewTabs`:

| Component        | What it is                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `ControlsLayout` | Arranges the parts below, plus the phone-only Detail and search buttons. Leave a part out to hide it. |
| `ViewTabs`       | The Today, Inbox, Done, and All buttons (the bottom bar on phones) and the Swipe button.              |
| `SearchField`    | The search box and its Cancel button.                                                                 |
| `TopicChips`     | The topic filter chips.                                                                               |
| `DetailControl`  | The Detail slider: Minimal, Light, Deep, Full.                                                        |
| `StatusLine`     | The line that counts bookmarks and today's review.                                                    |
| `KeyboardHints`  | The keyboard shortcuts on desktop and the swipe tip on phones.                                        |
| `UndoToast`      | The "Marked done" message with Undo.                                                                  |

`controls` holds the page's state and what changes it. The package keeps owning the behavior: filtering, the done marks, Today's picks, the keyboard shortcuts, and swiping cards. A control only shows the state and calls these:

| Field                                                           | What it is                                                                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view`, `counts`, `chooseView(view)`                            | The open view (`"today"`, `"inbox"`, `"done"`, `"all"`), each view's count, and opening one.                                                                        |
| `query`, `searching`, `setQuery(text)`                          | The search text, whether it is not empty, and changing it.                                                                                                          |
| `searchShown`, `openSearch()`, `closeSearch()`, `leaveSearch()` | Whether the search box shows on a phone; open it, clear and close it, or close it when empty.                                                                       |
| `topic`, `topics`, `chooseTopic(topic)`                         | The chosen topic or `null`, the topics in use, and choosing one (the chosen one again, or `null`, shows all).                                                       |
| `depth`, `setDepth(depth)`                                      | The Detail level: `"headline"`, `"gist"`, `"points"`, or `"full"`.                                                                                                  |
| `detailShown`, `toggleDetail()`                                 | Whether the Detail slider shows on a phone, and showing or hiding it.                                                                                               |
| `shown`, `reviewed`, `reviewSize`                               | How many cards show, how many of today's picks are done, and how many there are.                                                                                    |
| `undoPending`, `undo()`                                         | Whether a card was just marked done, and undoing it.                                                                                                                |
| `openSwipe()`, `settings`                                       | Opening swipe mode, and the settings from `custom/config.json`.                                                                                                     |
| `searchRef`, `topicsRef`, `barRef`                              | Put these on the search input, the chips' container, and the top bar so `/` focuses search, the chosen chip scrolls into view, and opened cards land below the bar. |

In `ControlsLayout`, import the other parts from `virtual:grok-digest/components/<Component>`, as the copy does, so that a part you eject later still shows.

Swipe mode shows one card per screen. The package keeps its frame: the full-screen dialog, the pages that snap one at a time, the swipe that marks a card done, and the keyboard keys. Eject these parts to change what is inside it. Each is a React component that gets one prop, `swipe`, and must keep its named export:

| Component     | What it is                                                                                        | It also gets                                   |
| ------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `SwipeHeader` | The top bar: Close, the "3 / 12" counter, the Speed read button, and the reading progress.        |                                                |
| `SwipeCard`   | What one card shows: topic, author, headline, summary, key points, "Try:", and the original post. | `page`, and `current` when it is the open card |
| `SwipeFooter` | The bottom bar: the speed reading controls, Copy, Done, Open on X, and the "Marked done" message. |                                                |
| `SwipeEnd`    | The screen after the last card, with Start over and Close.                                        |                                                |

`page` is one card: `id`, `author`, `topic`, `url`, `headline`, and `blocks`, its text in order. Each block has a `kind` (`"summary"`, `"point"`, `"action"`, or `"post"`) and its `text`. `page.card` is the bookmark's card element on the page, so `SwipeCard` can show anything that card shows, such as its images: `page.card.querySelectorAll("figure img")`.

`swipe` holds swipe mode's state and what changes it:

| Field                                                 | What it is                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pages`, `current`, `page`, `goTo(index)`, `close()`  | Every card, the open card's index and its `page`, moving to a card (`pages.length` is the end screen), and closing swipe mode. |
| `done`, `pageDone`, `toggleDone()`                    | The ids marked done, whether the open card is, and marking it done or back to the inbox.                                       |
| `undoPending`, `undo()`                               | Whether a card was just marked done, and undoing it.                                                                           |
| `copied`, `copy()`                                    | Whether the open card was just copied, and copying it for an AI assistant.                                                     |
| `expanded`, `toggleExpanded(id)`                      | The ids whose original post is open, and opening or closing one.                                                               |
| `speedOn`, `toggleSpeed()`, `reading`                 | Whether speed reading is on, turning it on or off, and whether the open card is being speed read.                              |
| `playing`, `starting`, `finished`, `togglePlaying()`  | Speed reading's state, and playing, pausing, or reading again.                                                                 |
| `speed`, `changeSpeed(wpm)`, `plan`, `step`, `blocks` | Words per minute (200 to 600), the words to read, the word shown, and the open card's blocks.                                  |

A tap on the card outside its buttons and links opens or closes the original post, or pauses speed reading. Buttons and links in `SwipeCard` get their own clicks.
