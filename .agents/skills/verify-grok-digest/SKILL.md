---
name: verify-grok-digest
description: "Use in the grok-digest repository to prove a change works in the real app before calling it done: launches the Grok Digest page from this checkout's source on fixture data, drives it in headless Chrome with real touch or mouse input at phone (375×812) or desktop size, and saves screenshots, accessibility snapshots and a journal as evidence. Also covers the RSS feeds and the `grok-digest validate` CLI. Reach for it after changing anything under src/, or when asked to run, check, screenshot or verify the site."
---

# Verify Grok Digest

Grok Digest is one static page of bookmark cards (an Astro page with a React island for the controls), plus RSS feeds and a `grok-digest` CLI. Users touch three surfaces:

- **The page** (primary): search, views (Today, Inbox, Done, All; a bottom tab bar on phones), topic chips, a `Detail` slider (`Minimal`, `Light`, `Deep`, `Full`) that sets how much each card shows, cards that open with a tap and carry Copy, Done and Open on X, swipe-to-done on touch, a full-screen swipe mode with optional speed reading, a text size picker (`Aa`) in the header, and keyboard shortcuts on desktop.
- **The feeds**: `/rss.xml` and `/rss/<topic>.xml`.
- **The CLI**: `grok-digest validate`, `build`, `dev` and `preview`.

Everything below goes through one helper, `scripts/verify.mjs` (Node 22.18 or newer, which runs `src/cli.ts` directly; no npm dependencies). It runs on macOS and Linux and needs Google Chrome or Chromium (set `CHROME_BIN` when Chrome is not in a standard location), plus `ps` and `lsof` to check which processes belong to a run. On Linux the working-directory check reads `/proc`, but `doctor`'s port check still uses `lsof`. When a tool is missing, `doctor` and `stop` fail and name it rather than guess. Run it from the repository root:

```bash
V=.agents/skills/verify-grok-digest/scripts/verify.mjs
```

The feature map in [`features/README.md`](features/README.md) holds the recipes. Read it, then the file for the feature you changed.

## Launch

```bash
$V launch                  # phone viewport (default)
$V launch --viewport desktop
$V launch --data path/to/data-dir   # your own bookmarks.json instead of the fixture
```

`launch` makes a fresh run directory under `$TMPDIR/grok-digest-verify/<run-id>/`. Into it, it copies the data (by default the 15-bookmark fixture in `fixtures/data/`), builds a throwaway site that links this checkout, and starts `node src/cli.ts dev` there. Pages are served from this checkout's `src/` with no build step, so edits are live. Then it starts a headless Chrome with its own profile, and a small driver process that holds the browser session. It prints `RUN=` as soon as the run directory exists, then returns only once the dev server has answered with rendered cards and the driver is ready, printing the rest:

```text
RUN=/…/grok-digest-verify/<run-id>
URL=http://localhost:4321
EVIDENCE=/…/grok-digest-verify/<run-id>/evidence
```

Pass `$RUN` to every later command. Runs are isolated: each gets its own site directory, Chrome profile and port. Astro moves to 4322, 4323 and so on when 4321 is taken, so the printed `URL` is the truth. Two runs can drive side by side. Never drive a dev server this skill did not start, such as a `bun run dev` already running in the user's terminal.

The first `open` after launch loads the page. Until then the browser shows `about:blank`.

## Doctor

Run this first, and whenever anything looks off:

```bash
$V doctor "$RUN"
```

