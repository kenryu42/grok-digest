import { describe, expect, it } from "vitest";
import { parseBookmarks } from "../src/lib/bookmarks.ts";
import { copyText } from "../src/lib/copy.ts";

const base = {
  id: "1",
  url: "https://x.com/poteto/status/1",
  author: { name: "lauren", handle: "poteto" },
  posted_at: "2026-10-13T23:24:10.000Z",
  saved_at: "2026-10-15T11:21:40+09:00",
  topic: "ai-agents",
  shelf_life: "evergreen",
  tldr: "Stale workaround comments spread because coding agents copy them",
  summary: "Argues you should delete most code comments.",
  text: "",
  key_points: [],
  action: "",
  links: [],
};

const copied = (entry: Record<string, unknown>) =>
  copyText(parseBookmarks({ raw: [{ ...base, ...entry }], source: "test.json" })[0]!);

describe("copyText", () => {
  it("gives an AI assistant the post, the summary, what to try and the links", () => {
    expect(
      copied({
        text: "ban most code comments!\n\nagents copy what exists.",
        key_points: ["Agents imitate existing code.", "Keep comments that must exist."],
        action: "Run /no-comments on one repo.",
        links: [{ title: "pstack: the /no-comments skill", url: "https://github.com/example/pstack" }],
      }),
    ).toBe(
      [
        "A post I saved from X:",
        "",
        "**Stale workaround comments spread because coding agents copy them**",
        "lauren (@poteto) · posted Oct 13, 2026 · https://x.com/poteto/status/1",
        "",
        "> ban most code comments!",
        ">",
        "> agents copy what exists.",
        "",
        "Summary: Argues you should delete most code comments.",
        "",
        "Key points:",
        "- Agents imitate existing code.",
        "- Keep comments that must exist.",
        "",
        "Try: Run /no-comments on one repo.",
        "",
        "Links:",
        "- pstack: the /no-comments skill: https://github.com/example/pstack",
      ].join("\n"),
    );
  });

  it("leaves out the parts a bookmark does not have", () => {
    expect(copied({})).toBe(
      [
        "A post I saved from X:",
        "",
        "**Stale workaround comments spread because coding agents copy them**",
        "lauren (@poteto) · posted Oct 13, 2026 · https://x.com/poteto/status/1",
        "",
        "Summary: Argues you should delete most code comments.",
      ].join("\n"),
    );
  });
});
