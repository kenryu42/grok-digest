const X_STATUS_URL = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/\w{1,15}\/status\/(\d+)(?:[/?#]|$)/i;
const PHONE_USER_AGENT = /Android|iPhone|iPad|iPod/i;
const DESKTOP_SAFARI_USER_AGENT = /Macintosh/i;

export const APP_WAIT_MS = 1500;
const LATE_TIMER_MS = APP_WAIT_MS;
const LEAVE_EVENTS = ["pagehide", "blur"] as const;

export const statusIdOf = (href: string): string | undefined => X_STATUS_URL.exec(href)?.[1];

export const appUrlOf = (id: string): string => `twitter://status?id=${id}`;

export const isPhone = ({ userAgent, maxTouchPoints }: { userAgent: string; maxTouchPoints: number }): boolean =>
  PHONE_USER_AGENT.test(userAgent) || (DESKTOP_SAFARI_USER_AGENT.test(userAgent) && maxTouchPoints > 1);

export const shouldOpenWeb = ({ leftPage, elapsedMs }: { leftPage: boolean; elapsedMs: number }): boolean =>
  !leftPage && elapsedMs < APP_WAIT_MS + LATE_TIMER_MS;

export type AppAttempt = {
  navigate: (url: string) => void;
  now: () => number;
  later: (run: () => void, ms: number) => void;
  leftPage: () => boolean;
  settled: () => void;
};

export function openInXApp(id: string, webUrl: string, attempt: AppAttempt): void {
  const started = attempt.now();
  attempt.navigate(appUrlOf(id));
  attempt.later(() => {
    attempt.settled();
    if (shouldOpenWeb({ leftPage: attempt.leftPage(), elapsedMs: attempt.now() - started })) {
      attempt.navigate(webUrl);
    }
  }, APP_WAIT_MS);
}

const isPlainClick = (event: MouseEvent): boolean =>
  !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

const keepLinksOnTheWeb = (): void => {};

function watchForApp(page: Window, link: HTMLAnchorElement, id: string): void {
  let left = false;
  const watching = new AbortController();
  const leave = (): void => {
    left = true;
  };
  for (const name of LEAVE_EVENTS) page.addEventListener(name, leave, { signal: watching.signal });
  page.document.addEventListener(
    "visibilitychange",
    () => {
      if (page.document.hidden) leave();
    },
    { signal: watching.signal },
  );
  openInXApp(id, link.href, {
    navigate: (url) => page.location.assign(url),
    now: () => page.performance.now(),
    later: (run, ms) => page.setTimeout(run, ms),
    leftPage: () => left,
    settled: () => watching.abort(),
  });
}

export function openXLinksInApp(page: Window): () => void {
  if (!isPhone(page.navigator)) return keepLinksOnTheWeb;
  const listening = new AbortController();
  page.document.addEventListener(
    "click",
    (event) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || !isPlainClick(event)) return;
      const id = statusIdOf(link.href);
      if (id === undefined) return;
      event.preventDefault();
      watchForApp(page, link, id);
    },
    { signal: listening.signal },
  );
  return () => listening.abort();
}
