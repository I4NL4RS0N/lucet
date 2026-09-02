# Lucet

[![npm: lucet-core](https://img.shields.io/npm/v/lucet-core?style=flat&label=lucet-core)](https://www.npmjs.com/package/lucet-core)
[![npm: lucet-react](https://img.shields.io/npm/v/lucet-react?style=flat&label=lucet-react)](https://www.npmjs.com/package/lucet-react)

**AI interface patterns for what comes next.**

An open-source library of AI interface components, built around the states real
AI features actually hit — refusals, interruptions, rate limits, stale answers, a
silent downgrade to a cheaper model — with a written rationale for every one.

https://github.com/user-attachments/assets/bf9d319b-1412-45e3-8d51-26e181151126

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
restore designed as a visible state — set-aside turns you can still
see, a banner saying you are looking at the past — where the field's
checkpoint components rewind by silently slicing the message array; a
single-writer turn lock, and a thread that switches to collaborative
grammar the moment a second human speaks. None of these are bolt-ons:
the core is an event log, so history, versions, provenance and presence
are reads, not features glued on top. All four of the surfaces the
thesis names are running: versioning, multiplayer, **Scope Control**
(the breadcrumb is a scope ladder, reading the host's own navigation)
and the **Budget Meter** (the price before you spend it — the model
picker grown into a meter that projects the next turn's cost, per
model, before you commit).

**Accessibility is a gate, not a pass at the end.** WCAG 2.2 AA is enforced on
every component by an audit that drives a real Chromium and measures what is
actually painted — 3,500+ checks across 44 theme, expression and accent
combinations, run in CI on every push to `main` and every pull request. It renders a real browser on purpose:
three of the first four contrast failures were cascade and paint behaviour that
parsing tokens could never have seen.

> **The behavior is one contract. The look is the host's.**
> Theme, accent, material, typeface — every combination runs the
> same states, the same announcements, the same geometry. Nothing
> about a refusal or a restore changes because a host chose a
> different accent.[^contract]

[^contract]: Checked on every commit rather than claimed: the [overlay test](scripts/audit-expression-geometry.mjs) asserts identical geometry across the material axis, and the [theme-parity audit](scripts/audit-theme-parity.mjs) asserts identical tokens down both theme paths.

<details>
<summary><strong>The supporting material</strong> — the rationale docs, theme parity, dependencies, shadcn interop, the icon slot, and the token contract</summary>

**A written rationale for every component.** Each one ships with its
positions, the alternatives that were tried and cut, and what is
deliberately deferred — with the reason. The judgment is the product;
the components are its proof.

**A theme cannot depend on how you reached it.** Dark is declared twice — once
under `prefers-color-scheme`, once under `[data-theme]` — because CSS gives no
way to share one declaration body across a media query and an attribute
selector. Those copies drift silently, so a second audit reads every custom
property down both paths and fails if they disagree.

**Almost no dependencies.** `lucet-core` has none at all. `lucet-react` depends
on `lucet-core` and takes React as a peer — nothing further. **No Tailwind**, anywhere — vanilla CSS with custom
properties.

**It drops into shadcn projects.** Every token in the semantic layer — the
colour roles, 21 of them — reads `var(--shadcn-name, our-default)`, so setting
the bare shadcn variable themes Lucet without knowing Lucet exists.

**Icons are a slot, not a dependency.** A default set ships vendored and
attributed; any of it can be replaced without forking.

**The token surface is a documented contract.** [docs/tokens.md](docs/tokens.md)
says which properties you may build on and which are implementation detail — and
a test fails if a token is added to the CSS without being classified.

</details>

## Status

**Shipped, 0.1.0** — on npm as of September 2026. The event-sourced
core: streaming, aborts, the tool lifecycle, versioning and
restore-as-copy, scope, usage and budget projection, and the
screen-reader announcement plan. The React layer: twelve baseline
components with every state reachable — streaming markdown, reasoning
disclosure, tool calls with receipts, suggestion chips with the ask/do
split, feedback controls, citations & sources with aging, version
marker + restore — demonstrated in one persistent interface across
three honest containers (a full-page app, a drawer over a host
application, a phone). All four of the thesis's surfaces run: scope,
versions, multiplayer, budget. The bar for publishing was the same as
the bar for everything else here.

**Next** — one component at a time, each with its written rationale:

- An approval/consent gate: the turn that cannot proceed until a human
  says so, designed as a first-class state rather than a modal.
- An agent task list: long-running work you can leave and return to,
  with progress that admits what it doesn't know.

Ten to twelve components done properly is the whole scope; these are
the next two.

## Packages

| Package | What it is |
|---|---|
| [`lucet-core`](https://www.npmjs.com/package/lucet-core) | Framework-free headless core. All state logic, zero framework imports. |
| [`lucet-react`](https://www.npmjs.com/package/lucet-react) | Thin React bindings over the core. |

```bash
npm install lucet-core lucet-react
```

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
