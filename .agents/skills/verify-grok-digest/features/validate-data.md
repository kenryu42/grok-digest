# Validate data files

A site owner (or their Grok bot) checks the data files before a deploy with `grok-digest validate`. It prints one `✓` line per good file with its bookmark count, and for a bad file it names the entry and field and exits 1.

## Sub-features

- `validate-default` checks `data/bookmarks.json` and whichever of `data/processed.json` and `data/removed.json` exist.
- `validate-files` checks the files named on the command line.
- `validate-data-dir` reads a different folder with `--data-dir`.
- `validate-errors` reports each invalid field as `✖ <message>` and `→ at [<index>].<field>`, and exits 1.

## How to get to it (user POV)

- In a site repository: `bun run validate`, which runs `grok-digest validate`.
- From this checkout: `node src/cli.ts validate [--data-dir <dir>] [file ...]`.

## Driving it with verify.mjs

Preconditions:

- No run is needed. The CLI is short-lived. Run it from the repository root, write anything it needs into a scratch directory, and save its output as evidence.

- **Good data.** Run `node src/cli.ts validate --data-dir .agents/skills/verify-grok-digest/fixtures/data; echo "exit $?"`. It prints `✓ .agents/skills/verify-grok-digest/fixtures/data/bookmarks.json: 15 bookmarks` and `exit 0`.
- **Bad data.** Make a broken copy in a scratch directory: `S=$(mktemp -d) && jq '.[0].author.handle = "not a handle!" | .[1].url = "https://example.com/x"' .agents/skills/verify-grok-digest/fixtures/data/bookmarks.json > "$S/bookmarks.json"`, then run `node src/cli.ts validate "$S/bookmarks.json"; echo "exit $?"`. It prints `✖ … is invalid:`, then `✖ Invalid URL` with `→ at [1].url` and `✖ must be an X handle such as @jack` with `→ at [0].author.handle`, and `exit 1`.
- **Proof.** Save each command, its stdout and stderr, and its exit code to a file in an evidence directory, such as `$RUN/evidence/validate-*.txt` when a run exists. Otherwise use a directory under `$TMPDIR/grok-digest-verify/`.

## Gotchas

- Paths in the output are relative to the current directory, so run from the repository root when asserting exact lines.
- `jq` is used here only to make bad data. Any edit that breaks one field will do.
- With no file arguments and no `bookmarks.json` in the data folder, validate fails on the missing file. That is a precondition failure, not a schema error.
