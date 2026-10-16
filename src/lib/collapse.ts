export const NARROW_SCREEN_QUERY = "(width < 40rem)";

export function startsCollapsed(stored: unknown, narrowScreen: boolean): boolean {
  return typeof stored === "boolean" ? stored : narrowScreen;
}
