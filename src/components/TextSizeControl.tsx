import { ALargeSmallIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "./ui/button.tsx";
import {
  DEFAULT_TEXT_SIZE,
  isTextSize,
  TEXT_SIZE_LABELS,
  TEXT_SIZE_STORAGE_KEY,
  TEXT_SIZES,
  type TextSize,
} from "../lib/text-size.ts";

const GLYPH_SIZES: Record<TextSize, string> = {
  small: "text-xs",
  default: "text-base",
  large: "text-xl",
  larger: "text-2xl",
};

function shownTextSize(): TextSize {
  const shown = document.documentElement.dataset["textSize"];
  return isTextSize(shown) ? shown : DEFAULT_TEXT_SIZE;
}

function applyTextSize(size: TextSize): void {
  const root = document.documentElement;
  try {
    if (size === DEFAULT_TEXT_SIZE) window.localStorage.removeItem(TEXT_SIZE_STORAGE_KEY);
    else window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {}
  if (size === DEFAULT_TEXT_SIZE) delete root.dataset["textSize"];
  else root.dataset["textSize"] = size;
}

export function TextSizeControl() {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<TextSize>(DEFAULT_TEXT_SIZE);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) !== true) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggle = (): void => {
    if (!open) setSize(shownTextSize());
    setOpen(!open);
  };

  const choose = (next: TextSize): void => {
    applyTextSize(next);
    setSize(next);
  };

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="max-sm:size-11"
        onClick={toggle}
        aria-expanded={open}
        aria-label="Text size"
        title="Text size"
      >
        <ALargeSmallIcon />
      </Button>
      {open && (
        <fieldset
          aria-label="Choose a text size"
          className="absolute top-full right-0 z-20 m-0 mt-2 flex min-w-0 gap-1 rounded-full border bg-popover p-1 text-popover-foreground shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
        >
          {TEXT_SIZES.map((option) => (
            <button
              key={option}
              type="button"
              data-text-size-option={option}
              aria-pressed={option === size}
              aria-label={TEXT_SIZE_LABELS[option]}
              title={TEXT_SIZE_LABELS[option]}
              onClick={() => choose(option)}
              className={cn(
                "flex size-10 items-center justify-center rounded-full font-heading font-semibold text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-muted aria-pressed:text-foreground",
                GLYPH_SIZES[option],
              )}
            >
              A
            </button>
          ))}
        </fieldset>
      )}
    </div>
  );
}
