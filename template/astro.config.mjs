import { defineConfig } from "astro/config";
import grokDigest from "grok-digest";

export default defineConfig({
  site: process.env.SITE_URL || undefined,
  base: process.env.BASE_PATH || "/",
  trailingSlash: "ignore",
  integrations: [grokDigest({ dataDir: "./data" })],
});
