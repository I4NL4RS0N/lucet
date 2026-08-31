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

**The missing states, designed.** Most AI tools — and every component
library under them — ship the happy path and improvise the rest. Lucet
names the rest and designs each one: refused, interrupted, failed,
rate-limited, silently downgraded, answered from stale cache, partly
done. Every ending is triple-coded — silhouette, word, and tone, never
colour alone — and the tones stand on the ANSI/ISO severity standard,
with the reasoning written into the tokens themselves.

**The missing features, working.** The things AI products need and
component libraries don't attempt: citations that keep aging after the
answer settles (a citation is a claim with a timestamp — sources go
stale or vanish, and the bibliography says so); version markers and
restore (every prompt is a commit, so the thread *is* the history); a
single-writer turn lock, and a thread that switches to collaborative
grammar the moment a second human speaks. None of these are bolt-ons:
the core is an event log, so history, versions, provenance and presence
are reads, not features glued on top. Versioning and multiplayer are two
of the four surfaces the thesis names; the other two — **Scope Control**
(the breadcrumb is a scope ladder) and the **Budget Meter** (the price
before you spend it) — are next, and the Configurator's host application
was built with the navigation Scope Control will read.

**A written rationale for every component.** Each one ships with its
positions, the alternatives that were tried and cut, and what is
deliberately deferred — with the reason. The judgment is the product;
the components are its proof.

**Accessibility is a gate, not a pass at the end.** WCAG 2.2 AA is enforced on
every component by an audit that drives a real Chromium and measures what is
actually painted — 3,600+ checks across 44 theme, expression and accent
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

The first components are real, audited, and running: streaming markdown,
reasoning disclosure, tool calls with receipts, suggestion chips with the
ask/do split, feedback controls, citations & sources with aging, and
version marker + restore — demonstrated in one persistent interface
across three honest containers (a full-page app, a drawer over a host
application, a phone). Two of the thesis's four surfaces are running;
Scope Control and the Budget Meter are the next builds, in that order.
Nothing is on npm yet, deliberately: the bar for
publishing is the same as the bar for everything else here.

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
