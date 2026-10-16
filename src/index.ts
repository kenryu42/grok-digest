import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import type { AstroIntegration } from "astro";
import type { Plugin } from "vite";
import { existsSync } from "node:fs";
import { CONFIG_FILE, CUSTOM_DIR, isOverridable, THEME_FILE } from "./lib/custom.ts";
import { BOOKMARKS_FILE, readJsonFile } from "./lib/data-files.ts";
import {
  conflictedOverrides,
  defaultComponentFile,
  displayPath,
  INTERNAL_PREFIX,
  MODULE_ROOT,
  overrideFile,
  staleOverrides,
} from "./lib/eject.ts";

export type GrokDigestOptions = {
  dataDir?: string;
};

const PACKAGE_NAME = "grok-digest";
const BOOKMARKS_MODULE_ID = "virtual:grok-digest/bookmarks";
const RESOLVED_BOOKMARKS_MODULE_ID = `\0${BOOKMARKS_MODULE_ID}`;
const CONFIG_MODULE_ID = "virtual:grok-digest/config";
const RESOLVED_CONFIG_MODULE_ID = `\0${CONFIG_MODULE_ID}`;
const THEME_MODULE_ID = "virtual:grok-digest/theme.css";
const COMPONENT_MODULE = /^virtual:grok-digest\/components\/(\w+)\.astro$/;
const SCRIPT_EXTENSION = path.extname(fileURLToPath(import.meta.url));

const ROUTES = [
  { pattern: "/", entrypoint: "pages/index.astro" },
  { pattern: "/rss.xml", entrypoint: `pages/rss.xml${SCRIPT_EXTENSION}` },
  { pattern: "/rss/[topic].xml", entrypoint: `pages/rss/[topic].xml${SCRIPT_EXTENSION}` },
  { pattern: "/favicon.svg", entrypoint: `routes/favicon.svg${SCRIPT_EXTENSION}` },
  { pattern: "/robots.txt", entrypoint: `routes/robots.txt${SCRIPT_EXTENSION}` },
  { pattern: "/manifest.webmanifest", entrypoint: `routes/manifest.webmanifest${SCRIPT_EXTENSION}` },
  { pattern: "/icon-[size].png", entrypoint: `routes/icon-[size].png${SCRIPT_EXTENSION}` },
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

const jsonModule = ({ source, raw }: { source: string; raw: unknown }): string =>
  `export const source = ${JSON.stringify(source)};\nexport default ${JSON.stringify(raw)};`;

function bookmarksModule({ file, source }: { file: string; source: string }): Plugin {
  return {
    name: "grok-digest:bookmarks",
    resolveId: (id) => (id === BOOKMARKS_MODULE_ID ? RESOLVED_BOOKMARKS_MODULE_ID : undefined),
    async load(id) {
      if (id !== RESOLVED_BOOKMARKS_MODULE_ID) return undefined;
      this.addWatchFile(file);
      return jsonModule({ source, raw: await readJsonFile({ file, source }) });
    },
  };
}

const RESTART_DELAY_MS = 200;
const IMPORT_SPECIFIER = /(\b(?:from|import)\s*\(?\s*)(["'])([^"'\s]+)\2/g;
const isBareImport = (id: string): boolean => !/^(?:[./\0]|[a-z][a-z\d+.-]*:)/i.test(id);

function customModules(root: string): Plugin {
  const customDir = path.join(root, CUSTOM_DIR);
  const configFile = path.join(customDir, CONFIG_FILE);
  const themeFile = path.join(customDir, THEME_FILE);
  const customModuleIds = `${customDir.split(path.sep).join("/")}/`;
  return {
    name: "grok-digest:custom",
    enforce: "pre",
    configureServer(server) {
      let pending: ReturnType<typeof setTimeout> | undefined;
      const restartOnCustomFile = (file: string): void => {
        if (!file.startsWith(`${customDir}${path.sep}`)) return;
        clearTimeout(pending);
        pending = setTimeout(() => void server.restart(), RESTART_DELAY_MS);
      };
      server.watcher.add(customDir);
      server.watcher.on("add", restartOnCustomFile);
      server.watcher.on("unlink", restartOnCustomFile);
    },
    resolveId(id) {
      if (id === CONFIG_MODULE_ID) return RESOLVED_CONFIG_MODULE_ID;
      if (id === THEME_MODULE_ID)
        return existsSync(themeFile) ? themeFile : path.join(MODULE_ROOT, "styles", THEME_FILE);
      if (id.startsWith(INTERNAL_PREFIX)) return this.resolve(path.join(MODULE_ROOT, id.slice(INTERNAL_PREFIX.length)));
      const name = COMPONENT_MODULE.exec(id)?.[1];
      if (name === undefined || !isOverridable(name)) return undefined;
      const override = overrideFile(root, name);
      return existsSync(override) ? override : defaultComponentFile(name);
    },
    async transform(code, id) {
      if (!id.startsWith(customModuleIds)) return undefined;
      const bare = [
        ...new Set(
          [...code.matchAll(IMPORT_SPECIFIER)]
            .map(([, , , specifier = ""]) => specifier)
            .filter((specifier) => isBareImport(specifier) && !specifier.startsWith(INTERNAL_PREFIX)),
        ),
      ];
      const fromPackage = await Promise.all(
        bare.map(async (specifier) =>
          (await this.resolve(specifier, id)) === null ? this.resolve(specifier, PACKAGE_ENTRY) : null,
        ),
      );
      const replacements = new Map(
        bare.flatMap((specifier, index) => {
          const resolved = fromPackage[index];
          return resolved === null || resolved === undefined ? [] : [[specifier, resolved.id] as const];
        }),
      );
      if (replacements.size === 0) return undefined;
      return code.replaceAll(IMPORT_SPECIFIER, (match, keyword: string, quote: string, specifier: string) => {
        const resolved = replacements.get(specifier);
        return resolved === undefined ? match : `${keyword}${quote}${resolved}${quote}`;
      });
    },
    async load(id) {
      if (id !== RESOLVED_CONFIG_MODULE_ID) return undefined;
      const source = displayPath(root, configFile);
      this.addWatchFile(configFile);
      if (!existsSync(configFile)) return jsonModule({ source, raw: {} });
      return jsonModule({ source, raw: await readJsonFile({ file: configFile, source }) });
    },
  };
}

export default function grokDigest({ dataDir = "data" }: GrokDigestOptions = {}): AstroIntegration {
  return {
    name: PACKAGE_NAME,
    hooks: {
      "astro:config:setup": async ({ config, updateConfig, injectRoute, logger }) => {
        const root = fileURLToPath(config.root);
        const file = path.resolve(root, dataDir, BOOKMARKS_FILE);
        const source = displayPath(root, file);
        updateConfig({
          integrations: [react()],
          vite: {
            plugins: [
              rendererFromPackage(),
              servePackageFiles(),
              tailwindcss(),
              bookmarksModule({ file, source }),
              customModules(root),
            ],
          },
        });
        for (const { pattern, entrypoint } of ROUTES) {
          injectRoute({ pattern, entrypoint: new URL(entrypoint, import.meta.url) });
        }
        const conflicted = await conflictedOverrides(root);
        if (conflicted.length > 0) {
          throw new Error(`${conflicted.join(", ")} still has merge conflicts. Resolve each <<<<<<< block first.`);
        }
        for (const name of await staleOverrides(root)) {
          logger.warn(
            `${CUSTOM_DIR}/components/${name}.astro was ejected from an older ${name}. Run "grok-digest merge" to bring in the new default.`,
          );
        }
      },
    },
  };
}
