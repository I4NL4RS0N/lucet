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
 * The Konfabulator: the app IS the page.
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
    [happyPath, 'ask', undefined, undefined],
    [reasoning, 'ask', undefined, undefined],
    [formatted, 'do', 'Creates pages in Plans', '~2 min'],
    [toolSuccess, 'do', 'Reads the flagged sources', '~1 min'],
  ] as const
).map(([s, kind, effect, durationHint]) => ({
  id: s.id,
  prompt: s.prompt ?? '',
  kind,
  ...(effect === undefined ? {} : { effect }),
  ...(durationHint === undefined ? {} : { durationHint }),
}))

type View = 'full' | 'drawer' | 'mobile'

/*
 * The host application's pages, and the scope ladder each one implies.
 * The breadcrumb IS the ladder: these are the host's own words for its
 * hierarchy, with the trust half — what each rung actually holds.
 */
const MOCK_PAGES = [
  {
    tab: 'Page 1',
    doc: 'Quarterly planning',
    ladder: [
      { id: 'page', label: 'This page', summary: 'Quarterly planning — the plan and its 4 linked notes', itemCount: 5 },
      { id: 'section', label: 'Plans', summary: 'Everything filed under Plans', itemCount: 12 },
      { id: 'all', label: 'Everything', summary: 'All of Application Name', itemCount: 48 },
    ],
  },
  {
    tab: 'Page 2',
    doc: 'Reports review',
    ladder: [
      { id: 'page', label: 'This page', summary: 'Reports review — the summary and its 2 appendices', itemCount: 3 },
      { id: 'section', label: 'Reports', summary: 'Everything filed under Reports', itemCount: 9 },
      { id: 'all', label: 'Everything', summary: 'All of Application Name', itemCount: 48 },
    ],
  },
  {
    tab: 'Page 3',
    doc: 'Library index',
    ladder: [
      { id: 'page', label: 'This page', summary: 'Library index — the catalogue itself', itemCount: 1 },
      { id: 'section', label: 'Library', summary: 'Everything filed under Library', itemCount: 27 },
      { id: 'all', label: 'Everything', summary: 'All of Application Name', itemCount: 48 },
    ],
  },
] as const

const MONTH_SEED = { monthlyBudgetUsd: 10, monthlySpentUsd: 6.24 } as const

const VIEWS: readonly { value: View; label: string }[] = [
  { value: 'full', label: 'Full page' },
  { value: 'drawer', label: 'Drawer' },
  { value: 'mobile', label: 'Mobile' },
]

