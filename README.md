# Lucet

**AI interface patterns for what comes next.**

An open-source library of AI interface components, with rigorous work on the
states real AI features actually hit and a documented rationale for each
component.

The argument behind it is in **[docs/thesis.md](docs/thesis.md)**: existing AI
interface libraries treat the artifact and its context as living outside the
conversation, and they don't. Scope, versioning, multiplayer, and budget all fall
out of that one observation.

## Status

Early. The argument is further along than the code. Nothing is published yet.

## Packages

| Package | What it is |
|---|---|
| `lucet` | Framework-free headless core. All state logic, zero framework imports. |
| `lucet-react` | Thin React bindings over the core. |

React today, adapters welcome, the core is yours to wrap.

## Docs

The docs site is not a component gallery. It's one persistent, realistic
interface with a rail of state triggers beside it, driven by a scripted
deterministic runtime, so any state can be forced in context and chained into the
next one.

## License

MIT