It changes nothing (not even the journal) and prints each check as it goes. It checks that the run is marked running, and that the dev server, driver and Chrome processes are alive and are the ones this run started (same process group, and the run's own site directory, run directory or Chrome profile). It also checks that the port's listener belongs to this run's dev server. It also checks that the page title is `Grok Digest` and that the page serves every seeded bookmark. It prints which checkout and commit are being served, flagging uncommitted changes, and confirms the browser driver answers with its Chrome version, viewport and current page. Exit code 1 and a `✖` line mean the run isn't worth driving: stop it and launch a new one.

## Drive

Every command sends real input through Chrome's DevTools protocol. On the `mobile` viewport (375×812, touch emulation, `pointer: coarse`) clicks are touch taps. On `desktop` (1280×900) they are mouse clicks. Each command waits for the page to settle and prints JSON with the current URL, the status line (`p[aria-live]`, such as `14 bookmarks`) and the number of visible cards.

```bash
$V open "$RUN" "/?view=inbox" --viewport mobile --fresh
$V click "$RUN" --name "Inbox"                # a view button; names match exactly, then by prefix
$V click "$RUN" --card 0 --name Done          # scoped to the first visible card
$V click "$RUN" --name "Search bookmarks"     # mobile search icon; on desktop this names the input
$V click "$RUN" --name Detail                # phones: open the detail slider from the top row
$V type "$RUN" tokyo                          # types into whatever has focus
$V key "$RUN" j                               # also e, u, c, o, p, 1-4, /, =, -, Space, Escape, Enter, Tab, ArrowRight…
$V click "$RUN" --selector '[data-depth-stop="points"]'   # a Detail slider stop (Deep)
$V swipe "$RUN" --selector "[data-swipe-pager]" --up --distance 300   # next card in swipe mode
$V swipe "$RUN" --card 0                      # a flick: 160px left in 128ms
$V swipe "$RUN" --card 0 --distance 60 --duration 600     # a short, slow drag
$V wait "$RUN" --selector "[data-undo]"       # or --gone
$V eval "$RUN" 'document.querySelector("output").textContent'
```

- `open [path] [--viewport mobile|desktop] [--fresh]` always does a full page load, even when only the `#hash` differs (it passes through `about:blank`), and waits until the island has hydrated (`[data-bookmark-list][data-ready]`). `--fresh` clears the site's storage first: done marks, the cached Today picks, the detail level and the speed-reading settings. Always use `--fresh` to start a recipe, and to see the first-visit defaults. Changing the viewport only takes effect on the `open`, so cards start at `Minimal` only when a phone-sized page loads.
- `click` finds a visible `button, a, summary, input, label` by accessible name (the `aria-label`, otherwise its text, whitespace collapsed). `--selector <css>` changes the candidate set, `--card <n>` scopes to the n-th visible card (0-based), `--nth` picks among several matches, and `--across <0-1>` taps at that share of the element's width instead of its middle. On a miss it lists the visible names, so read the error rather than guessing.
- `swipe` drags the n-th card left from near its right edge. `--selector <css>` drags from the middle of any element instead, `--up` drags upward (a vertical swipe), `--distance=-<px>` (with `=`) drags the other way, and `--duration <ms>` sets the speed. Each touch step costs about 17ms, so very short durations are capped by that.
- If Chrome dies, the driver exits too, and every command fails with `did not answer … Run doctor.` instead of hanging. Each command gives up after 2 minutes.
- `eval` is for **reading** state (it runs as an async REPL, so `await` works). Never use it to perform the user action under test. Click, type, key and swipe are the user path.

Stable handles in this app:

| What         | Handle                                                                                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A card       | `li[data-bookmark-id]`, id `b-<bookmark id>`; hidden cards have the `hidden` attribute                                                                                                                                                                                                                                    |
| Card state   | `data-done` and `data-depth` (`headline`, `gist`, `points`, `full` = Minimal, Light, Deep, Full) on the `li`                                                                                                                                                                                                              |
| Card title   | `h2` holding a button (`data-card-toggle`) with `aria-expanded`; tapping the header opens                                                                                                                                                                                                                                 |
| Detail       | phone button `Detail: <level>` (`aria-expanded`); range input `Detail`; stops `[data-depth-stop=<level>]`                                                                                                                                                                                                                 |
| Swipe mode   | button `Swipe through cards`; `dialog` named `Swipe mode`, pager `[data-swipe-pager]`, current page `[data-swipe-page][data-current]`, counter `[data-swipe-counter]`                                                                                                                                                     |
| Swipe inside | `Close swipe mode`, `Speed read` (`aria-pressed`), `Play`/`Pause`/`Read again`, `Copy`, `Done`, `Open on X`; behind the card `[data-swipe-tray=left]` (`Later`, `Done`) and `[data-swipe-tray=right]` (`Share`, `Copy`), shown by `data-swiping` on the page; word `[data-speed-word]`, paused text `[data-speed-paused]` |
| View buttons | `nav[aria-label=Views]` (bottom tab bar on phones), group `Choose a view`, buttons named `Today 5`, `Inbox 14` and so on, with `aria-pressed`                                                                                                                                                                             |
| Topic chips  | group `Filter by topic`, buttons `All topics`, `AI agents` and so on, with `aria-pressed`                                                                                                                                                                                                                                 |
| Card buttons | `Copy` (`data-copy`), `Done` (`data-done-toggle`, `aria-pressed`), `Later` (`data-later`, desktop), link `Open on X`; behind the card `[data-swipe-action=later]` and `[data-swipe-action=done]`, shown while the `li` has `data-actions` or `data-swiping`                                                               |
| Undo toast   | the `output` element, button `Undo` (`data-undo`)                                                                                                                                                                                                                                                                         |
| Status line  | `p[aria-live]`                                                                                                                                                                                                                                                                                                            |
| Text size    | header button `Text size` (`aria-expanded`), group `Choose a text size` with `Small`, `Default`, `Large`, `Larger` (`aria-pressed`, `data-text-size-option`); `data-text-size` on `<html>`, absent at `Default`                                                                                                           |
| Stored state | `localStorage` keys `grok-digest:/:done`, `:later`, `:review`, `:cards-depth`, `:speed-reading-wpm`; `grok-digest:text-size` and `grok-digest:theme` for every site                                                                                                                                                       |

## Evidence

```bash
$V screenshot "$RUN" mark-done-2-after-swipe          # evidence/<name>.png, the viewport
$V screenshot "$RUN" whole-page --full                # the whole page
$V snapshot "$RUN" mark-done-2-after-swipe            # evidence/<name>.aria.txt
```

Everything goes to `$RUN/evidence/`. Every driver command and its reply is also appended to `$RUN/evidence/journal.log`, which is the record of the actions you took. Name files `<feature>-<step>-<state>` so they sort in order.

Proof standards:

- Exercise the real user path (taps, clicks, keys, swipes) on the real page. Don't call internal setters, write `localStorage` to fake a state, or use `eval` to click.
- Capture the action and the resulting state: a screenshot or snapshot before, and another after.
- Verify side effects as well as the screen. Done marks persist in `localStorage` (`grok-digest:/:done`), Copy fills the clipboard (`await navigator.clipboard.readText()`; the driver grants clipboard access on `open`), and the URL query (`?q=`, `?topic=`, `?view=`) follows the filters. Reload with `open` (no `--fresh`) to prove that a state survives.
- Prove a phone change at `--viewport mobile` and check that desktop did not regress at `--viewport desktop`. The layout switches at 640px.
- Report a journey that can't reach its end state as a failure, with the command and what was missing. Never weaken it to pass.

## Cleanup

```bash
$V stop "$RUN"
```

`stop` sends SIGTERM to the process groups this run started (Chrome, the driver and the dev server), and SIGKILL after 10 seconds. It never kills by process name. Before signalling a pid from `$RUN/state.json`, it checks that the pid still leads its own process group and still runs this run's command, so a reused pid is left alone and reported. If any of its own processes survive SIGKILL, `stop` fails, names them, and leaves the run marked running so you can run it again. A second `stop` on a stopped run does nothing. It then deletes `$RUN/site` and `$RUN/chrome-profile`, and keeps `$RUN/evidence/`, `$RUN/logs/` and `$RUN/state.json` (marked `stopped`). Run `stop` after every run, including failed ones, so no ports or Chrome processes are left behind. Evidence stays under `$TMPDIR/grok-digest-verify/` until the OS clears its temp directory. Copy it elsewhere if it must last.

If `launch` fails partway, read `$RUN/logs/dev.log`, `driver.log` and `chrome.log`, then still run `$V stop "$RUN"`.

## Gotchas

- The fixture's images point at made-up `pbs.twimg.com` addresses (the schema only allows that host), so they render as broken images and Chrome makes requests to `pbs.twimg.com`. Check image layout through classes and the boxes, not the pixels. Use `--data` with real media URLs to see real images.
- Today's picks depend on the browser's clock and the fixture's `saved_at` dates, and they are cached per day in `localStorage`. Counts in the `Today` button change from day to day. Assert on relationships (a picked card is visible in Today) rather than fixed numbers.
- Headless Chrome follows the host's light or dark setting, and the page follows the system theme unless the theme toggle was used. Screenshots may come out dark.
- Changing the detail level, opening a card, and marking one done animate for about half a second. Wait about 0.6 seconds before measuring positions or taking a screenshot.
- A swipe blocks every click for 400ms afterwards, by design. The helper's settle time covers that between commands, but don't fire `eval` clicks right after a swipe.
- `type` inserts text into the focused element. Focus the search field first: tap `Search bookmarks` on mobile, or press `/`.
- The Astro dev toolbar is part of dev pages (a pill at the bottom). It is not part of the product. Ignore it in screenshots.
