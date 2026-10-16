# Read mode

A reader can play the cards in the current view one at a time, full screen, without scrolling. Each card shows at the list's detail level, and its words light up one by one at an adjustable speed in words per minute, scrolling within the card when the text is long. When a card ends, the next one slides in. `Listen` reads the card aloud with the browser's voice and highlights along. The reader can skip, pause, mark a card done, and close, which leaves the list scrolled to the last card read.

## Sub-features

- `read-open` opens read mode from the round play button at the bottom right, or `p` on desktop, starting at the card at the top of the screen.
- `read-pace` highlights one word at a time, pauses longer after sentences and between sections, and times Japanese by its characters.
- `read-advance` moves to the next card when one ends, and shows an end screen with `Start over` and `Close` after the last.
- `read-skip` goes to the next card with a tap on the right third or a swipe up, and to the previous with a tap on the left third or a swipe down. Arrow keys and `j`/`k` do the same on desktop.
- `read-pause` pauses with `Pause`, a tap in the middle, Space (when no other button has focus; read mode opens with focus on `Pause`), or by holding a finger down. It also pauses when the page is hidden. With reduced motion, read mode opens paused.
- `read-done` marks the current card done with `Done`, `e`, or a swipe left, then moves on.
- `read-speed` changes the pace with the `Speed` slider (120 to 600 wpm) or `-` and `=`, and remembers it.
- `read-listen` toggles speech with `Listen` or `l`.
- `read-close` closes with the X button, `Close`, or Escape, and scrolls the list to the last card shown.

## How to get to it (user POV)

- Tap the round play button at the bottom right of the list (`Play cards one at a time`). On desktop press `p`.
- Inside read mode, use the buttons along the bottom, tap the left, middle or right of the card, or swipe.

## Driving it with verify.mjs

Preconditions:

- A healthy run with the default fixture.
- `$V open "$RUN" "/?view=inbox" --viewport mobile --fresh`. The list is at `Headline`, so each card plays only its title. Tap `Points` first to play summaries and key points too.

- **Open.** Run `$V click "$RUN" --name "Play cards one at a time"`. `dialog[open]` exists, named `Read mode`, its header counter (`dialog header span`) reads `1 / 15`, and the page behind no longer scrolls (`document.documentElement.style.overflow` is `"hidden"`). Within a second a word carries the highlight: `document.querySelector("dialog .bg-brand-soft[data-step]")` is not null. Take `$V screenshot "$RUN" read-mode-open`.
- **Skip.** Run `$V click "$RUN" --selector "[data-read-pager]" --across 0.9`. The counter reads `2 / 15`. With `--across 0.1` it reads `1 / 15` again.
- **Pause.** Run `$V click "$RUN" --selector "[data-read-pager]"` (the middle). The round button in the footer is now named `Play`, and the highlighted word stays put.
- **Done.** Run `$V click "$RUN" --selector "dialog button" --name Done`. `localStorage.getItem("grok-digest:/:done")` lists the first card's id, the card shows a `Done` badge, and the counter moves to `2 / 15`.
- **Speed.** Press `$V key "$RUN" =` three times. The slider (`dialog footer input`) reads `320`, and `localStorage.getItem("grok-digest:/:read-speed")` is `"320"`.
- **Advance.** Run `$V click "$RUN" --name Play` to play again. At `Headline` each card lasts a few seconds, so after `sleep 5` the counter has moved on by itself.
- **Close.** Run `$V key "$RUN" Escape`. No `dialog` remains, `document.documentElement.style.overflow` is `""`, and the status line shows `14 bookmarks` because the card marked done left the inbox.
- **Listen.** Real speech needs a device. In headless Chrome, read what the page sends by wrapping `speechSynthesis.speak` in an `eval` that records each utterance's `text`, `lang` and `rate`, then tap `Listen`. It sends an empty utterance first (unlocking speech on iOS), then the card's text from the highlighted word on, with `lang` `en-US` for English cards and `ja-JP` for cards with kana, and a `rate` that grows with the speed.

## Gotchas

- Read mode is a modal dialog, and the page's own buttons stay in the DOM behind it. Card buttons also named `Done` come later in the page, so scope with `--selector "dialog button"` to be sure of the target.
- Headless Chrome has no voices. `Listen` sends text that is never spoken, so no word boundaries or end events arrive and the card does not advance while listening. Only the text sent is checkable here.
- The pages are a vertical scroll-snap list. The counter changes when a scroll passes the halfway point, so read it about a second after a skip.
- Hold-to-pause starts after 300ms. The driver's taps are instant, so a tap never counts as a hold.
