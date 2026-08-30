# Lucet

**AI interface patterns for what comes next.**

An open-source library of AI interface components, built around the states real
AI features actually hit — refusals, interruptions, rate limits, stale answers, a
silent downgrade to a cheaper model — with a written rationale for every one.

Most component libraries ship the happy path. The happy path is the easy half.

The argument is in **[docs/thesis.md](docs/thesis.md)**: existing AI interface
libraries treat the artifact and its context as living outside the conversation,
and they don't. Scope, versioning, multiplayer and budget all fall out of that
one observation.

## What makes it different

**Accessibility is a gate, not a pass at the end.** WCAG 2.2 AA is enforced on
every component by an audit that drives a real Chromium and measures what is
actually painted — 1188 checks across 44 theme, expression and accent
combinations, run in CI on every push to `main` and every pull request. It renders a real browser on purpose:
three of the first four contrast failures were cascade and paint behaviour that
parsing tokens could never have seen.

**A theme cannot depend on how you reached it.** Dark is declared twice — once
under `prefers-color-scheme`, once under `[data-theme]` — because CSS gives no
way to share one declaration body across a media query and an attribute
selector. Those copies drift silently, so a second audit reads every custom
property down both paths and fails if they disagree.

**Almost no dependencies.** `lucet` has none at all. `lucet-react` depends on
`lucet` and takes React as a peer — nothing further. **No Tailwind**, anywhere — vanilla CSS with custom
properties.

**It drops into shadcn projects.** Every token in the semantic layer — the
colour roles, 21 of them — reads `var(--shadcn-name, our-default)`, so setting
the bare shadcn variable themes Lucet without knowing Lucet exists.

**Icons are a slot, not a dependency.** A default set ships vendored and
attributed; any of it can be replaced without forking.

**The token surface is a documented contract.** [docs/tokens.md](docs/tokens.md)
says which properties you may build on and which are implementation detail — and
a test fails if a token is added to the CSS without being classified.

## Status

Early, and honest about it: the argument is further along than the code, and
nothing is published yet. The foundations — state model, token system,
accessibility tooling — are the parts that are real.

## Packages

| Package | What it is |
|---|---|
| `lucet` | Framework-free headless core. All state logic, zero framework imports. |
| `lucet-react` | Thin React bindings over the core. |

React today, adapters welcome, the core is yours to wrap.

## Docs

The docs site is not a component gallery. It is one persistent, realistic
interface with a rail of state triggers beside it, driven by a scripted
deterministic runtime, so any state can be forced in context and chained into
the next one.

## Development

```bash
npm install
npm run dev      # docs site on :4340
npm run verify   # build, typecheck, tests, and both audits
```

## License

MIT. Bundled icon paths derive from Lucide (ISC) — see [NOTICE](NOTICE).
