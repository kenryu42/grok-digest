import { execFileSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";

const COPIED_AS_IS = /\.(?:astro|css|png|svg|txt)$/;

rmSync("dist", { recursive: true, force: true });
execFileSync("tsc", ["-p", "tsconfig.build.json"], { stdio: "inherit" });
cpSync("src", "dist", {
  recursive: true,
  filter: (source) => !source.includes(".") || COPIED_AS_IS.test(source),
});
