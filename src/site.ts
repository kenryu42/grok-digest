import { build, dev, preview, type AstroInlineConfig } from "astro";
import grokDigest from "./index.ts";

export type SiteCommand = "build" | "dev" | "preview";

const RUN = { build, dev, preview } satisfies Record<SiteCommand, (config: AstroInlineConfig) => Promise<unknown>>;

const nonEmpty = (value: string | undefined): string | undefined => (value === "" ? undefined : value);

export async function runSite(
  command: SiteCommand,
  { dataDir, exposed }: { dataDir: string; exposed: boolean },
): Promise<void> {
  const site = nonEmpty(process.env["SITE_URL"]);
  await RUN[command]({
    root: process.cwd(),
    configFile: false,
    ...(site === undefined ? {} : { site }),
    base: nonEmpty(process.env["BASE_PATH"]) ?? "/",
    trailingSlash: "ignore",
    server: { host: exposed },
    integrations: [grokDigest({ dataDir })],
  });
}
