const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const NEAR_VIEWPORT = { above: 0.25, below: 1 };
const RESIZE = { transition: "500ms var(--ease-spring)", ms: 500 };
const EXIT = { transition: "280ms cubic-bezier(0.2, 0, 0, 1)", ms: 280 };
const MOVED_PROPERTIES = ["height", "margin-bottom", "opacity"];
const UNCHANGED_HEIGHT = 1;

export type Anchor = { element: HTMLElement; top: number };

type Motion = { timer: ReturnType<typeof setTimeout>; leaving: boolean };

type Frame = { height: string; marginBottom: string; opacity: string };

const moving = new Map<HTMLElement, Motion>();

export function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function cardsInList(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-bookmark-id]")];
}

function nearViewport(card: HTMLElement): boolean {
  const { top, bottom } = card.getBoundingClientRect();
  return bottom > -window.innerHeight * NEAR_VIEWPORT.above && top < window.innerHeight * NEAR_VIEWPORT.below;
}

function listGap(): number {
  const list = document.querySelector("[data-bookmark-list]");
  return list === null ? 0 : Number.parseFloat(getComputedStyle(list).rowGap) || 0;
}

export function stopMotion(card: HTMLElement): void {
  const motion = moving.get(card);
  if (motion === undefined) return;
  clearTimeout(motion.timer);
  moving.delete(card);
  Object.assign(card.style, { height: "", marginBottom: "", opacity: "", overflow: "", transition: "" });
  card.inert = false;
  if (motion.leaving) card.hidden = true;
}

function move(card: HTMLElement, from: Frame, to: Frame, timing: typeof RESIZE, leaving: boolean): void {
  Object.assign(card.style, { ...from, overflow: "clip", transition: "none" });
  card.getBoundingClientRect();
  card.style.transition = MOVED_PROPERTIES.map((property) => `${property} ${timing.transition}`).join(", ");
  Object.assign(card.style, to);
  moving.set(card, { timer: setTimeout(() => stopMotion(card), timing.ms), leaving });
}

export function morph(update: () => void, anchor?: Anchor): Promise<void> {
  const apply = (): void => {
    update();
    if (anchor !== undefined) window.scrollBy(0, anchor.element.getBoundingClientRect().top - anchor.top);
  };
  if (prefersReducedMotion() || document.querySelector("dialog[open]") !== null) {
    for (const card of moving.keys()) stopMotion(card);
    apply();
    return Promise.resolve();
  }
  const shownBefore = new Set(cardsInList().filter((card) => !card.hidden && moving.get(card)?.leaving !== true));
  const before = new Map(
    cardsInList()
      .filter((card) => !card.hidden && moving.get(card)?.leaving !== true && nearViewport(card))
      .map((card) => [card, card.getBoundingClientRect().height]),
  );
  for (const card of moving.keys()) stopMotion(card);
  apply();
  const gap = `${-listGap()}px`;
  const all = cardsInList();
  const firstMoving = anchor === undefined ? 0 : Math.max(all.indexOf(anchor.element), 0);
  let longest = 0;
  all.forEach((card, index) => {
    const was = before.get(card);
    if (was !== undefined && card.hidden) {
      card.hidden = false;
      card.inert = true;
      move(
        card,
        { height: `${was}px`, marginBottom: "0px", opacity: "1" },
        { height: "0px", marginBottom: gap, opacity: "0" },
        EXIT,
        true,
      );
      longest = Math.max(longest, EXIT.ms);
      return;
    }
    if (card.hidden || index < firstMoving) return;
    if (was === undefined) {
      if (shownBefore.has(card) || !nearViewport(card)) return;
      const height = card.getBoundingClientRect().height;
      move(
        card,
        { height: "0px", marginBottom: gap, opacity: "0" },
        { height: `${height}px`, marginBottom: "0px", opacity: "1" },
        RESIZE,
        false,
      );
      longest = Math.max(longest, RESIZE.ms);
      return;
    }
    const height = card.getBoundingClientRect().height;
    if (Math.abs(height - was) <= UNCHANGED_HEIGHT) return;
    move(
      card,
      { height: `${was}px`, marginBottom: "0px", opacity: "1" },
      { height: `${height}px`, marginBottom: "0px", opacity: "1" },
      RESIZE,
      false,
    );
    longest = Math.max(longest, RESIZE.ms);
  });
  return new Promise((settled) => {
    setTimeout(settled, longest);
  });
}
