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

function TriggerRail({
  active,
  firing,
  onFire,
}: {
  /** The state most recently made to happen — the rail's "you are here". */
  active: string | null
  /** The one running right now, wearing the spinner. */
  firing: string | null
  onFire: (id: string) => void
}) {
  const groups = useTriggerGroups()
  const thread = useThread()
  const busy = thread.status !== 'idle'

  return (
    <nav aria-label="State triggers">
      <p className="cfg__rail-title">States</p>
      <p className="cfg__rail-sub">Click one — it happens to the running thread.</p>
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
              aria-current={active === scenario.id || undefined}
              onClick={() => {
                writeStateParam(scenario.id)
                onFire(scenario.id)
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
function AppCore({ onReset }: { onReset?: (() => void) | undefined }) {
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
          onClick={() => {
            lucet.reset()
            // A wiped thread has no current state; the rail must not claim one.
            onReset?.()
          }}
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
  const [active, setActive] = useState<string | null>(null)
  const [firing, setFiring] = useState<string | null>(null)

  useApplyTheme(themeState)

  const fire = (id: string) => {
    setActive(id)
    setFiring(id)
    void lucet.trigger(id).finally(() => setFiring(null))
  }

  /*
   * Deep link: land someone straight in a state, in context. And with no
   * link at all, the FIRST state fires itself: the page must arrive alive —
   * a prompt sending, a response streaming — because nothing orients a
   * first visitor faster than watching the thing happen. The row it came
   * from is marked in the rail, so the cause is findable. (A splash screen
   * was considered and refused: a door in front of a working stage.)
   */
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    const linked = readStateParam()
    if (linked && lucet.triggers.get(linked)) fire(linked)
    else {
      const first = lucet.triggers.list()[0]
      if (first) fire(first.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                <stop offset="0" stopColor="#34343f" />
                <stop offset="0.52" stopColor="#191920" />
                <stop offset="1" stopColor="#0a0a0f" />
              </linearGradient>
              <linearGradient id="lgo-s" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.17" />
                <stop offset="0.38" stopColor="#fff" stopOpacity="0.02" />
                <stop offset="0.62" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <radialGradient id="lgo-h">
                <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="lgo-o">
                <stop offset="0.6" stopColor="#fff" />
                <stop offset="1" stopColor="#DDE0EC" />
              </radialGradient>
              <clipPath id="lgo-c">
                <rect width="96" height="96" rx="27" />
              </clipPath>
            </defs>
            <rect width="96" height="96" rx="27" fill="url(#lgo-p)" />
            <g clipPath="url(#lgo-c)">
              <circle cx="48" cy="49" r="26" fill="url(#lgo-h)" />
              <circle cx="48" cy="49" r="24" fill="none" stroke="#F4F5FB" strokeWidth="7" strokeDasharray="102 49" strokeLinecap="round" transform="rotate(114 48 49)" />
              <circle cx="48" cy="49" r="9" fill="url(#lgo-o)" />
              <rect width="96" height="96" rx="27" fill="url(#lgo-s)" />
            </g>
          </svg>
          <span className="cfg__name">
            Lucet <span>· the Configurator</span>
          </span>
          {/* The thesis, in the one line every visitor reads. */}
          <span className="cfg__tagline">
            AI interface components, complete with their unhappy states.
          </span>
        </span>

        {/*
         * Theme and accent live in the header, findable in one glance: how
         * opinionated the library is about appearance IS part of the pitch,
         * so the controls that prove it are not buried. The repo link sits
         * with them: one cluster of "about this library", right-aligned.
         */}
        <div className="cfg__prefs">
          <a
            className="cfg__ghlink"
            href="https://github.com/I4NL4RS0N/lucet"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M8 16L16 8M9.5 8H16v6.5" />
            </svg>
          </a>
          {import.meta.env.DEV ? (
            <>
              <a className="cfg__ghlink" href="/components.html">
                Components
              </a>
              <a className="cfg__ghlink" href="/primitives.html">
                Primitives
              </a>
            </>
          ) : null}
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
              <AppCore onReset={() => setActive(null)} />
            </section>
          ) : view === 'drawer' ? (
            <section className="cfg__mock" aria-label="The running app, as a drawer">
              <MockDocument />
              <div className="cfg__drawer">
                <AppCore onReset={() => setActive(null)} />
              </div>
            </section>
          ) : (
            <section className="cfg__phone-stage" aria-label="The running app, on a phone">
              <div className="cfg__phone">
                <AppCore onReset={() => setActive(null)} />
              </div>
            </section>
          )}
        </div>

        <div className="cfg__rail">
          <TriggerRail active={active} firing={firing} onFire={fire} />
          <div className="cfg__aside">
            <EventLog />
          </div>
        </div>
      </div>
    </LucetProvider>
  )
}
