import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DARK_QUERY, THEME_STORAGE_KEY } from "@/lib/theme";

function toggleTheme(): void {
  const root = document.documentElement;
  const dark = !root.classList.contains("dark");
  const systemDark = window.matchMedia(DARK_QUERY).matches;
  try {
    if (dark === systemDark) {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
    }
  } catch {}
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function ThemeToggle() {
  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle dark mode" title="Toggle dark mode">
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}
