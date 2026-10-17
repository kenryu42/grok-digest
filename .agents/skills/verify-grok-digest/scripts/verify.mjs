#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, realpathSync } from "node:fs";
import { appendFile, cp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const SCRIPT = fileURLToPath(import.meta.url);
const SKILL_DIR = path.resolve(path.dirname(SCRIPT), "..");
const REPOSITORY = path.resolve(SKILL_DIR, "../../..");
const CLI = path.join(REPOSITORY, "src/cli.ts");
const FIXTURE_DATA = path.join(SKILL_DIR, "fixtures/data");
const RUNS_ROOT = path.join(tmpdir(), "grok-digest-verify");
const DEV_ADDRESS = /Local\s+(http:\/\/\S+?)\/?\s/;
const STARTUP_TIMEOUT_MS = 60_000;
const PAGE_TIMEOUT_MS = 20_000;
const CDP_CALL_TIMEOUT_MS = 30_000;
const DRIVER_REPLY_TIMEOUT_MS = 120_000;
const STOP_GRACE_MS = 10_000;
const SETTLE_MS = 200;
const SWIPE_FRAME_MS = 16;
const SWIPE_DURATION_MS = 128;
const SWIPE_SETTLE_MS = 500;
const VIEWPORTS = {
  mobile: { width: 375, height: 812, deviceScaleFactor: 2, mobile: true, touch: true },
  desktop: { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false, touch: false },
};
const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];
const NAMED_KEYS = {
  Enter: { code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Escape: { code: "Escape", windowsVirtualKeyCode: 27 },
  Tab: { code: "Tab", windowsVirtualKeyCode: 9 },
  Backspace: { code: "Backspace", windowsVirtualKeyCode: 8 },
  "/": { code: "Slash", text: "/" },
  Space: { key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " },
  ArrowLeft: { code: "ArrowLeft", windowsVirtualKeyCode: 37 },
  ArrowUp: { code: "ArrowUp", windowsVirtualKeyCode: 38 },
  ArrowRight: { code: "ArrowRight", windowsVirtualKeyCode: 39 },
  ArrowDown: { code: "ArrowDown", windowsVirtualKeyCode: 40 },
};
const SKIPPED_AX_ROLES = new Set(["generic", "none", "InlineTextBox", "LineBreak"]);

const USAGE = `Usage: verify.mjs <command> [run-dir] [options]

  launch [--data <dir>] [--viewport mobile|desktop]   Start a dev server and headless Chrome; prints RUN=<dir>.
  doctor <run>                                        Read-only health check of that run.
  open <run> [path] [--viewport v] [--fresh]          Load a page; --fresh clears the site's storage first.
  click <run> (--name <text> | --selector <css>) [--card <n>] [--nth <n>] [--across <0-1>]
                                                      Tap the element's middle, or --across that share of its width.
  type <run> <text>                                   Type into the focused element.
  key <run> <key>                                     Press one key, such as e, j, 1, /, Space, ArrowRight or Escape.
  swipe <run> (--card <n> | --selector <css>) [--distance <px>] [--duration <ms>] [--up]
                                                      Drag left (or up with --up) with a touch; default 160px in 128ms, a flick.
  wait <run> --selector <css> [--gone]                Wait until an element is shown, or gone.
  eval <run> <expression>                             Read page state; prints JSON.
  screenshot <run> <name> [--full]                    Save evidence/<name>.png.
  snapshot <run> <name>                               Save the accessibility tree to evidence/<name>.aria.txt.
  stop <run>                                          Stop what launch started; keeps evidence/ and logs/.`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    data: { type: "string" },
    viewport: { type: "string" },
    fresh: { type: "boolean" },
    name: { type: "string" },
    selector: { type: "string" },
    card: { type: "string" },
    nth: { type: "string" },
    across: { type: "string" },
    distance: { type: "string" },
    duration: { type: "string" },
    gone: { type: "boolean" },
    up: { type: "boolean" },
    full: { type: "boolean" },
  },
});

const [command, ...rest] = positionals;

