import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OVERRIDABLE_COMPONENTS } from "../dist/lib/custom.js";
import { TOPICS } from "../dist/schema.js";

const ORIGIN = "https://example.github.io";
const BASE_PATH = "/bm-check";
const TEMPLATE_DIR = path.resolve("template");

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

function starterFromPackedTarball() {
  const workDir = mkdtempSync(path.join(tmpdir(), "grok-digest-starter-"));
  execFileSync("bun", ["pm", "pack", "--destination", workDir], { stdio: "inherit" });
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
  execFileSync("bun", ["install"], { cwd: siteDir, stdio: "inherit" });
  return { siteDir, cleanUp: () => rmSync(workDir, { recursive: true, force: true }) };
}

const { siteDir, cleanUp } = starterFromPackedTarball();
const buildUnderBasePath = () =>
  execFileSync("bun", ["run", "build"], {
    cwd: siteDir,
    stdio: "inherit",
    env: { ...process.env, SITE_URL: ORIGIN, BASE_PATH },
  });
try {
  execFileSync("bun", ["run", "validate"], { cwd: siteDir, stdio: "inherit" });
  expect(
    existsSync(path.join(siteDir, "node_modules/grok-digest/BOT.md")),
    "the installed package lacks BOT.md, the bot's manual",
  );
  buildUnderBasePath();

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

  for (const file of [
    "favicon.svg",
    "robots.txt",
    "rss.xml",
    ...TOPICS.map((topic) => `rss/${topic}.xml`),
    "manifest.webmanifest",
    "icon-180.png",
  ]) {
    expect(existsSync(path.join(dist, file)), `the build did not write ${file}`);
  }
  const manifest = JSON.parse(read("manifest.webmanifest"));
  expect(manifest.start_url === "./", "manifest.webmanifest does not start at the page it sits next to");
  for (const { src, sizes } of manifest.icons) {
    const png = readFileSync(path.join(dist, src));
    const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    expect(sizes === `${width}x${height}`, `${src} is ${width}x${height}, not the ${sizes} the manifest says`);
  }
  expect(html.includes(`href="${BASE_PATH}/manifest.webmanifest"`), "index.html does not link the manifest");

  const feed = read("rss.xml");
  expect(feed.includes(`<link>${ORIGIN}${BASE_PATH}/</link>`), "rss.xml does not link the site under the base path");
  expect(feed.includes(`href="${ORIGIN}${BASE_PATH}/rss.xml"`), "rss.xml does not name its own address");
  expect(feed.includes(`${ORIGIN}${BASE_PATH}/#b-`), "rss.xml items do not link cards under the base path");

  expect(!/magazine/i.test(html), "index.html mentions the magazine though the starter has no issues");
  expect(!existsSync(path.join(dist, "magazine")), "the build wrote a magazine though the starter has no issues");

  const [sample] = JSON.parse(readFileSync(path.join(siteDir, "data/bookmarks.json"), "utf8"));
  const issueDate = "2026-01-20";
  mkdirSync(path.join(siteDir, "data/magazine"));
  writeFileSync(
    path.join(siteDir, `data/magazine/${issueDate}.json`),
    JSON.stringify({
      date: issueDate,
      title: "Starter issue",
      theme: { palette: "forest", fonts: "serif" },
      sections: [
        { type: "cover-story", bookmark: sample.id, headline: "A starter cover" },
        { type: "feature", bookmark: "a-removed-bookmark" },
      ],
    }),
  );
  cpSync(path.resolve("src/assets/icon-512.png"), path.join(siteDir, `data/magazine/${issueDate}.png`));
  execFileSync("bun", ["run", "validate"], { cwd: siteDir, stdio: "inherit" });
  buildUnderBasePath();
  expect(read("index.html").includes(`href="${BASE_PATH}/magazine/"`), "index.html does not link the magazine");
  for (const file of ["magazine/index.html", `magazine/${issueDate}/index.html`, "magazine/rss.xml"]) {
    expect(existsSync(path.join(dist, file)), `the build did not write ${file}`);
  }
  const issuePage = read(`magazine/${issueDate}/index.html`);
  expect(issuePage.includes("A starter cover"), "the issue page lacks its cover story");
  for (const [, url] of issuePage.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    expect(url.startsWith(`${BASE_PATH}/`), `the issue page links ${url}, outside ${BASE_PATH}/`);
  }
  const coverSources = [...(/<img[^>]*srcset="([^"]+)"/.exec(issuePage)?.[1] ?? "").matchAll(/(\S+) \d+w/g)];
  expect(coverSources.length > 1, "the issue page does not show its cover picture in several sizes");
  for (const [, url] of coverSources) {
    expect(existsSync(path.join(dist, url.slice(BASE_PATH.length))), `the cover picture ${url} was not built`);
  }

  for (const component of OVERRIDABLE_COMPONENTS) {
    execFileSync("bunx", ["grok-digest", "eject", component], { cwd: siteDir, stdio: "inherit" });
  }
  writeFileSync(path.join(siteDir, "custom/config.json"), JSON.stringify({ title: "Starter Check" }));
  execFileSync("bun", ["run", "validate"], { cwd: siteDir, stdio: "inherit" });
  buildUnderBasePath();
  const customized = read("index.html");
  expect(customized.includes("<title>Starter Check</title>"), "custom/config.json did not rename the page");
  expect(
    customized.includes("Unofficial. Summaries created with Grok.") && customized.includes('<li id="b-'),
    "the page built from ejected components lacks the footer or the cards",
  );
  for (const [, url] of customized.matchAll(/(?:component-url|renderer-url)="([^"]+)"/g)) {
    expect(existsSync(path.join(dist, url.slice(BASE_PATH.length))), `the ejected page's island ${url} was not built`);
  }
} finally {
  cleanUp();
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `✖ ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`✓ The starter builds under ${ORIGIN}${BASE_PATH}/ from the packed tarball.`);
