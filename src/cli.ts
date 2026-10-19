#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { SCHEMA_VERSION } from "./lib/bookmarks.ts";
import { isOverridable, OVERRIDABLE_COMPONENTS } from "./lib/custom.ts";
import { displayPath, ejectComponent, mergeOverrides } from "./lib/eject.ts";
import { defaultDataFiles, validateFiles } from "./lib/validate.ts";
import type { SiteCommand } from "./site.ts";

const USAGE = `Usage: grok-digest <command> [options]

Commands:
  build                Build the site into dist/.
  dev                  Serve the site at http://localhost:4321 and reload on changes.
  preview              Serve the site built in dist/.
  validate [file ...]  Check data files against schema version ${SCHEMA_VERSION}. With no
                       file, checks <dir>/bookmarks.json and, when present,
                       <dir>/processed.json, <dir>/removed.json,
                       custom/config.json and every <dir>/magazine/*.json.
  eject <component>    Copy a component into custom/components/ to change it.
                       Components: ${OVERRIDABLE_COMPONENTS.join(", ")}.
  merge                Bring each ejected component up to the installed
                       version, keeping your changes.

Options:
  --data-dir <dir>  The folder that holds the data files. Defaults to "data".
  --host            With dev or preview, also serve on this machine's network
                    address, so a phone on the same Wi-Fi can open the site.
  -h, --help        Show this help.
  -v, --version     Show the package and schema versions.

Environment:
  SITE_URL   The site's origin, such as https://<your-username>.github.io.
  BASE_PATH  The path the site is served under, such as /<repository-name>.`;

const packageJson = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")));

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "data-dir": { type: "string", default: "data" },
    host: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
  },
});

const [command, ...files] = positionals;
const dataDir = values["data-dir"];
const NODE_ENV_FOR_SITE_COMMAND = {
  build: "production",
  dev: "development",
  preview: "production",
} as const satisfies Record<SiteCommand, string>;

const isSiteCommand = (name: string): name is SiteCommand => Object.hasOwn(NODE_ENV_FOR_SITE_COMMAND, name);

if (values.version === true) {
  console.log(`grok-digest ${packageJson.version} (schema version ${SCHEMA_VERSION})`);
} else if (values.help === true || command === undefined) {
  console.log(USAGE);
} else if (command === "validate") {
  const cwd = process.cwd();
  const targets = files.length > 0 ? files : await defaultDataFiles({ cwd, dataDir });
  const reports = await validateFiles({ cwd, files: targets });
  for (const report of reports) {
    if (report.ok) {
      console.log(`✓ ${report.source}: ${report.summary}`);
      for (const warning of report.warnings ?? []) console.warn(`⚠ ${report.source}: ${warning}`);
    } else {
      console.error(`✖ ${report.error}`);
    }
  }
  if (reports.some((report) => !report.ok)) process.exitCode = 1;
} else if (command === "eject") {
  const [name = ""] = files;
  if (isOverridable(name)) {
    const cwd = process.cwd();
    try {
      const file = await ejectComponent({ root: cwd, name });
      console.log(`✓ Copied ${name} to ${displayPath(cwd, file)}. Edit that file to change it.`);
    } catch (error) {
      console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  } else {
    const named = name === "" ? "Name a component to eject." : `"${name}" is not a component you can eject.`;
    console.error(`${named} Components: ${OVERRIDABLE_COMPONENTS.join(", ")}.`);
    process.exitCode = 1;
  }
} else if (command === "merge") {
  try {
    const reports = await mergeOverrides(process.cwd());
    if (reports.length === 0) console.log("No ejected components to merge.");
    for (const report of reports) {
      if (report.outcome === "conflicts") {
        console.error(
          `✖ ${report.file}: ${report.conflicts} conflicting change${report.conflicts === 1 ? "" : "s"}. Resolve each <<<<<<< block, then build.`,
        );
        process.exitCode = 1;
      } else {
        console.log(`✓ ${report.file}: ${report.outcome}`);
      }
    }
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
} else if (isSiteCommand(command)) {
  process.env["NODE_ENV"] ??= NODE_ENV_FOR_SITE_COMMAND[command];
  const { runSite } = await import("./site.ts");
  await runSite(command, { dataDir, exposed: values.host });
} else {
  console.error(`Unknown command "${command}".\n\n${USAGE}`);
  process.exitCode = 1;
}
