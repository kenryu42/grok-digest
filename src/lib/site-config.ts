import raw, { source } from "virtual:grok-digest/config";
import { parseDataFile } from "./bookmarks.ts";
import { siteConfigSchema } from "./custom.ts";

export const siteConfig = parseDataFile({ schema: siteConfigSchema, raw, source });
