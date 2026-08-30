# lucet-react

React bindings for [`lucet`](https://www.npmjs.com/package/lucet).

**Status: not ready. This is a name placeholder at `0.0.1`.**
There is no stable API yet, and what is here will change. Please do not build
on it. Watch [the repository](https://github.com/I4NL4RS0N/lucet) for the first
real release.

## What this will be

The thin React half of Lucet, an open-source library of AI interface components
built around the states most libraries skip: refusals, interruptions, rate
limits, stale answers, silent downgrades to a cheaper model.

All state logic lives in `lucet`; this package stays thin. Styling is vanilla
CSS with custom properties — **no Tailwind dependency** — and the token names
map onto shadcn's CSS variable names, so setting the bare shadcn name works
without knowing Lucet exists. Icons ship as a slot with an overridable default,
not as a hard dependency.

WCAG 2.2 AA is enforced on every component by an audit that drives a real
browser in CI.

MIT licensed. Bundled icon paths derive from Lucide (ISC) — see `NOTICE`.
