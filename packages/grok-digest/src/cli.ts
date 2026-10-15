#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { SCHEMA_VERSION } from "./lib/bookmarks.ts";
import { defaultDataFiles, validateFiles } from "./lib/validate.ts";

const USAGE = `Usage: grok-digest validate [file ...] [--data-dir <dir>]

Checks Grok Digest data files against schema version ${SCHEMA_VERSION}.
With no file, checks <dir>/bookmarks.json and, when present, <dir>/processed.json
and <dir>/removed.json. <dir> defaults to "data".

Options:
  --data-dir <dir>  The folder that holds the data files.
  -h, --help        Show this help.
  -v, --version     Show the package and schema versions.`;

const packageJson = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")));

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "data-dir": { type: "string", default: "data" },
    help: { type: "boolean", short: "h" },
    version: { type: "boolean", short: "v" },
  },
});

const [command, ...files] = positionals;

if (values.version === true) {
  console.log(`grok-digest ${packageJson.version} (schema version ${SCHEMA_VERSION})`);
} else if (values.help === true || command === undefined) {
  console.log(USAGE);
} else if (command === "validate") {
  const cwd = process.cwd();
  const targets = files.length > 0 ? files : await defaultDataFiles({ cwd, dataDir: values["data-dir"] });
  const reports = await validateFiles({ cwd, files: targets });
  for (const report of reports) {
    if (report.ok) console.log(`✓ ${report.source}: ${report.summary}`);
    else console.error(`✖ ${report.error}`);
  }
  if (reports.some((report) => !report.ok)) process.exitCode = 1;
} else {
  console.error(`Unknown command "${command}".\n\n${USAGE}`);
  process.exitCode = 1;
}
