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
 * A running product beside a plain list of event triggers — the SuperFriendly
 * philly.com configurator crossed with Josh Puckett's state-machine tools.
 * Clicking a word makes the state HAPPEN in the running thread; the unhappy
 * half of the list is the point.
 *
 * The same components render in three containers — full page, a drawer over
 * an application, a phone — because a library that only demos one container
 * is quietly claiming that is the only place it works.
 */

const ACCENTS = [
  'monochrome', 'slate', 'blue', 'indigo', 'violet', 'magenta',
  'rose', 'green', 'teal', 'cyan', 'amber',
] as const

type View = 'full' | 'drawer' | 'mobile'

const VIEWS: readonly { value: View; label: string }[] = [
  { value: 'full', label: 'Full page' },
  { value: 'drawer', label: 'Drawer' },
  { value: 'mobile', label: 'Mobile' },
]

function TriggerRail() {
  const lucet = useLucet()
  const groups = useTriggerGroups()
  const thread = useThread()
  const busy = thread.status !== 'idle'
  const [firing, setFiring] = useState<string | null>(null)

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
                setFiring(scenario.id)
                void lucet.trigger(scenario.id).finally(() => setFiring(null))
              }}
            >
              <span className="cfg__trigger-caret" aria-hidden />
              <span className="cfg__trigger-label">{scenario.label}</span>
              {/* The clicked row works while its scenario runs: the rail is
                  alive, not a list of links. */}
              {firing === scenario.id ? <span className="cfg__firing" aria-hidden /> : null}
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

/** The running app itself: thread above, composer below. Container-agnostic. */
function AppCore() {
  const lucet = useLucet()
  const state = useThread()
  const attachCount = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el && state.status !== 'idle') el.scrollTop = el.scrollHeight
  }, [state])

  return (
    <>
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
    </>
  )
}

/** The neutral application the drawer slides over. Set dressing, real words. */
function MockDocument() {
  return (
    <div className="cfg__mock-doc" aria-hidden>
      <h2>Quarterly planning notes</h2>
      <p>
        Three of the five workstreams are on schedule. The remaining two are
        blocked on the same review, which moved to Thursday.
      </p>
      <p>
        Budget follows the revised figures from last month. Anything filed
        before Tuesday uses the previous template; everything after uses the
        new one.
      </p>
      <h3>Open items</h3>
      <p>
        Confirm the venue hold. Circulate the revised template. Close out the
        two blocked workstreams once the review lands.
      </p>
    </div>
  )
}

export function App() {
  const lucet = useMemo(() => createLucet(), [])
  const [view, setView] = useState<View>('full')
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
          {/* The mark: an orb of light on a graphite tile — a made object,
              not a line drawing. Dark in both themes, the way a lamp stays a
              lamp in daylight. Full rationale in public/favicon.svg. */}
          <svg className="cfg__logo" viewBox="0 0 96 96" aria-hidden>
            <defs>
              <linearGradient id="lgo-p" x1="0" y1="0" x2="0.45" y2="1">
                <stop offset="0" stopColor="#2a2a33" />
                <stop offset="0.52" stopColor="#18181f" />
                <stop offset="1" stopColor="#0d0d12" />
              </linearGradient>
              <linearGradient id="lgo-s" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.13" />
                <stop offset="0.38" stopColor="#fff" stopOpacity="0.02" />
                <stop offset="0.62" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <radialGradient id="lgo-h">
                <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
              <clipPath id="lgo-c">
                <rect width="96" height="96" rx="27" />
              </clipPath>
            </defs>
            <rect width="96" height="96" rx="27" fill="url(#lgo-p)" />
            <g clipPath="url(#lgo-c)">
              <circle cx="46" cy="50" r="17" fill="url(#lgo-h)" />
              <g fill="none" strokeLinecap="round">
                <circle cx="46" cy="50" r="23" stroke="#F2F3F9" strokeWidth="6" strokeDasharray="95 50" transform="rotate(105 46 50)" />
                <circle cx="46" cy="50" r="52" stroke="#B9BCCB" strokeWidth="5" strokeDasharray="150 177" transform="rotate(28 46 50)" />
              </g>
              <circle cx="46" cy="50" r="7" fill="#FFFFFF" />
              <rect width="96" height="96" rx="27" fill="url(#lgo-s)" />
            </g>
          </svg>
          Lucet <span>· the Configurator</span>
        </span>
        <p className="cfg__lede">One running thread. The states on the right happen to it.</p>

        {/*
         * Theme and accent live in the header, findable in one glance: how
         * opinionated the library is about appearance IS part of the pitch,
         * so the controls that prove it are not buried.
         */}
        <div className="cfg__prefs">
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
      </header>

      <div className="cfg__layout">
        <div className="cfg__main">
          {/* Same components, three containers: a library that only demos one
              container is quietly claiming that is the only place it works. */}
          <div className="cfg__views" role="group" aria-label="Container">
            {VIEWS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'full' ? (
            <section className="cfg__frame" aria-label="The running app">
              <AppCore />
            </section>
          ) : view === 'drawer' ? (
            <section className="cfg__mock" aria-label="The running app, as a drawer">
              <MockDocument />
              <div className="cfg__drawer">
                <AppCore />
              </div>
            </section>
          ) : (
            <section className="cfg__phone-stage" aria-label="The running app, on a phone">
              <div className="cfg__phone">
                <AppCore />
              </div>
            </section>
          )}
        </div>

        <div className="cfg__rail">
          <TriggerRail />
          <div className="cfg__aside">
            <EventLog />
          </div>
        </div>
      </div>
    </LucetProvider>
  )
}
