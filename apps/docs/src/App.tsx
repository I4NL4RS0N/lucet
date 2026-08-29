import { useEffect, useMemo, useRef, useState } from 'react'
import { createLucet } from 'lucet'
import { LucetProvider } from 'lucet-react'
import { TriggerRail } from './components/TriggerRail'
import { Inspector } from './components/Inspector'
import { Conversation } from './components/Conversation'
import { Composer } from './components/Composer'
import { MockPage } from './components/MockPage'
import { readStateParam } from './lib/deep-link'

type Mode = 'full' | 'drawer'

/**
 * The Konfabulator.
 *
 * One persistent, realistic interface with a state trigger rail beside it,
 * driven by a scripted deterministic runtime. Explicitly not Storybook: states
 * are injected into a running thread, never viewed in isolation.
 *
 * Unstyled on purpose. Structure first, visual language as its own piece of
 * work, so the tokens get designed against something that already behaves.
 */
export function App() {
  const lucet = useMemo(() => createLucet(), [])
  const [mode, setMode] = useState<Mode>('full')
  const booted = useRef(false)

  // Deep link. Land someone straight in a state, in context.
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    const id = readStateParam()
    if (id && lucet.triggers.get(id)) void lucet.trigger(id)
  }, [lucet])

  const thread = (
    <section aria-label="Conversation">
      <Conversation />
      <Composer />
    </section>
  )

  return (
    <LucetProvider lucet={lucet}>
      <header>
        <h1>Lucet</h1>
        <p>The Konfabulator. Scripted runtime, real states, one running thread.</p>
        <fieldset>
          <legend>View</legend>
          {(['full', 'drawer'] as const).map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="mode"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {value === 'full' ? 'Full page' : 'Drawer'}
            </label>
          ))}
        </fieldset>
      </header>

      <main data-mode={mode}>
        <TriggerRail />

        {/* The two modes surface different problems: density and scroll in full
            page, and everything about scope in the drawer, where the page keeps
            moving underneath the conversation. */}
        {mode === 'full' ? thread : <MockPage>{thread}</MockPage>}

        <Inspector />
      </main>
    </LucetProvider>
  )
}
