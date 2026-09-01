<!-- PROMOTE-DAY DRAFT. This file is the staged README; on promote day
     the slots below get filled and the whole file replaces README.md.
     Nothing with a slot marker ships on main's rendered README. -->

# Lucet

AI interface components for the states real AI features actually hit.

<!-- SLOT: RECORDING — Ian drag-uploads the walkthrough into the GitHub
     editor here for the inline player. Canonical copy of the take:
     docs/media/state-recovery.webm (the composed chain) and the
     walkthrough re-cut delivered alongside this pass. -->

Most component libraries ship the happy path and improvise the rest.
Lucet names the rest and designs each one — refused, interrupted,
rate-limited, partly done, answered from stale sources, silently
downgraded, over budget — every ending a distinct silhouette, never
colour alone. The argument is in [the thesis](docs/thesis.md):
existing AI interface libraries treat the artifact and its context as
living outside the conversation, and they don't.

## In 0.1

- The twelve baseline components, every state reachable and shown on
  a running page — the docs replay real events through the real
  reducer, never flags.
- The unhappy states, designed: silhouette, word, and tone for each,
  with the written rationale beside every component.
- Two themes and a material axis: light/dark, and Paper/Glass at
  identical geometry — switching moves nothing, only the material
  changes.
- Citations that keep aging, version markers with restore-as-copy,
  scope control, a budget meter that prices the next turn before you
  spend it.

## Install

```
npm install @lucet/core @lucet/react
```

`@lucet/core` is the framework-free core: an event-sourced store, a pure
total reducer, an injectable clock. `@lucet/react` is the thin binding.
React today, adapters welcome, the core is yours to wrap.

## Docs

**https://lucet.design** — one persistent interface with a state
trigger rail; click a state and it happens in the running thread.

MIT.
