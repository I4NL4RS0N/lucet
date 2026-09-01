# lucet-react

React bindings for [`lucet-core`](https://www.npmjs.com/package/lucet-core) —
AI interface components for the states real AI features actually hit.

The core is framework-free; this package is the thin React layer:
components (Thread, PromptInput, ToolCall, Sources, ScopeControl,
BudgetMeter, and the rest), hooks, and a provider. All state logic
stays in the core.

## Install

```
npm install lucet-core lucet-react
```

## The smallest real example

```tsx
import { createLucet } from 'lucet-core'
import { LucetProvider, Thread, PromptInput, useThread } from 'lucet-react'
import 'lucet-core/styles.css'
import 'lucet-react/styles.css'

const lucet = createLucet()

function Chat() {
  const state = useThread()
  return (
    <>
      <Thread state={state} selfId="you" onRetry={(id) => lucet.retry(id)} />
      <PromptInput
        composer={state.composer}
        model={state.model}
        service={state.service}
        selfId="you"
        onChange={(text) => lucet.store.dispatch({ type: 'composer/changed', text })}
        onSubmit={() => lucet.submit(state.composer.text)}
      />
    </>
  )
}

export default function App() {
  return (
    <LucetProvider value={lucet}>
      <Chat />
    </LucetProvider>
  )
}
```

Refusals, interruptions, partial tool failures, stale sources, version
restore, budget caution — each renders as a designed state with its
own silhouette, not an improvised error path.

Docs, every state on a running page: **https://lucet.design**

MIT.
