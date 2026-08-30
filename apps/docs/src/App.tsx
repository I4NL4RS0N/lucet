import { useEffect, useMemo, useRef, useState } from 'react'
import { createLucet, describeEvent } from 'lucet'
import {
  LucetProvider,
  PromptInput,
  Thread,
  useEventLog,
  useLucet,
  useThread,
  useTriggerGroups,
} from 'lucet-react'
import { useApplyTheme } from './components/ThemeControls'
import type { ThemeState } from './components/ThemeControls'
import { readStateParam, writeStateParam } from './lib/deep-link'

/**
 * The Configurator: the app IS the page.
 *
 * A running product in a window frame, and beside it a plain list of event
 * triggers that inject states into it — the SuperFriendly philly.com
 * configurator crossed with Josh Puckett's state-machine tools. Clicking a
 * word makes the state HAPPEN in the running thread; nothing here is a
 * gallery, and the unhappy half of the list is the point.
 *
 * Theme and accent are tucked at the bottom of the rail: appearance is a
 * preference, the states are the show.
 */

const ACCENTS = [
  'monochrome', 'slate', 'blue', 'indigo', 'violet', 'magenta',
  'rose', 'green', 'teal', 'cyan', 'amber',
] as const

function TriggerRail() {
  const lucet = useLucet()
  const groups = useTriggerGroups()
  const thread = useThread()
  const busy = thread.status !== 'idle'

  return (
    <nav aria-label="State triggers">
      <p className="cfg__rail-title">States — click one, it happens</p>
      {groups.map((group) => (
        <section className="cfg__group" key={group.group}>
          <h3 className="cfg__group-name">{group.group}</h3>
          {group.scenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className="cfg__trigger"
              title={scenario.description}
              disabled={busy}
              onClick={() => {
                writeStateParam(scenario.id)
                void lucet.trigger(scenario.id)
              }}
            >
              {scenario.label}
            </button>
          ))}
        </section>
      ))}
    </nav>
  )
}

function EventLog() {
  const log = useEventLog()
  const recent = log.slice(-30).reverse()
  return (
    <details className="cfg__log">
      <summary>Event log — every transition, as it happens</summary>
      <div className="cfg__log-body" aria-label="Event log">
        {recent.map((entry) => (
          <div key={entry.seq}>
            <span>{String(entry.seq).padStart(3, ' ')}</span> {describeEvent(entry.event)}
          </div>
        ))}
      </div>
    </details>
  )
}

/** The running app: thread above, composer below, reset on the frame. */
function TheApp() {
  const lucet = useLucet()
  const state = useThread()
  const attachCount = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep the newest turn in view while a response streams in.
  useEffect(() => {
    const el = scrollRef.current
    if (el && state.status !== 'idle') el.scrollTop = el.scrollHeight
  }, [state])

  return (
    <section className="cfg__frame" aria-label="The running app">
      <div className="cfg__frame-bar">
        <span className="cfg__frame-title">Thread</span>
        <button
          type="button"
          className="cfg__reset"
          aria-label="Reset the thread"
          onClick={() => lucet.reset()}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 12a8 8 0 1 1 2.4 5.7M4 20v-4h4" />
          </svg>
        </button>
      </div>

      <div className="cfg__scroll" ref={scrollRef}>
        {state.turns.length === 0 ? (
          <div className="cfg__empty">
            <strong>Nothing here yet.</strong>
            <span>Write something below, or click a state on the right and watch it happen.</span>
          </div>
        ) : (
          <Thread state={state} selfId="you" />
        )}
      </div>

      <div className="cfg__composer">
        <PromptInput
          composer={state.composer}
          model={state.model}
          service={state.service}
          selfId="you"
          streaming={state.status === 'streaming'}
          onStop={() => lucet.abort()}
          onChange={(text) => lucet.store.dispatch({ type: 'composer/changed', text })}
          onSubmit={() => void lucet.submit(state.composer.text)}
          onQueue={(text) => lucet.store.dispatch({ type: 'composer/queued', text })}
          onModelChange={(modelId) => lucet.store.dispatch({ type: 'model/changed', modelId })}
          onRemoveAttachment={(id) => lucet.store.dispatch({ type: 'attachment/removed', id })}
          onRetryAttachment={(id) => {
            lucet.store.dispatch({ type: 'attachment/retried', id })
            setTimeout(
              () => lucet.store.dispatch({ type: 'attachment/settled', id, status: 'ready', reason: null }),
              1200,
            )
          }}
          onAttach={() => {
            // The host owns file IO; this host fakes one honestly. Every
            // third attachment fails, so the failure path stays one click away.
            const n = ++attachCount.current
            const id = `cfg_${n}`
            lucet.store.dispatch({
              type: 'attachment/added',
              id,
              name: `document-${n}.pdf`,
              fileKind: 'document',
              sizeBytes: 240_000,
            })
            setTimeout(() => {
              lucet.store.dispatch(
                n % 3 === 0
                  ? { type: 'attachment/settled', id, status: 'failed', reason: 'Too large' }
                  : { type: 'attachment/settled', id, status: 'ready', reason: null },
              )
            }, 1200)
          }}
        />
      </div>
    </section>
  )
}

export function App() {
  const lucet = useMemo(() => createLucet(), [])
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

  // Deep link: land someone straight in a state, in context.
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    const id = readStateParam()
    if (id && lucet.triggers.get(id)) void lucet.trigger(id)
  }, [lucet])

  return (
    <LucetProvider lucet={lucet}>
      <header className="cfg__bar">
        <span className="cfg__mark">
          Lucet <span>· the Configurator</span>
        </span>
        <p className="cfg__lede">One running thread. The states on the right happen to it.</p>
      </header>

      <div className="cfg__layout">
        <TheApp />

        <div className="cfg__rail">
          <TriggerRail />

          <div className="cfg__aside">
            <div className="cfg__aside-row">
              <label htmlFor="cfg-theme">Theme</label>
              <select
                id="cfg-theme"
                value={themeState.theme}
                onChange={(e) =>
                  setThemeState((prev) => ({ ...prev, theme: e.target.value as ThemeState['theme'] }))
                }
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
              <label htmlFor="cfg-accent">Accent</label>
              <select
                id="cfg-accent"
                value={themeState.accent}
                onChange={(e) =>
                  setThemeState((prev) => ({ ...prev, accent: e.target.value as ThemeState['accent'] }))
                }
              >
                {ACCENTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <EventLog />
          </div>
        </div>
      </div>
    </LucetProvider>
  )
}
