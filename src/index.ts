import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import type { AstroIntegration } from "astro";
import type { Plugin } from "vite";
import { BOOKMARKS_FILE, readJsonFile } from "./lib/data-files.ts";

export type GrokDigestOptions = {
  dataDir?: string;
};

const PACKAGE_NAME = "grok-digest";
const BOOKMARKS_MODULE_ID = "virtual:grok-digest/bookmarks";
const RESOLVED_BOOKMARKS_MODULE_ID = `\0${BOOKMARKS_MODULE_ID}`;
const SCRIPT_EXTENSION = path.extname(fileURLToPath(import.meta.url));

const ROUTES = [
  { pattern: "/", entrypoint: "pages/index.astro" },
  { pattern: "/rss.xml", entrypoint: `pages/rss.xml${SCRIPT_EXTENSION}` },
  { pattern: "/rss/[topic].xml", entrypoint: `pages/rss/[topic].xml${SCRIPT_EXTENSION}` },
  { pattern: "/favicon.svg", entrypoint: `routes/favicon.svg${SCRIPT_EXTENSION}` },
  { pattern: "/robots.txt", entrypoint: `routes/robots.txt${SCRIPT_EXTENSION}` },
];

const RENDERER_PACKAGES = ["@astrojs/react", "react", "react-dom"];
const PACKAGE_ENTRY = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = path.resolve(path.dirname(PACKAGE_ENTRY), "..");

const isRendererImport = (id: string): boolean =>
  RENDERER_PACKAGES.some((name) => id === name || id.startsWith(`${name}/`));

function replaceInPlace(list: string[], replacement: readonly string[]): void {
  list.splice(0, list.length, ...replacement);
}

function rendererFromPackage(): Plugin {
  return {
    name: "grok-digest:renderer",
    enforce: "pre",
    async resolveId(id, importer, options) {
      if (!isRendererImport(id)) return undefined;
      const resolveOptions = { ...options, skipSelf: true };
      const resolvesFromImporter = (await this.resolve(id, importer, resolveOptions)) !== null;
      return resolvesFromImporter ? undefined : this.resolve(id, PACKAGE_ENTRY, resolveOptions);
    },
    configResolved(config) {
      for (const { resolve } of [config, ...Object.values(config.environments)]) {
        replaceInPlace(
          resolve.dedupe,
          resolve.dedupe.filter((id) => !isRendererImport(id)),
        );
      }
    },
    configEnvironment: {
      order: "post",
      handler(_name, config) {
        const include = config.optimizeDeps?.include;
        if (include !== undefined) {
          replaceInPlace(
            include,
            include.map((id) => (isRendererImport(id) ? `${PACKAGE_NAME} > ${id}` : id)),
          );
        }
      },
    },
  };
}

function servePackageFiles(): Plugin {
  return {
    name: "grok-digest:serve-package-files",
    configResolved(config) {
      config.server.fs.allow.push(PACKAGE_ROOT);
    },
  };
}

function bookmarksModule({ file, source }: { file: string; source: string }): Plugin {
  return {
    name: "grok-digest:bookmarks",
    resolveId: (id) => (id === BOOKMARKS_MODULE_ID ? RESOLVED_BOOKMARKS_MODULE_ID : undefined),
    async load(id) {
      if (id !== RESOLVED_BOOKMARKS_MODULE_ID) return undefined;
      this.addWatchFile(file);
      const raw = await readJsonFile({ file, source });
      return `export const source = ${JSON.stringify(source)};\nexport default ${JSON.stringify(raw)};`;
    },
  };
}

export default function grokDigest({ dataDir = "data" }: GrokDigestOptions = {}): AstroIntegration {
  return {
    name: PACKAGE_NAME,
    hooks: {
      "astro:config:setup": ({ config, updateConfig, injectRoute }) => {
        const root = fileURLToPath(config.root);
        const file = path.resolve(root, dataDir, BOOKMARKS_FILE);
        const source = path.relative(root, file).split(path.sep).join("/");
        updateConfig({
          integrations: [react()],
          vite: {
            plugins: [rendererFromPackage(), servePackageFiles(), tailwindcss(), bookmarksModule({ file, source })],
          },
        });
        for (const { pattern, entrypoint } of ROUTES) {
          injectRoute({ pattern, entrypoint: new URL(entrypoint, import.meta.url) });
        }
      },
    },
  };
}
