# lucet

Framework-free state logic for AI interface components.

**Status: not ready. This is a name placeholder at `0.0.1`.**
There is no stable API yet, and what is here will change. Please do not build
on it. Watch [the repository](https://github.com/I4NL4RS0N/lucet) for the first
real release.

## What this will be

Lucet is an open-source library of AI interface components. The argument is that
the hard part of an AI interface is not the happy path — it is the refusal, the
interruption, the rate limit, the stale answer, the silent downgrade to a
cheaper model. Most component libraries ship the happy path and leave the rest
to you.

`lucet` is the headless half: an event-sourced store with a pure, total reducer
and an injectable clock, so every state is reachable and reproducible. It has no
framework imports. `lucet-react` is the thin React binding over it.

Accessibility is a requirement rather than a pass at the end: WCAG 2.2 AA is
enforced on every component by an audit that drives a real browser in CI.

MIT licensed.
