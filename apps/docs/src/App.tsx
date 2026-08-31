import { useEffect, useMemo, useRef, useState } from 'react'
import { createLucet, describeEvent, formatted, happyPath, reasoning, suggestionsVisible } from 'lucet'
import type { Suggestion } from 'lucet'
import {
  ActivityOrb,
  LucetProvider,
  PromptInput,
  SuggestionChips,
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

/*
 * The cold start's chips, built FROM the scenarios they fire: id and prompt
 * come straight off the scenario, so what a chip says is exactly what runs
 * — honest by construction, never by discipline.
 */
const SUGGESTIONS: readonly Suggestion[] = [happyPath, formatted, reasoning].map((s) => ({
  id: s.id,
  prompt: s.prompt ?? '',
}))

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
      <summary>Event log</summary>
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
function AppCore({
  onReset,
  onSuggest,
}: {
  onReset?: (() => void) | undefined
  onSuggest?: ((suggestion: Suggestion) => void) | undefined
}) {
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
          /*
           * The cold start, designed: the product's real first state. The
           * orb at rest is the face, its label is the greeting, and the
           * chips are ways in. This is the "empty & cold start" entry from
           * the unhappy-states list, living where every visitor lands.
           */
          <div className="cfg__empty">
            <ActivityOrb state="ready" label="Ready when you are." size="lg" />
            <span className="cfg__empty-sub">
              Ask anything below, or start from one of these.
            </span>
            {suggestionsVisible(state) ? (
              <SuggestionChips
                suggestions={state.suggestions}
                disabled={state.composer.locked}
                onPick={(s) => onSuggest?.(s)}
              />
            ) : null}
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
  const lucet = useMemo(() => createLucet({ suggestions: SUGGESTIONS }), [])
  const [view, setView] = useState<View>('full')
  /* The site's resting look: dark, violet. System and monochrome remain a
     click away; the default is a point of view. */
  const [themeState, setThemeState] = useState<ThemeState>({
    theme: 'dark',
    accent: 'violet',
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
   * Deep link: land someone straight in a state, in context. With no link,
   * the arrival is the COLD START — greeting, suggestion chips, a thread
   * waiting to begin — because that is the product's real first state, and
   * "empty & cold start" is on the unhappy-states list precisely because
   * nobody designs it. (An auto-fired scenario held this slot for one
   * afternoon; it skipped the very state a first visit should demonstrate.)
   */
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    const linked = readStateParam()
    if (linked && lucet.triggers.get(linked)) fire(linked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lucet])

  return (
    <LucetProvider lucet={lucet}>
      <header className="cfg__bar">
        <div className="cfg__bar-in">
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
          <span className="cfg__name">Lucet</span>
        </span>

        {/* The header holds the SITE: identity left, navigation right.
            Viewing controls live with the stage they control, below. */}
        <nav className="cfg__nav" aria-label="Site">
          {import.meta.env.DEV ? (
            <>
              <a className="cfg__navlink" href="/components.html">
                Components
              </a>
              <a className="cfg__navlink" href="/primitives.html">
                Primitives
              </a>
            </>
          ) : null}
          {/* The outbound link goes last, wearing its place's flag (the
              octocat, GitHub's own mark via octicons). */}
          <a
            className="cfg__navlink"
            href="https://github.com/I4NL4RS0N/lucet"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg className="cfg__navlink-gh" viewBox="0 0 16 16" aria-hidden>
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
            </svg>
            GitHub
          </a>
        </nav>
        </div>
      </header>

      <div className="cfg__layout">
        <div className="cfg__main">
          {/*
           * The stage bar: every control over HOW YOU ARE VIEWING the demo,
           * in one row above the stage it controls. Container on the left
           * (same components, three places — a library that only demos one
           * container is quietly claiming that is the only place it works);
           * theme and accent on the right, because the library's opinions
           * about appearance are part of the pitch and their proof belongs
           * beside the thing they change.
           */}
          <div className="cfg__stagebar">
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
            {/* No labels, no boxes: the values name themselves, and the
                page is too quiet for four pieces of chrome per picker. */}
            <div className="cfg__prefs">
              <span className="cfg__pick">
                <select
                  aria-label="Theme"
                  value={themeState.theme}
                  onChange={(e) =>
                    setThemeState((prev) => ({ ...prev, theme: e.target.value as ThemeState['theme'] }))
                  }
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </span>
              <span className="cfg__pick">
                <select
                  aria-label="Accent"
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
              </span>
            </div>
          </div>

          {view === 'full' ? (
            <section className="cfg__frame" aria-label="The running app">
              <AppCore
                onReset={() => setActive(null)}
                onSuggest={(s) => {
                  writeStateParam(s.id)
                  fire(s.id)
                }}
              />
            </section>
          ) : view === 'drawer' ? (
            <section className="cfg__mock" aria-label="The running app, as a drawer">
              <MockDocument />
              <div className="cfg__drawer">
                <AppCore
                onReset={() => setActive(null)}
                onSuggest={(s) => {
                  writeStateParam(s.id)
                  fire(s.id)
                }}
              />
              </div>
            </section>
          ) : (
            <section className="cfg__phone-stage" aria-label="The running app, on a phone">
              <div className="cfg__phone">
                <AppCore
                onReset={() => setActive(null)}
                onSuggest={(s) => {
                  writeStateParam(s.id)
                  fire(s.id)
                }}
              />
              </div>
            </section>
          )}
        </div>

        <div className="cfg__railcol">
          <div className="cfg__rail">
            <TriggerRail active={active} firing={firing} onFire={fire} />
            <div className="cfg__aside">
              <EventLog />
            </div>
          </div>
        </div>
      </div>
    </LucetProvider>
  )
}
