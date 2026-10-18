# Grok Digest verification map

This directory is the maintained source for verifying what Grok Digest users see and do. Read this index before driving the app, then use the matching feature file as the recipe. Every command assumes `V=.agents/skills/verify-grok-digest/scripts/verify.mjs` from the repository root, and a `$RUN` printed by `$V launch`.

## Baseline preconditions

- `$V launch` with the default fixture: 15 bookmarks across all 7 topics, four marked `News`, one thread (`A dashboard redesign told across a three-post thread`, author `@thread_lab`, id `1000000000000000200`) whose images sit between its posts, and five entries titled `サンプル: a Tokyo meetup on local-first apps`.
- `$V doctor "$RUN"` prints only `✓` lines.
- Start every recipe with `$V open "$RUN" <path> --viewport <mobile|desktop> --fresh`, so no done marks, Later order or speed-reading settings carry over.
- Never drive a server this run did not start.

## Driving conventions

- Prefer accessible names (`--name "Inbox"`, `--name Undo`) and the data attributes listed in `SKILL.md`. Don't use coordinates or DOM position.
- Scope card actions with `--card <n>`, the n-th visible card from the top, counted from 0.
- Use `eval` only to read state. Taps, clicks, keys and swipes are the user path.
- Phone behavior is proved at `--viewport mobile` (touch input). Desktop behavior and regressions are proved at `--viewport desktop` (mouse and keyboard). The layout switches at 640px.

## Proof and skip reporting

- Capture the action and the resulting state: `snapshot` or `screenshot` before and after, named `<feature>-<step>-<state>`.
- Back up what's on screen with stored state: the `localStorage` keys, the clipboard, or the URL query.
- Name the feature file and the entry point (the button, key, swipe or CLI) used with each piece of evidence. `$RUN/evidence/journal.log` records the commands.
- Report an entry point you could not reach with the command and the unmet precondition. Never report one entry point as verified through another.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior, then exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify.mjs` (starting with `Preconditions:`), and `Gotchas`. Keep implementation details out. Name only user paths, stable handles, required state, commands and observable proof.

## Features

- [Mark bookmarks done](./mark-done.md): the Done button, `Show done`, swipes and flicks, keyboard triage and Undo.
- [Search and filter](./search-and-filter.md): the search field, mobile search icon, `/` key, topic chips, the `Sort and filter` menu, the pinned top row and the URL.
- [Read a card](./read-a-card.md): headlines on load, tap-to-open, the post's images and links, Copy, Open on X and linked cards.
- [Swipe mode](./swipe-mode.md): one card per screen with vertical swipes, swipe-left to done, Undo, tap to expand, speed reading and close.
- [RSS feeds](./feeds.md): the all-bookmarks feed and one feed per topic.
- [Validate data files](./validate-data.md): `grok-digest validate` on good and bad data.
- [Text size](./text-size.md): the `Aa` picker in the header, which scales the cards and swipe mode but not the controls, and is remembered.
- [Customize the page](./customize.md): `custom/config.json`, `custom/theme.css`, and ejected components.

Not mapped yet: the theme toggle (`Toggle dark mode`), opening the page from the home screen (only the manifest and icons are checkable here), and `grok-digest build` and `preview` under `BASE_PATH`.