const stateFile = (run) => path.join(run, "state.json");
const readState = (run) => JSON.parse(readFileSync(stateFile(run), "utf8"));
async function writeState(run, state) {
  const draft = `${stateFile(run)}.${process.pid}.tmp`;
  await writeFile(draft, `${JSON.stringify(state, null, 2)}\n`);
  await rename(draft, stateFile(run));
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function spawnDetached(executable, args, { cwd, log, env = process.env }) {
  const output = openSync(log, "a");
  const child = spawn(executable, args, { cwd, env, detached: true, stdio: ["ignore", output, output] });
  child.unref();
  return child.pid;
}

function waitFor(check, { timeout, what }) {
  const deadline = Date.now() + timeout;
  const poll = async () => {
    const value = await check();
    if (value !== undefined && value !== false) return value;
    if (Date.now() >= deadline) throw new Error(`Timed out after ${timeout} ms waiting for ${what}`);
    await sleep(200);
    return poll();
  };
  return poll();
}

async function readTextIfPresent(file) {
  return existsSync(file) ? readFile(file, "utf8") : "";
}

function viewportNamed(name) {
  const viewport = VIEWPORTS[name ?? "mobile"];
  if (viewport === undefined) throw new Error(`Unknown viewport "${name}". Use mobile or desktop.`);
  return viewport;
}

async function prepareSite(run, dataDir) {
  const site = path.join(run, "site");
  await mkdir(path.join(site, "node_modules"), { recursive: true });
  await cp(dataDir, path.join(site, "data"), { recursive: true });
  await cp(path.join(REPOSITORY, "template/package.json"), path.join(site, "package.json"));
  await symlink(REPOSITORY, path.join(site, "node_modules/grok-digest"));
  await symlink(path.join(REPOSITORY, "node_modules/astro"), path.join(site, "node_modules/astro"));
  return site;
}

async function launch() {
  const dataDir = path.resolve(values.data ?? FIXTURE_DATA);
  const viewportName = values.viewport ?? "mobile";
  viewportNamed(viewportName);
  const runId = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${process.pid}`;
  const run = path.join(RUNS_ROOT, runId);
  await mkdir(path.join(run, "logs"), { recursive: true });
  await mkdir(path.join(run, "evidence"), { recursive: true });
  const site = await prepareSite(run, dataDir);
  const devLog = path.join(run, "logs/dev.log");
  const { VITEST: _vitest, ...env } = process.env;
  const devPid = spawnDetached(process.execPath, [CLI, "dev"], {
    cwd: site,
    log: devLog,
    env: { ...env, NO_COLOR: "1" },
  });
  await writeState(run, { status: "starting", run, dataDir, devPid, viewport: viewportName });
  console.log(`RUN=${run}`);
  const url = await waitFor(
    async () => {
      if (!isAlive(devPid)) throw new Error(`The dev server exited. See ${devLog}`);
      return DEV_ADDRESS.exec(await readTextIfPresent(devLog))?.[1];
    },
    { timeout: STARTUP_TIMEOUT_MS, what: "the dev server address" },
  );
  await waitFor(
    async () => {
      if (!isAlive(devPid)) throw new Error(`The dev server exited. See ${devLog}`);
      const response = await fetch(url).catch(() => undefined);
      if (response?.ok !== true) return false;
      const page = await response.text();
      return page.includes("data-bookmark-list") || page.includes("No bookmarks yet");
    },
    { timeout: STARTUP_TIMEOUT_MS, what: "the page to render" },
  );
  await writeState(run, { ...readState(run), url });
  const driverPid = spawnDetached(process.execPath, [SCRIPT, "driver", run], {
    cwd: run,
    log: path.join(run, "logs/driver.log"),
  });
  await writeState(run, { ...readState(run), driverPid });
  await waitFor(
    () => {
      if (!isAlive(driverPid)) throw new Error(`The browser driver exited. See ${path.join(run, "logs/driver.log")}`);
      return readState(run).driverUrl;
    },
    { timeout: STARTUP_TIMEOUT_MS, what: "the browser driver" },
  );
  await writeState(run, { ...readState(run), status: "running" });
  console.log(`URL=${url}`);
  console.log(`EVIDENCE=${path.join(run, "evidence")}`);
}

function connectCdp(webSocketUrl, { onClosed }) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 0;
  let closed = false;
  const failPending = (reason) => {
    closed = true;
    for (const waiter of pending.values()) waiter.reject(new Error(`${waiter.method}: ${reason}`));
    pending.clear();
  };
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    const waiter = pending.get(message.id);
    if (waiter === undefined) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error === undefined) waiter.resolve(message.result);
    else waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(new Error(`${method}: Chrome's DevTools connection is closed`));
        return;
      }
      nextId += 1;
      const id = nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method}: no answer from Chrome after ${CDP_CALL_TIMEOUT_MS} ms`));
      }, CDP_CALL_TIMEOUT_MS);
      pending.set(id, { resolve, reject, method, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      socket.addEventListener("close", () => {
        failPending("Chrome's DevTools connection closed");
        onClosed();
      });
      resolve({ send });
    });
    socket.addEventListener("error", () => {
      failPending("Chrome's DevTools connection failed");
      reject(new Error(`Could not connect to ${webSocketUrl}`));
    });
  });
}

function findChrome() {
  const chrome = CHROME_CANDIDATES.find((candidate) => candidate !== undefined && existsSync(candidate));
  if (chrome === undefined) throw new Error("No Chrome or Chromium found. Set CHROME_BIN to its executable.");
  return chrome;
}

function locateInPage({ selector, name, card, nth }) {
  const cards = Array.from(document.querySelectorAll("[data-bookmark-id]")).filter((each) => each.checkVisibility());
  const roots = card === undefined ? [document] : [cards[card]].filter(Boolean);
  if (roots.length === 0) return { error: `No visible card ${card}; ${cards.length} cards are visible.` };
  const candidates = roots
    .flatMap((root) => Array.from(root.querySelectorAll(selector ?? "button, a, summary, input, label, [role=button]")))
    .filter((each) => each.checkVisibility())
    .map((element) => ({
      element,
      accessibleName: (element.getAttribute("aria-label") ?? element.innerText ?? element.value ?? "")
        .replaceAll(/\s+/g, " ")
        .trim(),
    }));
  const exact = name === undefined ? candidates : candidates.filter(({ accessibleName }) => accessibleName === name);
  const matches =
    exact.length > 0 || name === undefined
      ? exact
      : candidates.filter(({ accessibleName }) => accessibleName.startsWith(name));
  const match = matches[nth ?? 0];
  if (match === undefined) {
    const names = [...new Set(candidates.map(({ accessibleName }) => accessibleName))].slice(0, 60).join(" | ");
    return { error: `No match for ${JSON.stringify({ selector, name, card, nth })}. Visible names: ${names}` };
  }
  const before = match.element.getBoundingClientRect();
  const onScreen = before.top >= 0 && before.left >= 0 && before.bottom <= innerHeight && before.right <= innerWidth;
  const hit = document.elementFromPoint(before.left + before.width / 2, before.top + before.height / 2);
  const reachable = onScreen && hit !== null && match.element.contains(hit);
  if (!reachable) match.element.scrollIntoView({ block: "center", inline: "center" });
  const box = match.element.getBoundingClientRect();
  return {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
    left: box.left,
    right: box.right,
    name: match.accessibleName,
  };
}

async function driver(run) {
  const state = readState(run);
  const profile = path.join(run, "chrome-profile");
  await mkdir(profile, { recursive: true });
  const chromePid = spawnDetached(
    findChrome(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--hide-scrollbars",
      "about:blank",
    ],
    { cwd: run, log: path.join(run, "logs/chrome.log") },
  );
  await writeState(run, { ...readState(run), chromePid });
  const debugPort = await waitFor(
    async () => (await readTextIfPresent(path.join(profile, "DevToolsActivePort"))).split("\n")[0] || undefined,
    { timeout: STARTUP_TIMEOUT_MS, what: "Chrome's debugging port" },
  );
  const pageTarget = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
        .then((response) => response.json())
        .catch(() => []);
      return targets.find((target) => target.type === "page");
    },
    { timeout: STARTUP_TIMEOUT_MS, what: "Chrome's first tab" },
  );
  const cdp = await connectCdp(pageTarget.webSocketDebuggerUrl, {
    onClosed: () => {
      console.error("Chrome closed the DevTools connection. The driver is exiting.");
      process.exit(1);
    },
  });
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const browserVersion = (await cdp.send("Browser.getVersion")).product;
  let viewport = viewportNamed(state.viewport);
  let viewportName = state.viewport;

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      replMode: true,
    });
    if (exceptionDetails !== undefined) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    }
    return result.value;
  };
  const settle = async (ms = SETTLE_MS) => {
    await sleep(ms);
    await evaluate("new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))");
  };
  const locate = async (options) => {
    const located = await evaluate(`(${locateInPage.toString()})(${JSON.stringify(options)})`);
    if (located.error !== undefined) throw new Error(located.error);
    return located;
  };
  const applyViewport = async (name) => {
    viewport = viewportNamed(name);
    viewportName = name;
    const { touch, ...metrics } = viewport;
    await cdp.send("Emulation.setDeviceMetricsOverride", metrics);
    await cdp.send(
      "Emulation.setTouchEmulationEnabled",
      touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false },
    );
  };
  const tap = async ({ x, y }) => {
    if (viewport.touch) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      return;
    }
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  };
  const pageSummary = () =>
    evaluate(`({
      url: location.href,
      status: document.querySelector("p[aria-live]")?.textContent ?? null,
      visibleCards: [...document.querySelectorAll("[data-bookmark-id]")].filter((card) => card.checkVisibility()).length,
    })`);
  const axTreeText = async () => {
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const byId = new Map(nodes.map((node) => [node.nodeId, node]));
    const lines = [];
    const visit = (node, depth) => {
      const role = node.role?.value ?? "";
      const name = String(node.name?.value ?? "").trim();
      const shownHere = !node.ignored && !(SKIPPED_AX_ROLES.has(role) && name === "");
      if (shownHere && !SKIPPED_AX_ROLES.has(role)) {
        const flags = (node.properties ?? [])
          .filter(({ name: flag }) => ["pressed", "expanded", "focused", "checked", "disabled"].includes(flag))
          .map(({ name: flag, value }) => `${flag}=${value.value}`);
        lines.push(
          `${"  ".repeat(depth)}${role}${name === "" ? "" : ` "${name}"`}${flags.map((f) => ` [${f}]`).join("")}`,
        );
      }
      for (const childId of node.childIds ?? []) {
        const child = byId.get(childId);
        if (child !== undefined) visit(child, shownHere ? depth + 1 : depth);
      }
    };
    const root = nodes.find((node) => node.parentId === undefined);
    if (root !== undefined) visit(root, 0);
    return lines.join("\n");
  };
  const evidencePath = (name, extension) => path.join(run, "evidence", `${name}${extension}`);

  const handlers = {
    health: async () => ({ browserVersion, viewport: viewportName, page: await pageSummary() }),
    open: async ({ pagePath = "/", viewport: name, fresh }) => {
      await applyViewport(name ?? viewportName);
      const target = new URL(pagePath, state.url);
      if (fresh === true) {
        await cdp.send("Storage.clearDataForOrigin", { origin: target.origin, storageTypes: "all" });
      }
      await cdp.send("Browser.grantPermissions", {
        origin: target.origin,
        permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
      });
      await cdp.send("Page.navigate", { url: "about:blank" });
      await waitFor(() => evaluate(`location.href === "about:blank" && document.readyState === "complete"`), {
        timeout: PAGE_TIMEOUT_MS,
        what: "the previous page to unload",
      });
      await cdp.send("Page.navigate", { url: target.href });
      await waitFor(
        () =>
          evaluate(
            `location.protocol.startsWith("http") && document.readyState === "complete" && (document.querySelector("[data-bookmark-list][data-ready]") !== null || document.querySelector("[data-bookmark-list]") === null)`,
          ),
        { timeout: PAGE_TIMEOUT_MS, what: `${target.href} to finish loading (if the dev server died, run doctor)` },
      );
      await settle();
      return pageSummary();
    },
    click: async ({ across, ...options }) => {
      const target = await locate(options);
      await settle(50);
      await tap(
        across === undefined ? target : { x: target.left + (target.right - target.left) * across, y: target.y },
      );
      await settle();
      return { clicked: target.name, input: viewport.touch ? "touch" : "mouse", page: await pageSummary() };
    },
    type: async ({ text }) => {
      await cdp.send("Input.insertText", { text });
      await settle();
      return pageSummary();
    },
    key: async ({ key }) => {
      const named = NAMED_KEYS[key];
      const printable = named === undefined ? { text: key, code: `Key${key.toUpperCase()}` } : named;
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, ...printable });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, ...printable, text: undefined });
      await settle();
      return {
        focused: await evaluate(
          `document.activeElement?.closest("[data-bookmark-id]")?.id ?? document.activeElement?.tagName ?? null`,
        ),
        page: await pageSummary(),
      };
    },
    swipe: async ({ card, selector, up, distance = 160, duration = SWIPE_DURATION_MS }) => {
      if (!viewport.touch) throw new Error("Swiping needs touch input. Open the page with --viewport mobile.");
      const heading = await locate(selector === undefined ? { selector: "h2", card } : { selector });
      const across = selector === undefined ? heading.right - 24 : heading.x + distance / 2;
      const startX = up === true ? heading.x : across;
      const startY = up === true ? heading.y + distance / 2 : heading.y;
      const steps = Math.max(2, Math.round(duration / SWIPE_FRAME_MS));
      await settle(50);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y: startY }] });
      const drag = async (step) => {
        if (step > steps) return;
        const moved = (distance * step) / steps;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [up === true ? { x: startX + 1, y: startY - moved } : { x: startX - moved, y: startY + 1 }],
        });
        await sleep(duration / steps - SWIPE_FRAME_MS);
        await drag(step + 1);
      };
      await drag(1);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await settle(SWIPE_SETTLE_MS);
      return { swiped: heading.name, distance, duration, page: await pageSummary() };
    },
    wait: async ({ selector, gone }) => {
      const query = `[...document.querySelectorAll(${JSON.stringify(selector)})].some((element) => element.checkVisibility())`;
      await waitFor(async () => (await evaluate(query)) !== (gone === true), {
        timeout: PAGE_TIMEOUT_MS,
        what: `${selector} to be ${gone === true ? "gone" : "shown"}`,
      });
      return pageSummary();
    },
    eval: ({ expression }) => evaluate(expression),
    screenshot: async ({ name, full }) => {
      const metrics = full === true ? await cdp.send("Page.getLayoutMetrics") : undefined;
      const clip =
        metrics === undefined
          ? undefined
          : { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 };
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "png",
        ...(clip === undefined ? {} : { clip, captureBeyondViewport: true }),
      });
      const file = evidencePath(name, ".png");
      await writeFile(file, Buffer.from(data, "base64"));
      return { file };
    },
    snapshot: async ({ name }) => {
      const summary = await pageSummary();
      const header = `# ${summary.url}\n# viewport: ${viewportName}\n# status: ${summary.status}\n# visible cards: ${summary.visibleCards}\n`;
      const file = evidencePath(name, ".aria.txt");
      await writeFile(file, `${header}\n${await axTreeText()}\n`);
      return { file };
    },
  };

  const dispatch = async (body) => {
    try {
      const { command: name, options } = JSON.parse(body);
      const handler = handlers[name];
      if (handler === undefined) return { ok: false, error: `Unknown driver command "${name}"` };
      return { ok: true, result: await handler(options) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  let queue = Promise.resolve();
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      queue = queue.then(async () => {
        const reply = await dispatch(body);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(reply));
      });
    });
  });
  server.listen(0, "127.0.0.1", async () => {
    const address = server.address();
    await writeState(run, { ...readState(run), driverUrl: `http://127.0.0.1:${address.port}/` });
  });
}

