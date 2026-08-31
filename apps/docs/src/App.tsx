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
import { NEUTRALS, RADII, SCALES, TYPEFACES, useApplyTheme } from './components/ThemeControls'
import type { ThemeState } from './components/ThemeControls'
import { SiteHeader } from './components/SiteHeader'
import { loadAppearance, saveAppearance } from './lib/appearance'
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

  /*
   * The thesis has two halves, and the rail offers them as TABS: STATES
   * are the ways a response can go (the coverage argument), FEATURES are
   * what other libraries do not have at all (the differentiator argument).
   * (These wear the page's segmented-control grammar — an honest note: a
   * Tabs primitive does not exist in the library yet; it is on the list.)
   */
  const [tab, setTab] = useState<'state' | 'feature'>('state')
  const kindOf = (id: string | null) =>
    groups.flatMap((g) => g.scenarios).find((s) => s.id === id)?.kind ?? 'state'
  /* A deep link or chip that lands on the other half switches the tab to
     where the marked row actually is. */
  useEffect(() => {
    if (active) setTab(kindOf(active) === 'feature' ? 'feature' : 'state')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const shown = groups.filter((g) => (g.scenarios[0]?.kind ?? 'state') === tab)

  return (
    <nav aria-label="State triggers">
      <div className="cfg__views cfg__views--rail" role="group" aria-label="Rail sections">
        {(
          [
            ['state', 'States'],
            ['feature', 'Features'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {shown.map((group) => (
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
              {/* The run mark BECOMES the running mark: while the scenario
                  plays, the spinner takes the circle-play's own slot — the
                  glyph is the state, not a second lamp off to the side. */}
              {firing === scenario.id ? (
                <span className="cfg__firing" aria-hidden />
              ) : (
                <svg className="cfg__trigger-play" viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="12" r="9.5" />
                  <path
                    d="M10 8.7v6.6c0 .5.56.81.98.53l5.06-3.3a.64.64 0 0 0 0-1.06l-5.06-3.3a.64.64 0 0 0-.98.53z"
                    fill="currentColor"
                    stroke="none"
                  />
                </svg>
              )}
              <span className="cfg__trigger-label">{scenario.label}</span>
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
        {/* Set dressing, honestly generic: a window is a window. */}
        <span className="cfg__dots" aria-hidden>
          <i /><i /><i />
        </span>
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
          <Thread
            state={state}
            selfId="you"
            onRetry={(turnId) => void lucet.retry(turnId)}
            onFeedback={(messageId, verdict) =>
              lucet.store.dispatch({ type: 'feedback/given', messageId, verdict })
            }
          />
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
      {/* The breadcrumb is set dressing today and a scope ladder tomorrow:
          the app's own navigation is the context hierarchy Scope Control
          will read (brief §8.1). */}
      <div className="cfg__mock-nav">
        <span>Workspace</span>
        <span className="cfg__mock-sep">/</span>
        <span>Plans</span>
        <span className="cfg__mock-sep">/</span>
        <span className="cfg__mock-here">Quarterly planning</span>
      </div>
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
  /* The site's resting look: dark, violet — but a choice made ANYWHERE on
     the site wins over it, so moving between pages never resets you. */
  const [themeState, setThemeState] = useState<ThemeState>(() => {
    const stored = loadAppearance()
    return {
    theme: (stored.theme as ThemeState['theme']) ?? 'dark',
    accent: (stored.accent as ThemeState['accent']) ?? 'violet',
    neutral: 'subtle',
    expression: (stored.expression as ThemeState['expression']) ?? 'system',
    radius: (stored.radius as ThemeState['radius']) ?? 'default',
    scale: (stored.scale as ThemeState['scale']) ?? '100',
    typeface: (stored.typeface as ThemeState['typeface']) ?? 'inter',
    }
  })
  const booted = useRef(false)
  const [active, setActive] = useState<string | null>(null)
  const [firing, setFiring] = useState<string | null>(null)

  useApplyTheme(themeState)

  useEffect(() => {
    const { theme, accent, expression, radius, scale, typeface } = themeState
    saveAppearance({ theme, accent, expression, radius, scale, typeface })
  }, [themeState])

  /* The More popover closes like a popover: click anywhere else, or
     Escape, and it goes. A details that only closes on its own summary
     makes the reader do the tidying. */
  useEffect(() => {
    const closeIfOutside = (e: PointerEvent) => {
      const more = document.querySelector('details.cfg__more[open]')
      if (more && e.target instanceof Node && !more.contains(e.target)) {
        more.removeAttribute('open')
      }
    }
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.querySelector('details.cfg__more[open]')?.removeAttribute('open')
      }
    }
    document.addEventListener('pointerdown', closeIfOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

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
      <SiteHeader page="configurator" />

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
              {/*
               * The rest of the appearance axes — expression, radius, scale,
               * typeface, neutral — are real and audited, but four more
               * pickers on the bar would bury the two that carry the pitch.
               * They wait behind one word.
               */}
              <details className="cfg__more">
                <summary>More</summary>
                <div className="cfg__more-panel">
                  {(
                    [
                      ['Expression', 'expression', ['system', 'expressive']],
                      ['Neutral', 'neutral', NEUTRALS],
                      ['Radius', 'radius', RADII],
                      ['Scale', 'scale', SCALES],
                      ['Typeface', 'typeface', TYPEFACES],
                    ] as const
                  ).map(([label, key, options]) => (
                    <label className="cfg__more-row" key={key}>
                      <span>{label}</span>
                      <select
                        value={themeState[key]}
                        onChange={(e) =>
                          setThemeState((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      >
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </details>
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
                <div className="cfg__phone-status" aria-hidden>
                  <span>9:41</span>
                  <span className="cfg__phone-pills">
                    <i /><i />
                  </span>
                </div>
                <AppCore
                onReset={() => setActive(null)}
                onSuggest={(s) => {
                  writeStateParam(s.id)
                  fire(s.id)
                }}
              />
                <div className="cfg__phone-home" aria-hidden />
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
