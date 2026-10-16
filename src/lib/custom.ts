import { z } from "zod";
import { DEPTHS } from "./depth.ts";
import { VIEWS } from "./filter.ts";
import { REVIEW_SIZE } from "./review.ts";

export const CUSTOM_DIR = "custom";
export const CONFIG_FILE = "config.json";
export const THEME_FILE = "theme.css";
export const COMPONENTS_DIR = "components";
export const EJECTED_DIR = ".ejected";
export const OVERRIDABLE_COMPONENTS = ["Header", "Footer", "BookmarkCard"] as const;

export type OverridableComponent = (typeof OVERRIDABLE_COMPONENTS)[number];

export const DEFAULT_TITLE = "Grok Digest";
const MAX_REVIEW_SIZE = 20;

export const siteConfigSchema = z.strictObject({
  title: z.string().trim().min(1).default(DEFAULT_TITLE),
  defaultView: z.enum(VIEWS).default("today"),
  reviewSize: z.int().min(1).max(MAX_REVIEW_SIZE).default(REVIEW_SIZE),
  detail: z
    .strictObject({
      phone: z.enum(DEPTHS).default("headline"),
      desktop: z.enum(DEPTHS).default("full"),
    })
    .prefault({}),
  swipeMode: z.boolean().default(true),
});

export type PageSettings = Pick<
  z.output<typeof siteConfigSchema>,
  "defaultView" | "reviewSize" | "detail" | "swipeMode"
>;

export function isOverridable(name: string): name is OverridableComponent {
  return OVERRIDABLE_COMPONENTS.some((component) => component === name);
}