async function ask(run, name, options = {}, { journal = true } = {}) {
  const { driverUrl } = readState(run);
  if (driverUrl === undefined) throw new Error(`No browser driver for ${run}. Run launch first.`);
  const response = await fetch(driverUrl, {
    method: "POST",
    body: JSON.stringify({ command: name, options }),
    signal: AbortSignal.timeout(DRIVER_REPLY_TIMEOUT_MS),
  }).catch((error) => {
    throw new Error(`The browser driver for ${run} did not answer (${error.message}). Run doctor.`);
  });
  const reply = await response.json();
  if (journal) {
    await appendFile(
      path.join(run, "evidence/journal.log"),
      `${new Date().toISOString()} ${name} ${JSON.stringify(options)}\n  -> ${JSON.stringify(reply)}\n`,
    );
  }
  if (!reply.ok) throw new Error(reply.error);
  return reply.result;
}

function probe(tool, args) {
  try {
    return execFileSync(tool, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(`${tool} is needed to check this run's processes and is not installed.`, { cause: error });
    return "";
  }
}

function listenerPid(url) {
  const { port } = new URL(url);
  return Number(probe("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]).split("\n")[0]) || undefined;
}

function processGroup(pid) {
  return Number(probe("ps", ["-o", "pgid=", "-p", String(pid)])) || undefined;
}

function commandOf(pid) {
  return probe("ps", ["-o", "command=", "-p", String(pid)]);
}

function workingDirectoryOf(pid) {
  const procLink = `/proc/${pid}/cwd`;
  if (existsSync(procLink)) return realPath(procLink);
  return probe("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])
    .split("\n")
    .find((field) => field.startsWith("n"))
    ?.slice(1);
}

function realPath(file) {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}

const STARTED_PROCESSES = {
  devPid: (pid, run) =>
    commandOf(pid).includes(`${CLI} dev`) && workingDirectoryOf(pid) === realPath(path.join(run, "site")),
  driverPid: (pid, run) => commandOf(pid).includes(`${SCRIPT} driver ${run}`),
  chromePid: (pid, run) => commandOf(pid).includes(`--user-data-dir=${path.join(run, "chrome-profile")}`),
};

function isStartedBy(state, key) {
  const pid = state[key];
  return pid !== undefined && isAlive(pid) && processGroup(pid) === pid && STARTED_PROCESSES[key](pid, state.run);
}

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {}
}

async function doctor(run) {
  const state = readState(run);
  let failed = false;
  const check = (label, ok, detail) => {
    failed ||= !ok;
    console.log(`${ok ? "✓" : "✖"} ${label}${detail === undefined ? "" : ` (${detail})`}`);
  };
  check("run is running", state.status === "running", state.status);
  if (state.status !== "running") {
    process.exitCode = 1;
    return;
  }
  for (const key of Object.keys(STARTED_PROCESSES)) {
    check(`${key} ${state[key]} is alive and started by this run`, isStartedBy(state, key));
  }
  const listener = listenerPid(state.url);
  check(
    `port at ${state.url} belongs to this run's dev server`,
    listener !== undefined && processGroup(listener) === state.devPid,
    `listener pid ${listener}`,
  );
  const page = await fetch(state.url)
    .then((response) => response.text())
    .catch(() => "");
  const served = (page.match(/data-bookmark-id=/g) ?? []).length;
  const seeded = JSON.parse(readFileSync(path.join(run, "site/data/bookmarks.json"), "utf8")).length;
  check("page title is Grok Digest", page.includes("<title>Grok Digest</title>"));
  check(`page serves all ${seeded} seeded bookmarks`, served === seeded, `${served} served`);
  const revision = execFileSync("git", ["-C", REPOSITORY, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["-C", REPOSITORY, "status", "--porcelain"], { encoding: "utf8" }).trim() !== "";
  check(`serving ${REPOSITORY} at ${revision}${dirty ? " plus uncommitted changes" : ""}`, true);
  const browserUp = isStartedBy(state, "driverPid") && isStartedBy(state, "chromePid");
  const health = browserUp
    ? await ask(run, "health", {}, { journal: false }).catch((error) => ({ error: error.message }))
    : { error: "skipped: the driver or Chrome is not running" };
  check("browser driver answers", health.error === undefined, JSON.stringify(health));
  if (failed) process.exitCode = 1;
}

async function stop(run) {
  const state = readState(run);
  const evidence = path.join(run, "evidence");
  if (state.status === "stopped") {
    console.log(`Already stopped. Evidence kept in ${evidence}`);
    return;
  }
  const running = Object.keys(STARTED_PROCESSES).filter((key) => state[key] !== undefined && isAlive(state[key]));
  const ours = running.filter((key) => isStartedBy(state, key));
  for (const key of running.filter((each) => !ours.includes(each))) {
    console.log(
      `${key} ${state[key]} is alive but no longer runs this run's command, so another program reused it. Left alone.`,
    );
  }
  const pids = ours.map((key) => state[key]);
  for (const pid of pids) signalGroup(pid, "SIGTERM");
  const allExited = () => pids.every((pid) => !isAlive(pid));
  await waitFor(allExited, { timeout: STOP_GRACE_MS, what: "this run's processes to exit" }).catch(async () => {
    for (const pid of pids) signalGroup(pid, "SIGKILL");
    await waitFor(allExited, { timeout: STOP_GRACE_MS, what: "this run's processes to die" }).catch(() => undefined);
  });
  const survivors = pids.filter((pid) => isAlive(pid));
  if (survivors.length > 0) {
    throw new Error(
      `Could not stop process groups ${survivors.join(", ")}. The run stays marked running; check them with ps, then run stop again.`,
    );
  }
  await rm(path.join(run, "site"), { recursive: true, force: true });
  await rm(path.join(run, "chrome-profile"), { recursive: true, force: true });
  await writeState(run, {
    ...state,
    status: "stopped",
    driverUrl: undefined,
    devPid: undefined,
    driverPid: undefined,
    chromePid: undefined,
  });
  console.log(`Stopped. Evidence kept in ${evidence}`);
}

const integer = (value) => (value === undefined ? undefined : Number(value));
const print = (result) => console.log(JSON.stringify(result, null, 2));

async function main() {
  const [run, ...args] = rest;
  const runDir = run === undefined ? undefined : path.resolve(run);
  const needsRun = () => {
    if (runDir === undefined || !existsSync(stateFile(runDir))) throw new Error(`Pass a run directory.\n\n${USAGE}`);
    return runDir;
  };
  switch (command) {
    case "launch":
      return launch();
    case "driver":
      return driver(needsRun());
    case "doctor":
      return doctor(needsRun());
    case "open":
      return print(
        await ask(needsRun(), "open", { pagePath: args[0], viewport: values.viewport, fresh: values.fresh }),
      );
    case "click":
      return print(
        await ask(needsRun(), "click", {
          name: values.name,
          selector: values.selector,
          card: integer(values.card),
          nth: integer(values.nth),
          across: values.across === undefined ? undefined : Number(values.across),
        }),
      );
    case "type":
      return print(await ask(needsRun(), "type", { text: args.join(" ") }));
    case "key":
      return print(await ask(needsRun(), "key", { key: args[0] }));
    case "swipe":
      return print(
        await ask(needsRun(), "swipe", {
          card: integer(values.card) ?? 0,
          selector: values.selector,
          up: values.up,
          distance: integer(values.distance),
          duration: integer(values.duration),
        }),
      );
    case "wait":
      return print(await ask(needsRun(), "wait", { selector: values.selector, gone: values.gone }));
    case "eval":
      return print(await ask(needsRun(), "eval", { expression: args.join(" ") }));
    case "screenshot":
      return print(await ask(needsRun(), "screenshot", { name: args[0], full: values.full }));
    case "snapshot":
      return print(await ask(needsRun(), "snapshot", { name: args[0] }));
    case "stop":
      return stop(needsRun());
    default:
      console.log(USAGE);
      if (command !== undefined && command !== "help") process.exitCode = 1;
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