function TriggerRail({
  active,
  firing,
  onFire,
  onReset,
}: {
  /** The state most recently made to happen — the rail's "you are here". */
  active: string | null
  /** The one running right now, wearing the spinner. */
  firing: string | null
  onFire: (id: string) => void
  onReset: () => void
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
      {/* Cause and its inverse, together: the rail makes things happen to
         the thread, so the control that unhappens them lives here too —
         not in the stage bar, which only decides how you are LOOKING. */}
      <div className="cfg__rail-top">
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
      {/* Armed only when there is something to wipe: a control that
         would do nothing says so by being disabled, and it disarms
         itself the moment it fires — that IS its feedback. No colour
         escalation on purpose: danger belongs to real endings, accent
         to primary actions; presence is enough. */}
      <button
        type="button"
        className="cfg__stage-reset"
        aria-label="Reset the thread"
        disabled={thread.turns.length === 0}
        onClick={onReset}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 12a8 8 0 1 1 2.4 5.7M4 20v-4h4" />
        </svg>
        Reset
      </button>
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
    <details
      className="cfg__log"
      onToggle={(e) => {
        /* The log sits at the rail's floor, usually below its scroll fold —
           opened from the top, it expanded into nothing the eye could see.
           An action the page answers off-screen is an action that appears
           to do nothing. */
        if (e.currentTarget.open)
          e.currentTarget.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }}
    >
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
  onSuggest,
  aside,
  chrome = 'window',
  home,
  compact,
}: {
  onSuggest?: ((suggestion: Suggestion) => void) | undefined
  aside?: React.ReactNode
  /* Each container wears its own head — a window has dots and the app's
     name; a container that brings its OWN chrome (the drawer's head, the
     phone's nav) takes `bare`. The thread never changes either way. */
  chrome?: 'window' | 'bare'
  /* The full page is a HOME, and homes follow the genre (Claude, ChatGPT,
     Le Chat): brand over the greeting, and the composer sits IN the page
     until the first turn exists, then moves to the floor. */
  home?: boolean
  /* A tight container offers FEWER ways in — one per kind, so the Ask/Do
     split never collapses while the room breathes. Neither prompt list
     was cut and no preview grew taller: the host tunes suggestion count
     per surface, which is the contract's toggle-is-the-config law doing
     its job. */
  compact?: boolean
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
              restoredFrom={state.restoredFrom}
              scope={state.scope}
              onScopeChange={(levelId) => lucet.store.dispatch({ type: 'scope/changed', levelId })}
              model={state.model}
              service={state.service}
              usage={state.usage}
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
          {/* Set dressing, honestly generic: a window is a window. Reset
             used to live here, disguised as app chrome — but Reset is the
             DEMO'S control, so it moved to the stage bar where the demo's
             other controls live, and now no container can hide it. */}
          <span className="cfg__dots" aria-hidden>
            <i /><i /><i />
          </span>
          {/* The window titles itself the way a desktop app does: by the
             APPLICATION. (A live thread-title version was tried here and
             read as odd chrome — the conversation's name belongs to inner
             surfaces, and the phone header will take it.) */}
          <span className="cfg__frame-title">Application Name</span>
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
                {/* The brand's GLYPH, not its tile — in every container's
                    welcome, the way the reference's drawer wears its spark.
                    The plated mark is chrome furniture and read as a sticker
                    over the atmosphere; in open air the same ring-and-core
                    geometry goes flat, in the page's own ink. */}
                <span className="cfg__empty-mark" aria-hidden>
                  <svg viewBox="0 0 96 96">
                    <circle
                      cx="48"
                      cy="49"
                      r="24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="7.6"
                      strokeDasharray="112 39"
                      strokeLinecap="round"
                      transform="rotate(156 48 49)"
                    />
                    <circle cx="48" cy="49" r="9.5" fill="currentColor" />
                  </svg>
                </span>
                <p className="cfg__empty-hello">How can I help?</p>
                <span className="cfg__empty-sub">
                  Ask a question, or hand a task off.
                </span>
                <span className="cfg__empty-gap" aria-hidden />
                {composerCentered ? (
                  <div className="cfg__composer cfg__composer--center">{composerNode}</div>
                ) : null}
                {suggestionsVisible(state) ? (
                  <SuggestionChips
                    suggestions={
                      compact
                        ? (['ask', 'do'] as const).flatMap((k) => {
                            const first = state.suggestions.find((s) => s.kind === k)
                            return first ? [first] : []
                          })
                        : state.suggestions
                    }
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
                onRestore={(turnId) => lucet.store.dispatch({ type: 'restore/entered', turnId })}
                onExitRestore={() => lucet.store.dispatch({ type: 'restore/exited' })}
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

/** The chat-history dressing, shared by the drawer's pane and the
 * phone's: real words, marked decorative — the conversations do not
 * exist, and the same list must not lie twice differently. */
function MockHistory() {
  return (
    <div className="cfg__history" aria-hidden>
      <div className="cfg__history-group">Today</div>
      {(
        [
          ['Quarterly planning', 'Today · 9:41'],
          ['Draft the kickoff note', 'Today · 8:12'],
        ] as const
      ).map(([t, d]) => (
        <div className="cfg__history-row" key={t} title="Not in this demo">
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
        <div className="cfg__history-row" key={t} title="Not in this demo">
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
  )
}

/**
 * The phone's nav bar, real at both ends now: the hamburger opens the
 * same menu grammar as the drawer (Home, Chat history, Settings honest
 * about being dressing), the + is a working new thread, and the title
 * stays the thread's own name. Its predecessors — a back chevron and an
 * ellipsis that did nothing — were dressing shaped like controls, which
 * is the one kind of dressing this page does not allow.
 */
function PhoneNav({
  pane,
  onPane,
  onNew,
}: {
  pane: 'thread' | 'history'
  onPane: (pane: 'thread' | 'history') => void
  onNew: () => void
}) {
  const state = useThread()
  const title =
    pane === 'history'
      ? 'Chat history'
      : state.turns[0]?.prompt.parts
          .flatMap((p) => (p.kind === 'text' ? [p.text] : []))
          .join(' ') ||
        /* An empty thread is the APP'S home screen, so the app's name —
           the title becomes a conversation's only once one exists. */
        'Application Name'
  return (
    <div className="cfg__frame-bar cfg__phone-bar">
      <details className="cfg__dmenu">
        <summary aria-label="Menu">
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
          ).map(([p, label, d]) => (
            <button
              key={p}
              type="button"
              className="cfg__dmenu-row"
              onClick={(e) => {
                onPane(p)
                e.currentTarget.closest('details')?.removeAttribute('open')
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d={d} />
              </svg>
              {label}
              {pane === p ? (
                <svg className="cfg__dmenu-check" viewBox="0 0 24 24" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              ) : null}
            </button>
          ))}
          <div className="cfg__dmenu-sep" aria-hidden />
          <button type="button" className="cfg__dmenu-row" disabled title="Not in this demo">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 7h9M17 7h3M4 17h3M11 17h9M13 4.5v5M7 14.5v5" />
            </svg>
            Settings
          </button>
        </div>
      </details>
      <span className="cfg__frame-title cfg__phone-title">{title}</span>
      <button type="button" className="cfg__reset cfg__phone-new" aria-label="New thread" onClick={onNew}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  )
}

/** The neutral application the drawer slides over. Set dressing, real
 * words — and now a real address: the breadcrumb finally IS the scope
 * ladder Scope Control reads (brief §8.1, the promise kept). */
function MockDocument({ page = 0 }: { page?: number }) {
  const p = MOCK_PAGES[page] ?? MOCK_PAGES[0]!
  return (
    <div className="cfg__mock-doc" aria-hidden>
      <div className="cfg__mock-nav">
        <span>Application Name</span>
        <span className="cfg__mock-sep">/</span>
        <span>{p.tab}</span>
        <span className="cfg__mock-sep">/</span>
        <span className="cfg__mock-here">{p.doc}</span>
      </div>
      <h2>{p.doc} notes</h2>
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
  /* The host's account, seeded so the meter has a month to spend: $10,
     some of it already lived in. A new thread PRESERVES the month (the
     reducer's law — a conversation is not a refund); the stage reset
     re-seeds it, because that button means "fresh demo", not "new
     thread". */
  const lucet = useMemo(() => {
    const instance = createLucet({ suggestions: SUGGESTIONS })
    instance.store.dispatch({ type: 'usage/changed', patch: MONTH_SEED })
    return instance
  }, [])
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
  const [phonePane, setPhonePane] = useState<'thread' | 'history'>('thread')
  /* Which of the host's pages is open behind the drawer. */
  const [mockPage, setMockPage] = useState(0)
  /* Scope keeps whatever rung the person chose when the page moves;
     only a missing selection defaults back to the page rung. */
  const state0Scope = (i: number) => {
    const current = lucet.getState().scope.selectedId
    return MOCK_PAGES[i]!.ladder.some((l) => l.id === current) ? current : 'page'
  }
  /* The HOST owns the ladder: entering the drawer view installs it,
     leaving uninstalls — a host without a scope feature renders no
     control, and the full page and phone are that host today. */
  useEffect(() => {
    if (view === 'drawer') {
      lucet.store.dispatch({
        type: 'scope/configured',
        levels: MOCK_PAGES[mockPage]!.ladder,
        selectedId: 'page',
      })
    } else {
      lucet.store.dispatch({ type: 'scope/configured', levels: [], selectedId: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])
  /* The rail collapses, the way every home's rail does. */
  const [sideOpen, setSideOpen] = useState(true)
  /* The peek ARMS only when the pointer enters the edge strip after a
     close. Without this, clicking Hide left the pointer standing on the
     rail, whose own :hover peek rule then held it at translate 0 — the
     rail never retracted, it just swapped into the floating skin. */
  const [peekArmed, setPeekArmed] = useState(false)
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
    const mock = drawer?.closest('.cfg__mock-region')
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
    setPhonePane('thread')
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
      <SiteHeader page="konfabulator" />

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
                onSuggest={(s) => {
                  writeStateParam(s.id)
                  fire(s.id)
                }}
                aside={
                  /*
                   * What makes a full page an APPLICATION instead of a chat
                   * widget: the room around the thread. One control is real —
                   * New thread does exactly what it says, the same commit as
                   * the bar's reset — and the history is set dressing, marked
                   * decorative so it cannot lie to a screen reader about
                   * conversations that do not exist.
                   */
                  <>
                  {/* Claude's grammar: collapsed is not gone. A strip of edge
                      brings the rail back OVER the page while the pointer
                      stays; the rail's own control pins it. The bar toggle
                      stays the keyboard door — hover is a shortcut, never the
                      only way in (1.4.13: persists while hovered, dismissed
                      by leaving). */}
                  {sideOpen ? null : <div className="cfg__side-hot" aria-hidden onPointerEnter={() => setPeekArmed(true)} />}
                  <aside className="cfg__side" data-closed={sideOpen ? undefined : ''} data-armed={!sideOpen && peekArmed ? '' : undefined}>
                    <span className="cfg__side-brand">
                      <span className="cfg__side-brand-id" aria-hidden>
                        <MockBrandMark />
                        Application Name
                      </span>
                      <button
                        type="button"
                        className="cfg__reset cfg__side-toggle"
                        aria-label={sideOpen ? 'Hide the sidebar' : 'Pin the sidebar open'}
                        aria-expanded={sideOpen}
                        onClick={() => {
                          const next = !sideOpen
                          setSideOpen(next)
                          setPeekArmed(false)
                          if (!next) {
                            setTimeout(() => {
                              document
                                .querySelector<HTMLButtonElement>('.cfg__side-float')
                                ?.focus()
                            }, 0)
                          }
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
                  {/* Collapsed, the control floats at the page's top-left —
                      claude.ai's placement, and the exact spot the rail's own
                      control occupies when the rail is present. The control
                      never moves; the rail arrives around it. It sits UNDER
                      the peeked rail (z), so the two never show at once. */}
                  {sideOpen ? null : (
                    <button
                      type="button"
                      className="cfg__reset cfg__side-toggle cfg__side-float"
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
                  )}
                  </>
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
              {/* TWO layers, not one: the OS's window (traffic lights and
                  the DOCUMENT'S title — this window holds the plan) above
                  the application's own header. Conflating them made the
                  app own the OS's lights (Ian). The drawer overlays the
                  app below; the OS strip stays out of reach, which is the
                  layering the demo is teaching. */}
              <div className="cfg__frame-bar">
                <span className="cfg__dots" aria-hidden>
                  <i /><i /><i />
                </span>
                <span className="cfg__frame-title">Quarterly planning</span>
              </div>
              <div className="cfg__mock-region">
              <div className="cfg__mock-app">
              <div className="cfg__mock-bar">
                <span className="cfg__mock-brand" aria-hidden>
                  <MockBrandMark />
                  Application Name
                </span>
                {/* REAL navigation now: clicking a page moves the ground
                    under the scope, and the scope follows — saying so.
                    The one lie this bar had left, retired. */}
                <span className="cfg__mock-tabs">
                  {MOCK_PAGES.map((p, i) => (
                    <button
                      key={p.tab}
                      type="button"
                      data-active={i === mockPage || undefined}
                      onClick={() => {
                        if (i === mockPage) return
                        setMockPage(i)
                        lucet.store.dispatch({
                          type: 'scope/moved',
                          levels: MOCK_PAGES[i]!.ladder,
                          selectedId: state0Scope(i),
                          note: `The page changed — \u201cThis page\u201d now covers ${MOCK_PAGES[i]!.doc}.`,
                        })
                      }}
                    >
                      {p.tab}
                    </button>
                  ))}
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
                <MockDocument page={mockPage} />
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
                        compact
                                onSuggest={(s) => {
                          writeStateParam(s.id)
                          fire(s.id)
                        }}
                      />
                    ) : (
                      /* The history pane: the same dressing law as the full
                         page's sidebar — real words, marked decorative,
                         because these conversations do not exist. */
                      <MockHistory />
                    )}
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="cfg__phone-stage" aria-label="The running app, on a phone">
              <div className="cfg__phone">
                <div className="cfg__phone-status" aria-hidden>
                  <span>9:41</span>
                  <span className="cfg__phone-island" />
                  <span className="cfg__phone-pills">
                    <i /><i />
                  </span>
                </div>
                <PhoneNav
                  pane={phonePane}
                  onPane={setPhonePane}
                  onNew={() => {
                    lucet.reset()
                    setActive(null)
                    setPhonePane('thread')
                  }}
                />
                {phonePane === 'thread' ? (
                  <AppCore
                    chrome="bare"
                    compact
                    onSuggest={(s) => {
                      writeStateParam(s.id)
                      fire(s.id)
                    }}
                  />
                ) : (
                  <MockHistory />
                )}
                <div className="cfg__phone-home" aria-hidden />
              </div>
            </section>
          )}
        </div>

        <div className="cfg__railcol">
          <div className="cfg__rail">
            {/* The rail is a PANEL with parts: the states flow scrolls in
                the middle (with the house scroll fade as its cue), and the
                event log pins at the floor — always visible, never lost
                below a silent scroll edge. */}
            <div className="cfg__rail-flow">
              <TriggerRail
                active={active}
                firing={firing}
                onFire={fire}
                onReset={() => {
                  lucet.reset()
                  lucet.store.dispatch({ type: 'usage/changed', patch: MONTH_SEED })
                  setActive(null)
                }}
              />
            </div>
            <div className="cfg__aside">
              <EventLog />
            </div>
          </div>
        </div>
      </div>
    </LucetProvider>
  )
}
