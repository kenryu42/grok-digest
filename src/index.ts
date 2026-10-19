import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import type { AstroIntegration } from "astro";
import type { Plugin, ViteDevServer } from "vite";
import { existsSync } from "node:fs";
import { componentFile, CONFIG_FILE, CUSTOM_DIR, OVERRIDABLE_COMPONENTS, THEME_FILE } from "./lib/custom.ts";
import { BOOKMARKS_FILE, issueFilesIn, readJsonFile } from "./lib/data-files.ts";
import {
  conflictedOverrides,
  defaultComponentFile,
  displayPath,
  INTERNAL_PREFIX,
  MODULE_ROOT,
  overrideFile,
  staleOverrides,
} from "./lib/eject.ts";
import { MAGAZINE_DIR } from "./lib/magazine.ts";

export type GrokDigestOptions = {
  dataDir?: string;
};

const PACKAGE_NAME = "grok-digest";
const BOOKMARKS_MODULE_ID = "virtual:grok-digest/bookmarks";
const RESOLVED_BOOKMARKS_MODULE_ID = `\0${BOOKMARKS_MODULE_ID}`;
const CONFIG_MODULE_ID = "virtual:grok-digest/config";
const RESOLVED_CONFIG_MODULE_ID = `\0${CONFIG_MODULE_ID}`;
const MAGAZINE_MODULE_ID = "virtual:grok-digest/magazine";
const RESOLVED_MAGAZINE_MODULE_ID = `\0${MAGAZINE_MODULE_ID}`;
const THEME_MODULE_ID = "virtual:grok-digest/theme.css";
const COMPONENT_MODULE = /^virtual:grok-digest\/components\/(\w+)(\.astro)?$/;
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

const MAGAZINE_ROUTES = [
  { pattern: "/magazine", entrypoint: "pages/magazine/index.astro" },
  { pattern: "/magazine/[date]", entrypoint: "pages/magazine/[date].astro" },
  { pattern: "/magazine/rss.xml", entrypoint: `pages/magazine/rss.xml${SCRIPT_EXTENSION}` },
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

function magazineModule({ root, dir }: { root: string; dir: string }): Plugin {
  return {
    name: "grok-digest:magazine",
    configureServer: (server) =>
      whenFilesComeOrGo(server, { dir, extension: ".json" }, () => server.watcher.emit("change", dir)),
    resolveId: (id) => (id === MAGAZINE_MODULE_ID ? RESOLVED_MAGAZINE_MODULE_ID : undefined),
    async load(id) {
      if (id !== RESOLVED_MAGAZINE_MODULE_ID) return undefined;
      const files = await issueFilesIn(dir);
      const issues = await Promise.all(
        files.map(async (file) => {
          this.addWatchFile(file);
          const source = displayPath(root, file);
          return { source, raw: await readJsonFile({ file, source }) };
        }),
      );
      return `export default ${JSON.stringify(issues)};`;
    },
  };
}

const RESTART_DELAY_MS = 200;

function whenFilesComeOrGo(
  server: ViteDevServer,
  { dir, extension = "" }: { dir: string; extension?: string },
  respond: () => void,
): void {
  let pending: ReturnType<typeof setTimeout> | undefined;
  const reactToFileInDir = (file: string): void => {
    if (!file.startsWith(`${dir}${path.sep}`) || !file.endsWith(extension)) return;
    clearTimeout(pending);
    pending = setTimeout(respond, RESTART_DELAY_MS);
  };
  server.watcher.add(dir);
  server.watcher.on("add", reactToFileInDir);
  server.watcher.on("unlink", reactToFileInDir);
}
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
    configureServer: (server) => whenFilesComeOrGo(server, { dir: customDir }, () => void server.restart()),
    resolveId(id) {
      if (id === CONFIG_MODULE_ID) return RESOLVED_CONFIG_MODULE_ID;
      if (id === THEME_MODULE_ID)
        return existsSync(themeFile) ? themeFile : path.join(MODULE_ROOT, "styles", THEME_FILE);
      if (id.startsWith(INTERNAL_PREFIX)) return this.resolve(path.join(MODULE_ROOT, id.slice(INTERNAL_PREFIX.length)));
      const [, base, astro] = COMPONENT_MODULE.exec(id) ?? [];
      const file = `${base}${astro ?? ".tsx"}`;
      const name = OVERRIDABLE_COMPONENTS.find((component) => componentFile(component) === file);
      if (name === undefined) return undefined;
      const override = overrideFile(root, name);
      return existsSync(override) ? override : defaultComponentFile(name);
    },
    async transform(code, id) {
      if (!id.startsWith(customModuleIds)) return undefined;
      const bare = [
        ...new Set(
          [...code.matchAll(IMPORT_SPECIFIER)]
            .map(([, , , specifier = ""]) => specifier)
            .filter(
              (specifier) =>
                isBareImport(specifier) && !specifier.startsWith(INTERNAL_PREFIX) && !isRendererImport(specifier),
            ),
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
      "astro:config:setup": async ({ config, updateConfig, injectRoute, addWatchFile, logger }) => {
        const root = fileURLToPath(config.root);
        const file = path.resolve(root, dataDir, BOOKMARKS_FILE);
        const source = displayPath(root, file);
        const magazineDir = path.resolve(root, dataDir, MAGAZINE_DIR);
        updateConfig({
          integrations: [react()],
          vite: {
            plugins: [
              rendererFromPackage(),
              servePackageFiles(),
              tailwindcss(),
              bookmarksModule({ file, source }),
              customModules(root),
              magazineModule({ root, dir: magazineDir }),
            ],
          },
        });
        addWatchFile(magazineDir);
        const hasIssues = (await issueFilesIn(magazineDir)).length > 0;
        for (const { pattern, entrypoint } of [...ROUTES, ...(hasIssues ? MAGAZINE_ROUTES : [])]) {
          injectRoute({ pattern, entrypoint: new URL(entrypoint, import.meta.url) });
        }
        const conflicted = await conflictedOverrides(root);
        if (conflicted.length > 0) {
          throw new Error(`${conflicted.join(", ")} still has merge conflicts. Resolve each <<<<<<< block first.`);
        }
        for (const name of await staleOverrides(root)) {
          logger.warn(
            `${CUSTOM_DIR}/components/${componentFile(name)} was ejected from an older ${name}. Run "grok-digest merge" to bring in the new default.`,
          );
        }
      },
    },
  };
}
