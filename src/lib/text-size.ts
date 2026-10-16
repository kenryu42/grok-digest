export const TEXT_SIZE_STORAGE_KEY = "grok-digest:text-size";
export const TEXT_SIZES = ["small", "default", "large", "larger"] as const;
export const DEFAULT_TEXT_SIZE = "default";

export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  small: "Small",
  default: "Default",
  large: "Large",
  larger: "Larger",
};

export function isTextSize(value: unknown): value is TextSize {
  return TEXT_SIZES.some((size) => size === value);
}
