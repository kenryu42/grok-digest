import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TOPICS } from "../packages/grok-digest/dist/schema.js";

const ORIGIN = "https://example.github.io";
const BASE_PATH = "/bm-check";
const PACKAGE_DIR = path.resolve("packages/grok-digest");
const TEMPLATE_DIR = path.resolve("template");
const fromPackedTarball = process.argv.includes("--packed");

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

function caretAllows(range, version) {
  const [rangeMajor, rangeMinor] = range.replace(/^\^/, "").split(".").map(Number);
  const [major, minor] = version.split(".").map(Number);
  const pinsMinor = rangeMajor === 0;
  return range.startsWith("^") && rangeMajor === major && (!pinsMinor || rangeMinor === minor);
}

function packedStarter() {
  const workDir = mkdtempSync(path.join(tmpdir(), "grok-digest-starter-"));
  execFileSync("pnpm", ["pack", "--pack-destination", workDir], { cwd: PACKAGE_DIR, stdio: "inherit" });
  const tarball = readdirSync(workDir).find((name) => name.endsWith(".tgz"));
  const siteDir = path.join(workDir, "site");
  cpSync(TEMPLATE_DIR, siteDir, {
    recursive: true,
    filter: (source) => !/[/\\](?:node_modules|dist|\.astro)(?:[/\\]|$)/.test(source.slice(TEMPLATE_DIR.length)),
  });
  const manifestPath = path.join(siteDir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.dependencies["grok-digest"] = `file:${path.join(workDir, tarball)}`;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  execFileSync("pnpm", ["install", "--ignore-workspace"], { cwd: siteDir, stdio: "inherit" });
  return { siteDir, cleanUp: () => rmSync(workDir, { recursive: true, force: true }) };
}

const packageVersion = JSON.parse(readFileSync(path.join(PACKAGE_DIR, "package.json"), "utf8")).version;
const starterRange = JSON.parse(readFileSync(path.join(TEMPLATE_DIR, "package.json"), "utf8")).dependencies[
  "grok-digest"
];
expect(
  caretAllows(starterRange, packageVersion),
  `template/package.json asks for grok-digest ${starterRange}, which does not allow the package's version ${packageVersion}`,
);

const { siteDir, cleanUp } = fromPackedTarball ? packedStarter() : { siteDir: TEMPLATE_DIR, cleanUp: () => {} };
try {
  execFileSync("pnpm", ["validate"], { cwd: siteDir, stdio: "inherit" });
  execFileSync("pnpm", ["build"], {
    cwd: siteDir,
    stdio: "inherit",
    env: { ...process.env, SITE_URL: ORIGIN, BASE_PATH },
  });

  const dist = path.join(siteDir, "dist");
  const read = (file) => readFileSync(path.join(dist, file), "utf8");
  const html = read("index.html");

  expect(html.includes('<meta name="robots" content="noindex,nofollow">'), "index.html lacks the noindex robots meta");
  expect(html.includes("Unofficial. Summaries created with Grok."), "index.html lacks the footer");
  expect(html.includes(`href="${BASE_PATH}/rss.xml"`), "index.html does not link the feed under the base path");
  expect(html.includes(`href="${BASE_PATH}/favicon.svg"`), "index.html does not link the favicon under the base path");

  const localUrls = [...html.matchAll(/(?:href|src|component-url|renderer-url)="(\/[^"]*)"/g)].map(([, url]) => url);
  expect(localUrls.length > 0, "index.html has no local links");
  for (const url of localUrls) {
    expect(url.startsWith(`${BASE_PATH}/`), `${url} is outside ${BASE_PATH}/`);
    const file = url.slice(BASE_PATH.length).split(/[?#]/)[0];
    expect(file === "/" || existsSync(path.join(dist, file)), `${url} points at a file the build did not write`);
  }

  for (const file of ["favicon.svg", "robots.txt", "rss.xml", ...TOPICS.map((topic) => `rss/${topic}.xml`)]) {
    expect(existsSync(path.join(dist, file)), `the build did not write ${file}`);
  }
  const feed = read("rss.xml");
  expect(feed.includes(`<link>${ORIGIN}${BASE_PATH}/</link>`), "rss.xml does not link the site under the base path");
  expect(feed.includes(`href="${ORIGIN}${BASE_PATH}/rss.xml"`), "rss.xml does not name its own address");
  expect(feed.includes(`${ORIGIN}${BASE_PATH}/#b-`), "rss.xml items do not link cards under the base path");
} finally {
  cleanUp();
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `✖ ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`✓ The starter builds under ${ORIGIN}${BASE_PATH}/${fromPackedTarball ? " from the packed tarball" : ""}.`);
