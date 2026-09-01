# @lucet/core

Framework-free state logic for AI interface components.

Most component libraries ship the happy path. `@lucet/core` is built around
the states real AI features actually hit — refusals, interruptions,
rate limits, partial tool failures, stale citations, a spent budget —
as first-class, reachable, reproducible states.

The core is an event-sourced store with a pure, total reducer and an
injectable clock. Every state in the docs is produced by replaying
real events, never by flags. It has no framework imports.

React today, adapters welcome, the core is yours to wrap.

## Install

```
npm install @lucet/core
```

## The smallest real example

```ts
import { createLucet } from '@lucet/core'

const lucet = createLucet()
lucet.subscribe(() => {
  const { turns, status } = lucet.getState()
  render(turns, status) // your renderer — lucet-react is one
})

await lucet.submit('Summarise the three documents I shared.')
// The response streams through the store as events: text deltas,
// tool lifecycle, settlement. Interrupt it, retry it, restore an
// earlier version — every path is an ordinary event.
```

Tokens ship at `@lucet/core/styles.css` — vanilla CSS custom properties,
mapped onto shadcn's variable names, with light/dark themes and the
Paper/Glass material axis at identical geometry.

## Where the thinking lives

Every component has a written rationale, and the docs run the real
runtime: **https://lucet.design** — the argument itself is in the
[thesis](https://github.com/I4NL4RS0N/lucet/blob/main/docs/thesis.md).

MIT.
