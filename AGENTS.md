# Agent instructions

`pnpm check` runs every check a change must pass: type checks, Oxlint, Oxfmt, the comment lint, jscpd,
Knip and the tests. Run it before you finish. `pnpm format` and `pnpm lint:fix` apply fixes.

## Comments

- Do not write code comments. Say it in code: a clearer name, a named value, a type.
- Only these directives are allowed: a `#!` hashbang on a file's first line, a bare
  `/** @internal */`, `/// <reference … />`, `// oxlint-disable-next-line <rules> -- <reason>` and
  `// @ts-expect-error <reason>`, with the last two written as `{/* … */}` inside JSX.
- A fact about an external tool that code cannot express stays only when the maintainer adds it to
  the `allow` map in `scripts/comment-lint.json`. Never add entries there or to its `exclude` list
  yourself. Deleting an entry whose comment is gone is fine.
- `pnpm lint:comments`, part of `pnpm check`, enforces this. To fix a failure, follow
  `.agents/skills/fix-comment-lint/SKILL.md`.
