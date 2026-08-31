import { useEffect, useMemo, useRef, useState } from 'react'
import { createLucet, describeEvent, formatted, happyPath, reasoning, suggestionsVisible, toolSuccess } from 'lucet'
import type { Suggestion } from 'lucet'
import {
  LucetProvider,
  PromptInput,
  SuggestionChips,
  Thread,
  useEventLog,
  useLucet,
  useThread,
  useTriggerGroups,
} from 'lucet-react'
import { AppearancePrefs, useAppearance } from './components/ThemeControls'
import { SiteHeader } from './components/SiteHeader'
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
 * — honest by construction, never by discipline. The KIND is the page's
 * judgment of each scenario's nature: questions that want words back are
 * `ask`; commissions that set the agent working are `do`.
 */
const SUGGESTIONS: readonly Suggestion[] = (
  [
    [happyPath, 'ask'],
    [reasoning, 'ask'],
    [formatted, 'do'],
    [toolSuccess, 'do'],
  ] as const
).map(([s, kind]) => ({
  id: s.id,
  prompt: s.prompt ?? '',
  kind,
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

/** The running app itself: thread above, composer below. Container-agnostic.
 * `aside` is the container's own furniture (the full page's sidebar); it sits
 * inside the frame, beside the thread, and the thread neither knows nor cares. */
function AppCore({
  onReset,
  onSuggest,
  aside,
  chrome = 'window',
  home,
  barStart,
}: {
  onReset?: (() => void) | undefined
  onSuggest?: ((suggestion: Suggestion) => void) | undefined
  aside?: React.ReactNode
  /* Each container wears its own head — and a container that brings its
     OWN chrome (the drawer) takes `bare`: no bar at all, the furniture
     belongs to the room. The thread never changes either way. */
  chrome?: 'window' | 'bare'
  /* The full page is a HOME, and homes follow the genre (Claude, ChatGPT,
     Le Chat): brand over the greeting, and the composer sits IN the page
     until the first turn exists, then moves to the floor. */
  home?: boolean
  /* A control the container wants at the bar's start (the rail toggle). */
  barStart?: React.ReactNode
}) {
  const lucet = useLucet()
  const state = useThread()
  const attachCount = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el && state.status !== 'idle') el.scrollTop = el.scrollHeight
  }, [state])

  /* ONE composer, two seats: the home page seats it centre-stage until a
     turn exists (the genre's grammar — Claude, ChatGPT, Le Chat); every
     other moment it sits on the floor of the frame. */
  const composerCentered = Boolean(home) && state.turns.length === 0
  const composerNode = (
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
  )

  return (
    <>
      {chrome === 'bare' ? null : (
        <div className="cfg__frame-bar">
          {/* Set dressing, honestly generic: a window is a window. */}
          <span className="cfg__dots" aria-hidden>
            <i /><i /><i />
          </span>
          {barStart}
          {/* The window title is the DOCUMENT'S title, and the document is
             the thread: its own first words, or the honest “New thread”.
             A title that never changes is what makes a mock feel mock. */}
          <span className="cfg__frame-title">
            {state.turns[0]?.prompt.parts
              .flatMap((p) => (p.kind === 'text' ? [p.text] : []))
              .join(' ') || 'New thread'}
          </span>
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
      )}

      <div className="cfg__app-body">
        {aside}
        <div className="cfg__app-main">
          <div className="cfg__scroll" ref={scrollRef}>
            {state.turns.length === 0 ? (
              /*
               * The cold start, designed: the product's real first state. The
               * orb at rest is the face, its label is the greeting, and the
               * chips are ways in. This is the "empty & cold start" entry from
               * the unhappy-states list, living where every visitor lands.
               */
              <div className="cfg__empty">
                {/* The atmosphere: the vibe lives in the BACKGROUND — silk
                    ribbons of the accent's light and a breath of grain, drawn
                    and animated entirely in CSS from tokens. No hero object;
                    the greeting is the face, and the room is lit. */}
                <div className="cfg__atmo" aria-hidden="true">
                  <i /><i /><i />
                </div>
                {home ? (
                  <span className="cfg__empty-mark" aria-hidden>
                    <MockBrandMark idp="fbm2" />
                  </span>
                ) : null}
                <p className="cfg__empty-hello">How can I help?</p>
                <span className="cfg__empty-sub">
                  Ask a question, or hand a task off.
                </span>
                {composerCentered ? (
                  <div className="cfg__composer cfg__composer--center">{composerNode}</div>
                ) : null}
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

          {composerCentered ? null : (
            <div className="cfg__composer">{composerNode}</div>
          )}
        </div>
      </div>
    </>
  )
}

/** The B2 orb-ring tile — the mark Lucet tried on and set aside. The
 * fake universe's ONE brand: every container is the same product. */
function MockBrandMark({ idp = 'fbm' }: { idp?: string }) {
  return (
    <svg className="cfg__mock-logo" viewBox="0 0 96 96">
      <defs>
        <linearGradient id={`${idp}-p`} x1="0" y1="0" x2="0.45" y2="1">
          <stop offset="0" stopColor="#34343f" />
          <stop offset="0.52" stopColor="#191920" />
          <stop offset="1" stopColor="#0a0a0f" />
        </linearGradient>
        <linearGradient id={`${idp}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.17" />
          <stop offset="0.38" stopColor="#fff" stopOpacity="0.02" />
          <stop offset="0.62" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${idp}-h`}>
          <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${idp}-c`}>
          <stop offset="0.6" stopColor="#fff" />
          <stop offset="1" stopColor="#DDE0EC" />
        </radialGradient>
        <clipPath id={`${idp}-k`}>
          <rect width="96" height="96" rx="27" />
        </clipPath>
      </defs>
      <rect width="96" height="96" rx="27" fill={`url(#${idp}-p)`} />
      <g clipPath={`url(#${idp}-k)`}>
        <circle cx="48" cy="49" r="26" fill={`url(#${idp}-h)`} />
        <circle
          cx="48"
          cy="49"
          r="24"
          fill="none"
          stroke="#F4F5FB"
          strokeWidth="7.6"
          strokeDasharray="112 39"
          strokeLinecap="round"
          transform="rotate(156 48 49)"
        />
        <circle cx="48" cy="49" r="9.5" fill={`url(#${idp}-c)`} />
        <rect width="96" height="96" rx="27" fill={`url(#${idp}-s)`} />
      </g>
    </svg>
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
        <span>Application Name</span>
        <span className="cfg__mock-sep">/</span>
        <span>Page 1</span>
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
  const [themeState, setThemeState] = useAppearance({ theme: 'dark', accent: 'violet' })
  const booted = useRef(false)
  const [active, setActive] = useState<string | null>(null)
  const [firing, setFiring] = useState<string | null>(null)
  /* The drawer is a REAL drawer: it closes, and the mock app's own "Ask
     AI" button brings it back — the reference interaction, demoed live.
     It rests open so arriving on the view shows the product, not a door. */
  const [drawerOpen, setDrawerOpen] = useState(true)
  const drawerViaButton = useRef(false)
  /* What the drawer is showing (the thread, or the chat history pane) and
     HOW it sits on the app: over the page, pushing the page aside, or
     floating clear of the edges — the three presentations every real
     drawer product ends up offering. */
  const [drawerPane, setDrawerPane] = useState<'thread' | 'history'>('thread')
  /* The rail collapses, the way every home's rail does. */
  const [sideOpen, setSideOpen] = useState(true)
  const [drawerMode, setDrawerMode] = useState<'over' | 'push' | 'floating'>('over')
  /* The floating panel DRAGS — by its bar, the way every floating panel
     has ever dragged. Position is a preference, not a function: nothing
     is reachable only by dragging, which is what keeps a pointer-only
     gesture honest (2.5.7). Offset lives outside React and is written
     straight to the element; leaving floating mode puts it home. */
  const drawerEl = useRef<HTMLDivElement | null>(null)
  const dragOffset = useRef({ dx: 0, dy: 0 })

  useEffect(() => {
    if (drawerMode !== 'floating' || !drawerOpen) {
      dragOffset.current = { dx: 0, dy: 0 }
      if (drawerEl.current) drawerEl.current.style.translate = ''
    }
  }, [drawerMode, drawerOpen])

  const dragDrawer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drawerMode !== 'floating') return
    if (e.target instanceof Element && e.target.closest('button, details')) return
    const drawer = drawerEl.current
    const mock = drawer?.closest('.cfg__mock')
    if (!drawer || !mock) return
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY }
    const base = { ...dragOffset.current }
    const m = mock.getBoundingClientRect()
    const d = drawer.getBoundingClientRect()
    /* Clamp against the UNTRANSLATED rect, so the panel can never be
       dragged out of the stage and lost. */
    const minX = m.left - (d.left - base.dx)
    const maxX = m.right - (d.right - base.dx)
    const minY = m.top - (d.top - base.dy)
    const maxY = m.bottom - (d.bottom - base.dy)
    const move = (ev: PointerEvent) => {
      const dx = Math.min(Math.max(base.dx + ev.clientX - start.x, minX), maxX)
      const dy = Math.min(Math.max(base.dy + ev.clientY - start.y, minY), maxY)
      dragOffset.current = { dx, dy }
      drawer.style.translate = `${dx}px ${dy}px`
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'grabbing'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }

  const fire = (id: string) => {
    /* A state fired at a closed drawer opens it first — and lands on the
       thread pane: the rail's whole job is to make things happen WHERE
       YOU CAN SEE THEM. */
    setDrawerOpen(true)
    setDrawerPane('thread')
    setActive(id)
    setFiring(id)
    void lucet.trigger(id).finally(() => setFiring(null))
  }

  /* Focus follows the drawer honestly: opening it by the button moves
     focus in; closing it hands focus back to the button. A view switch
     that happens to mount the drawer steals nothing. */
  /* The drawer's menu closes like a popover — same manners as More. */
  useEffect(() => {
    const close = (e: PointerEvent) => {
      const menu = document.querySelector('details.cfg__dmenu[open]')
      if (menu && e.target instanceof Node && !menu.contains(e.target)) {
        menu.removeAttribute('open')
      }
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.querySelector('details.cfg__dmenu[open]')?.removeAttribute('open')
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [])

  useEffect(() => {
    if (drawerOpen && drawerViaButton.current) {
      drawerViaButton.current = false
      document.querySelector<HTMLButtonElement>('.cfg__drawer-close')?.focus()
    }
  }, [drawerOpen])

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
            <AppearancePrefs state={themeState} onChange={setThemeState} />
          </div>

          {view === 'full' ? (
            <section className="cfg__frame cfg__frame--app" aria-label="The running app">
              <AppCore
                home
                onReset={() => setActive(null)}
                onSuggest={(s) => {
                  writeStateParam(s.id)
                  fire(s.id)
                }}
                barStart={
                  /* The rail's control lives ON the rail while it is open;
                     only when the rail is gone does the bar offer the way
                     back, in the spot the rail vacated. One control, always
                     where the eyes already are — it was a bar-only icon
                     first, and Ian could not find it. */
                  sideOpen ? null : (
                    <button
                      type="button"
                      className="cfg__reset cfg__side-toggle"
                      aria-label="Show the sidebar"
                      aria-expanded={false}
                      onClick={() => {
                        setSideOpen(true)
                        setTimeout(() => {
                          document
                            .querySelector<HTMLButtonElement>('.cfg__side .cfg__side-toggle')
                            ?.focus()
                        }, 0)
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
                        <path d="M9.5 4.5v15" />
                      </svg>
                    </button>
                  )
                }
                aside={
                  /*
                   * What makes a full page an APPLICATION instead of a chat
                   * widget: the room around the thread. One control is real —
                   * New thread does exactly what it says, the same commit as
                   * the bar's reset — and the history is set dressing, marked
                   * decorative so it cannot lie to a screen reader about
                   * conversations that do not exist.
                   */
                  <aside className="cfg__side" data-closed={sideOpen ? undefined : ''}>
                    <span className="cfg__side-brand">
                      <span className="cfg__side-brand-id" aria-hidden>
                        <MockBrandMark />
                        Application Name
                      </span>
                      <button
                        type="button"
                        className="cfg__reset cfg__side-toggle"
                        aria-label="Hide the sidebar"
                        aria-expanded
                        onClick={() => {
                          setSideOpen(false)
                          setTimeout(() => {
                            document
                              .querySelector<HTMLButtonElement>('.cfg__frame-bar .cfg__side-toggle')
                              ?.focus()
                          }, 0)
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden>
                          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
                          <path d="M9.5 4.5v15" />
                        </svg>
                      </button>
                    </span>
                    <button
                      type="button"
                      className="cfg__side-new"
                      onClick={() => {
                        lucet.reset()
                        setActive(null)
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      New thread
                    </button>
                    <div className="cfg__side-list" aria-hidden>
                      <div className="cfg__side-group">Today</div>
                      <div className="cfg__side-row" data-active>Quarterly planning</div>
                      <div className="cfg__side-row">Draft the kickoff note</div>
                      <div className="cfg__side-group">Earlier</div>
                      <div className="cfg__side-row">Compare the two vendor quotes</div>
                      <div className="cfg__side-row">Rename the workstreams</div>
                      <div className="cfg__side-row">Last week&rsquo;s review notes</div>
                    </div>
                    {/* The classic sidebar footer: settings (honest about
                        being dressing) and the person, pinned to the floor. */}
                    <div className="cfg__side-foot">
                      <button
                        type="button"
                        className="cfg__side-settings"
                        disabled
                        title="Not in this demo"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden>
                          <path d="M4 7h9M17 7h3M4 17h3M11 17h9M13 4.5v5M7 14.5v5" />
                        </svg>
                        Settings
                      </button>
                      <div className="cfg__side-user" aria-hidden>
                        <span className="cfg__side-avatar">Y</span>
                        You
                      </div>
                    </div>
                  </aside>
                }
              />
            </section>
          ) : view === 'drawer' ? (
            <section
              className="cfg__mock"
              data-drawer-mode={drawerMode}
              aria-label="The running app, as a drawer"
            >
              {/* The host application's own chrome. The brand is REAL but
                  nobody's — the B2 orb-ring tile Lucet itself tried on and
                  set aside — and the words say what they are: a name-shaped
                  hole and three page-shaped holes. One control is live. */}
              <div className="cfg__mock-app">
              <div className="cfg__mock-bar">
                <span className="cfg__mock-brand" aria-hidden>
                  <MockBrandMark />
                  Application Name
                </span>
                <span className="cfg__mock-tabs" aria-hidden>
                  <span data-active>Page 1</span>
                  <span>Page 2</span>
                  <span>Page 3</span>
                </span>
                <button
                  type="button"
                  className="cfg__askai"
                  aria-pressed={drawerOpen}
                  onClick={() => {
                    drawerViaButton.current = true
                    setDrawerOpen(true)
                  }}
                >
                  <svg className="cfg__spark" viewBox="0 0 24 24" aria-hidden>
                    <path d="M12 3.5c.9 4.4 3.1 6.6 7.5 7.5-4.4.9-6.6 3.1-7.5 7.5-.9-4.4-3.1-6.6-7.5-7.5 4.4-.9 6.6-3.1 7.5-7.5z" />
                  </svg>
                  Ask AI
                </button>
              </div>
                <MockDocument />
              </div>
              {drawerOpen ? (
                  <div className="cfg__drawer" ref={drawerEl}>
                    {/* The drawer's own head. Left, a menu that organises what
                        a small head cannot hold: the panes, the three ways the
                        drawer can sit on the page, and settings. Right, the
                        two verbs used constantly: new thread, and out. */}
                    <div className="cfg__frame-bar cfg__drawer-bar" onPointerDown={dragDrawer}>
                      <details className="cfg__dmenu">
                        <summary aria-label="Panel menu">
                          <svg viewBox="0 0 24 24" aria-hidden>
                            <path d="M4 7h16M4 12h16M4 17h16" />
                          </svg>
                        </summary>
                        <div className="cfg__dmenu-panel">
                          {(
                            [
                              ['thread', 'Home', 'M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z'],
                              ['history', 'Chat history', 'M12 8v4l2.6 1.6M20.5 12a8.5 8.5 0 1 1-2.5-6M20.5 3.5V6H18'],
                            ] as const
                          ).map(([pane, label, d]) => (
                            <button
                              key={pane}
                              type="button"
                              className="cfg__dmenu-row"
                              onClick={(e) => {
                                setDrawerPane(pane)
                                e.currentTarget.closest('details')?.removeAttribute('open')
                              }}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden>
                                <path d={d} />
                              </svg>
                              {label}
                              {drawerPane === pane ? (
                                <svg className="cfg__dmenu-check" viewBox="0 0 24 24" aria-hidden>
                                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                                </svg>
                              ) : null}
                            </button>
                          ))}
                          <div className="cfg__dmenu-sep" aria-hidden />
                          {(
                            [
                              ['over', 'Over the page', 'M3.5 5.5h17v13h-17zM13 5.5h7.5v13H13z'],
                              ['push', 'Pushes the page', 'M3.5 5.5h17v13h-17zM14 5.5v13'],
                              ['floating', 'Floating', 'M3.5 5.5h17v13h-17zM12.5 9h5v6h-5z'],
                            ] as const
                          ).map(([mode, label, d]) => (
                            <button
                              key={mode}
                              type="button"
                              className="cfg__dmenu-row"
                              onClick={(e) => {
                                setDrawerMode(mode)
                                e.currentTarget.closest('details')?.removeAttribute('open')
                              }}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden>
                                <path d={d} />
                              </svg>
                              {label}
                              {drawerMode === mode ? (
                                <svg className="cfg__dmenu-check" viewBox="0 0 24 24" aria-hidden>
                                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                                </svg>
                              ) : null}
                            </button>
                          ))}
                          <div className="cfg__dmenu-sep" aria-hidden />
                          <button
                            type="button"
                            className="cfg__dmenu-row"
                            disabled
                            title="Not in this demo"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden>
                              <path d="M4 7h9M17 7h3M4 17h3M11 17h9M13 4.5v5M7 14.5v5" />
                            </svg>
                            Settings
                          </button>
                        </div>
                      </details>
                      <span className="cfg__frame-title cfg__drawer-title">
                        {drawerPane === 'thread' ? (
                          <svg className="cfg__spark" viewBox="0 0 24 24" aria-hidden>
                            <path d="M12 3.5c.9 4.4 3.1 6.6 7.5 7.5-4.4.9-6.6 3.1-7.5 7.5-.9-4.4-3.1-6.6-7.5-7.5 4.4-.9 6.6-3.1 7.5-7.5z" />
                          </svg>
                        ) : null}
                        {drawerPane === 'thread' ? 'Ask AI' : 'Chat history'}
                      </span>
                      <button
                        type="button"
                        className="cfg__reset cfg__drawer-new"
                        aria-label="New thread"
                        onClick={() => {
                          lucet.reset()
                          setActive(null)
                          setDrawerPane('thread')
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden>
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="cfg__reset cfg__drawer-close"
                        aria-label="Close the Ask AI panel"
                        onClick={() => {
                          setDrawerOpen(false)
                          document.querySelector<HTMLButtonElement>('.cfg__askai')?.focus()
                        }}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden>
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                    {drawerPane === 'thread' ? (
                      <AppCore
                        chrome="bare"
                        onReset={() => setActive(null)}
                        onSuggest={(s) => {
                          writeStateParam(s.id)
                          fire(s.id)
                        }}
                      />
                    ) : (
                      /* The history pane: the same dressing law as the full
                         page's sidebar — real words, marked decorative,
                         because these conversations do not exist. */
                      <div className="cfg__history" aria-hidden>
                        <div className="cfg__history-group">Today</div>
                        {(
                          [
                            ['Quarterly planning', 'Today · 9:41'],
                            ['Draft the kickoff note', 'Today · 8:12'],
                          ] as const
                        ).map(([t, d]) => (
                          <div className="cfg__history-row" key={t}>
                            <span className="cfg__history-text">
                              <span className="cfg__history-title">{t}</span>
                              <span className="cfg__history-date">{d}</span>
                            </span>
                            <svg viewBox="0 0 24 24">
                              <path d="M5 7h14M10 7V5h4v2M8 7l1 13h6l1-13" />
                            </svg>
                            <svg viewBox="0 0 24 24">
                              <path d="M9 6l6 6-6 6" />
                            </svg>
                          </div>
                        ))}
                        <div className="cfg__history-group">Earlier</div>
                        {(
                          [
                            ['Compare the two vendor quotes', 'Tue · 16:02'],
                            ['Rename the workstreams', 'Mon · 11:30'],
                            ['Last week\u2019s review notes', 'Fri · 15:45'],
                          ] as const
                        ).map(([t, d]) => (
                          <div className="cfg__history-row" key={t}>
                            <span className="cfg__history-text">
                              <span className="cfg__history-title">{t}</span>
                              <span className="cfg__history-date">{d}</span>
                            </span>
                            <svg viewBox="0 0 24 24">
                              <path d="M5 7h14M10 7V5h4v2M8 7l1 13h6l1-13" />
                            </svg>
                            <svg viewBox="0 0 24 24">
                              <path d="M9 6l6 6-6 6" />
                            </svg>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
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
