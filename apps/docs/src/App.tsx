import { useEffect, useMemo, useRef, useState } from 'react'
import { createLucet } from 'lucet'
import { LucetProvider } from 'lucet-react'
import { TriggerRail } from './components/TriggerRail'
import { Inspector } from './components/Inspector'
import { Conversation } from './components/Conversation'
import { Composer } from './components/Composer'
import { MockPage } from './components/MockPage'
import { Tokens } from './components/Tokens'
import { Scales } from './components/Scales'
import { Sheet } from './components/Sheet'
import { ThemeControls, useApplyTheme } from './components/ThemeControls'
import type { ThemeState } from './components/ThemeControls'
import { readStateParam } from './lib/deep-link'

type Mode = 'full' | 'drawer' | 'sheet' | 'tokens' | 'scales'

const MODES: readonly { value: Mode; label: string }[] = [
  { value: 'full', label: 'Full page' },
  { value: 'drawer', label: 'Drawer' },
  { value: 'sheet', label: 'Sheet' },
  { value: 'tokens', label: 'Tokens' },
  { value: 'scales', label: 'Scales' },
]

/**
 * The Configurator.
 *
 * One persistent, realistic interface with a state trigger rail beside it,
 * driven by a scripted deterministic runtime. Explicitly not Storybook: states
 * are injected into a running thread, never viewed in isolation.
 *
 * The components are still unstyled. Tokens exist and are inspectable, but
 * nothing consumes them yet, which is on purpose: the values get argued with
 * before twelve components inherit them.
 */
export function App() {
  const lucet = useMemo(() => createLucet(), [])
  const [mode, setMode] = useState<Mode>('full')
  const [themeState, setThemeState] = useState<ThemeState>({
    theme: 'system',
    accent: 'monochrome',
    neutral: 'subtle',
    expression: 'system',
    radius: 'default',
    scale: '100',
    typeface: 'inter',
  })
  const booted = useRef(false)

  useApplyTheme(themeState)

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
        <p>The Configurator. Scripted runtime, real states, one running thread.</p>

        <div className="controls">
          {/* A segmented control, not loose radios. Same information, and it
              stops the header reading as a form. */}
          <div className="control">
            <span className="control__label">View</span>
            <div className="segmented" role="group" aria-label="View">
              {MODES.map(({ value, label }) => (
                <label key={value} className="segment">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === value}
                    onChange={() => setMode(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <ThemeControls
            {...themeState}
            onChange={(next) => setThemeState((prev) => ({ ...prev, ...next }))}
          />
        </div>

      </header>

      {mode === 'tokens' ? (
        <main data-mode="tokens">
          <Tokens
            {...themeState}
            onChange={(next) => setThemeState((prev) => ({ ...prev, ...next }))}
          />
        </main>
      ) : mode === 'sheet' ? (
        <main data-mode="tokens">
          <Sheet />
        </main>
      ) : mode === 'scales' ? (
        <main data-mode="tokens">
          <Scales theme={themeState.theme} />
        </main>
      ) : (
        <main data-mode={mode}>
          <TriggerRail />
          {/* The two modes surface different problems: density and scroll in
              full page, and everything about scope in the drawer, where the page
              keeps moving underneath the conversation. */}
          {mode === 'full' ? thread : <MockPage>{thread}</MockPage>}
          <Inspector />
        </main>
      )}
    </LucetProvider>
  )
}
