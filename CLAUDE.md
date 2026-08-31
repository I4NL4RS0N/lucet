# CLAUDE.md · Lucet

## ⚠️ Read this first: this repo is Lucet, and nothing else

Other, unrelated projects live elsewhere on this machine. They are separate
repos with separate hosting and, in some cases, opposite visibility rules.

- **Never** edit files outside this repository. If a task appears to need it,
  stop and ask.
- **Never** deploy from a directory other than this one. The Netlify CLI uses
  whatever `.netlify` link is in the current working directory. Confirm the
  target project is `lucet` before any deploy.
- Confirm the working directory before starting a dev server. This docs site
  runs on port 4340. Note that after a directory change, the session's working
  directory does not actually move until the end of the turn.
- Do not carry conventions in from another project. Decisions here are made
  here.

The specifics of the other projects are deliberately not in this file, because
this file is public. See the local brief.

Lucet is an open-source library of AI interface components, plus a hand-designed
docs site (the "Konfabulator") that demonstrates them. The point is documented
design judgment and complete state coverage, not component count.

Shape of the repo:
- `packages/core` → npm `lucet`. Framework-free headless state logic, zero
  framework imports.
- `packages/react` → npm `lucet-react`. Thin React bindings. Ships first.
- `apps/docs` → `@lucet/docs`. The Konfabulator: one persistent realistic
  interface with a state trigger rail, backed by a scripted deterministic mock
  runtime.

## Source of truth

**`docs/design-brief.md` is the source of truth for scope, positioning, and
architecture. Read it at the start of every session, before proposing or writing
anything.** When this file and the brief disagree, the brief wins.

⚠️ **The brief is deliberately gitignored and local-only.** It is not part of the
public repo and must never be committed. A backup lives at
`~/Desktop/design-brief.md`. If it is missing after a fresh clone, ask before
proceeding rather than working without it.

`docs/thesis.md` is the public version of the argument. It carries the thesis and
the principles, without the private positioning material. It is committed.

## Standing constraints

Repeated here because they are easy to violate by reflex:

- **No Tailwind dependency, anywhere.** Vanilla CSS with custom properties; token
  names map onto shadcn's CSS variable names.
- **Not Storybook.** The docs site is one running interface with injected states,
  never component-at-a-time with a props panel.
- All state logic lives in `core`. React stays thin.
- **WCAG 2.2 AA is a hard requirement on every component**, not a pass at the
  end. Watch 2.5.8 target size (24x24), 2.4.11 focus not obscured, 1.4.11
  non-text contrast 3:1, and 1.4.1 use of colour: every state needs a distinct
  silhouette, never colour alone.
- Scope discipline: ten to twelve components done properly, with written
  rationale for each. Pick from the named patterns, do not build all ten.
- **Commit messages are plain and functional.** Imperative mood, under 72
  characters, naming the component, file, or token that changed. No
  metaphor, no aphorism, no colon-then-flourish construction. Reasoning
  goes in the commit body or in the component's rationale doc — never
  carried by the subject line alone. Someone should be able to
  `git log --oneline | grep radius` and find the radius work.
- **This repo is public. Never commit a secret.** History goes public with it and
  stays public even after a later removal.
- Keep this project strictly separate from every other project on this machine.
  Separate repo, separate Netlify project, no cross-repo edits. See the
  guardrail at the top of this file.
- This site is meant to be found. No noindex, no robots exclusion.
