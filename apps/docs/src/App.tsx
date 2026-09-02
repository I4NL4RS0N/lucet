import { useEffect, useMemo, useRef, useState } from 'react'
import { createLucet, describeEvent, doPlan, happyPath, reasoning, suggestionsVisible, toolSuccess } from 'lucet-core'
import type { Lucet, LucetEvent, Suggestion } from 'lucet-core'
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
import { OPENER_EVENTS } from './opener'

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
    /* Do visibly does (audit round 05): the chip's promise is kept by the
       do-plan scenario — receipts, then the pages it created. */
    [doPlan, 'do', 'Creates pages in Plans', '~2 min'],
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
    tab: 'Plans',
    doc: 'Quarterly planning',
    ladder: [
      { id: 'page', label: 'This page', summary: 'Quarterly planning — the plan and its 4 linked notes', itemCount: 5 },
      { id: 'section', label: 'Plans', summary: 'Everything filed under Plans', itemCount: 12 },
      { id: 'all', label: 'Everything', summary: 'All of Aquilo', itemCount: 48 },
    ],
  },
  {
    tab: 'Reports',
    doc: 'Reports review',
    ladder: [
      { id: 'page', label: 'This page', summary: 'Reports review — the summary and its 2 appendices', itemCount: 3 },
      { id: 'section', label: 'Reports', summary: 'Everything filed under Reports', itemCount: 9 },
      { id: 'all', label: 'Everything', summary: 'All of Aquilo', itemCount: 48 },
    ],
  },
  {
    tab: 'Carriers',
    doc: 'Carrier directory',
    ladder: [
      { id: 'page', label: 'This page', summary: 'Carrier directory — the directory itself', itemCount: 1 },
      { id: 'section', label: 'Carriers', summary: 'Everything filed under Carriers', itemCount: 27 },
      { id: 'all', label: 'Everything', summary: 'All of Aquilo', itemCount: 48 },
    ],
  },
] as const


/* The mid-thread opener lives in opener.ts, shared with the components
   page's "The app, live" section so both open on the same moment. */

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
  /* THE UNBREAKABLE UNIT (review rule): a group heading and its first
     item never separate. If the resting fold would land between them,
     the fade widens until the orphaned heading is fully covered — the
     last visible thing is always a partially-faded item, never a
     heading with nothing under it. (The counting chip that used to
     ride this measurement is gone: the fade alone already signals
     overflow, which is why the chip was dropped.) */
  const flowRef = useRef<HTMLDivElement | null>(null)
  const checkFold = () => {
    const el = flowRef.current
    if (!el) return
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight <= 8
    if (atEnd || el.scrollTop > 4) {
      /* Scrolled, or nothing below: the rest-only rule — orphan
         covering applies at the resting position, the default fade
         everywhere else. */
      el.style.removeProperty('--fade-bottom')
      return
    }
    const cTop = el.getBoundingClientRect().top
    const foldY = el.clientHeight
    let safeFold = foldY
    for (const g of el.querySelectorAll('.cfg__group')) {
      const head = g.querySelector('.cfg__group-name')
      const first = g.querySelector('.cfg__trigger')
      if (!head) continue
      const headTop = head.getBoundingClientRect().top - cTop
      const firstBottom = (first ?? head).getBoundingClientRect().bottom - cTop
      if (foldY > headTop - 6 && foldY < firstBottom + 4) safeFold = Math.min(safeFold, headTop - 6)
    }
    if (safeFold < foldY) el.style.setProperty('--fade-bottom', `${Math.round(foldY - safeFold + 18)}px`)
    else el.style.removeProperty('--fade-bottom')
  }
  const kindOf = (id: string | null) =>
    groups.flatMap((g) => g.scenarios).find((s) => s.id === id)?.kind ?? 'state'
  /* A deep link or chip that lands on the other half switches the tab to
     where the marked row actually is. */
  useEffect(() => {
    if (active) setTab(kindOf(active) === 'feature' ? 'feature' : 'state')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
  useEffect(() => {
    checkFold()
    window.addEventListener('resize', checkFold)
    return () => window.removeEventListener('resize', checkFold)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  /* Cold start is a state, not the front door: it leads Baseline and
     firing it EMPTIES the thread (a reset is its scenario). */
  const COLD_START = {
    id: 'cold-start',
    label: 'Empty & cold start',
    description: 'The thread before anything has happened: the greeting, and the ways in.',
    kind: 'state' as const,
  }
  const shown = groups
    .filter((g) => (g.scenarios[0]?.kind ?? 'state') === tab)
    .map((g) =>
      g.group === 'Baseline' ? { ...g, scenarios: [COLD_START, ...g.scenarios] } : g,
    )

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
         to primary actions; presence is enough. "Something to wipe" is
         more than turns (audit round 05): a pre-send state leaves a
         draft, a queued prompt or a seeded context with no turn at all,
         and Reset must be able to clear those too. */}
      <button
        type="button"
        className="cfg__stage-reset"
        aria-label="Reset the thread"
        disabled={
          thread.turns.length === 0 &&
          thread.composer.text === '' &&
          thread.composer.queued === null &&
          thread.usage.contextTokens === 0
        }
        onClick={onReset}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 12a8 8 0 1 1 2.4 5.7M4 20v-4h4" />
        </svg>
        Reset
      </button>
      </div>
      {/* Only the GROUPS scroll: the tabs and Reset are the panel's fixed
          head, the way the event log is its fixed floor. The flow lives
          inside the nav so the fade mask can never dim the controls. */}
      <div className="cfg__rail-flow" ref={flowRef} onScroll={checkFold}>
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
      </div>
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
  narration = 'live',
  geometryEpoch,
}: {
  onSuggest?: ((suggestion: Suggestion) => void) | undefined
  aside?: React.ReactNode
  /** Bumped by the host when it changes the thread's box (a container
      switch). The thread stays container-agnostic — it only learns that
      its geometry moved and re-runs the resting placement, exactly as it
      does on a state change. Without this, a scroll position from one
      container's geometry survived into another's and could land the
      viewport between content (the view-mode regression). */
  geometryEpoch?: string
  /** 'history' while the scripted opening plays: narration follows
      initiation (the announcer's law) — the log fills silently and goes
      live when the playback ends. */
  narration?: 'live' | 'history'
  /* Each container wears its own head — a window has dots and the app's
     name; a container that brings its OWN chrome (the drawer's head, the
     phone's nav) takes `bare`. The thread never changes either way. */
  chrome?: 'window' | 'bare'
  /* The full page is a HOME, and homes follow the genre (Claude, ChatGPT,
     Le Chat): brand over the greeting, and the composer sits IN the page
     until the first turn exists, then moves to the floor. */
  /* A tight container offers FEWER ways in — one per kind, so the Ask/Do
     split never collapses while the room breathes. Neither prompt list
     was cut and no preview grew taller: the host tunes suggestion count
     per surface, which is the contract's toggle-is-the-config law doing
     its job. */
}) {
  const lucet = useLucet()
  const state = useThread()
  const attachCount = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    /* A chat opens at its LATEST message — including the boot-seeded
       opener. Guarded on status alone, the thread rested at the TOP, and
       at Expressive density the turn's tail (sources, the freshness
       badge, the actions row — two differentiators and the controls)
       sat below the fold looking deleted. */
    if (!el || state.turns.length === 0) return
    if (state.restoredFrom) {
      /* In preview, the previewed turn and its banner hold the view:
         this effect fires on every state change, and slamming to the
         bottom scrolled the reader away from the choice they had just
         made (the banner rendered off-screen). */
      el.querySelector('.lucet-thread__restored')?.scrollIntoView({ block: 'nearest' })
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [state, geometryEpoch])

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
              onConfirmSpend={() => void lucet.confirmSpend()}
              onDismissIntercept={() => lucet.dismissIntercept()}
              onQueue={(text) => lucet.store.dispatch({ type: 'composer/queued', text })}
              onNewThread={() => {
                /* The blocked month's exit: the same commit as the bar's
                   Reset and the sidebar's New thread. */
                lucet.reset()
                lucet.store.dispatch({ type: 'usage/changed', patch: MONTH_SEED })
              }}
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
          <span className="cfg__frame-title">Aquilo</span>
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
                    welcome the identity rides in open air, so the plated
                    tile would read as a sticker over the atmosphere. The
                    Aquilo wind-crossbar A, flat, in the page's own ink:
                    identity, not decoration — the one surface the mark
                    sweep hadn't reached. */}
                <span className="cfg__empty-mark" aria-hidden>
                  <svg viewBox="0 0 96 96">
                    <g
                      transform="translate(18 12.25) scale(3)"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6.5 20 L12 4.5 L17.5 20" />
                      <path d="M2.5 14.5 H15.55" />
                    </g>
                  </svg>
                </span>
                <p className="cfg__empty-hello">How can I help?</p>
                <span className="cfg__empty-sub">
                  Ask a question, or hand a task off.
                </span>
              </div>
            ) : (
              <Thread
                narration={narration}
                state={state}
                selfId="you"
                onRetry={(turnId) => void lucet.retry(turnId)}
                onFeedback={(messageId, verdict) =>
                  lucet.store.dispatch({ type: 'feedback/given', messageId, verdict })
                }
                onRestore={(turnId) => lucet.store.dispatch({ type: 'restore/entered', turnId })}
                onRestoreCommit={(turnId) => lucet.restore(turnId)}
                onExitRestore={() => lucet.store.dispatch({ type: 'restore/exited' })}
                onRecover={(turnId) => void lucet.recover(turnId)}
                onNoticeAction={(action) => {
                  /* Retry on Auto: the model control moves first, then the
                     turn is asked again — the scenario's recovery answers
                     on the model the person chose. */
                  lucet.store.dispatch({ type: 'model/changed', modelId: action.modelId })
                  void lucet.retry(action.turnId)
                }}
              />
            )}
          </div>

          {/* THE FLOOR: the frame is a viewport (auto | 1fr | auto), and
              this is the third row — composer anchored to the bottom edge,
              suggestions below it, both on one centred measure. The empty
              state stopped being a special case: the hero centres in the
              1fr above, and adding a message cannot move this seat. */}
          <div className="cfg__floor">
            <div className="cfg__floor-in">
              {/* Suggestions ABOVE the composer — the spec's own correctness
                  test decides the order: the composer is bottom-anchored, so
                  the chips' departure on the first message is absorbed by
                  the 1fr above and the composer does not move a pixel. (Also
                  claude.ai's grammar, which this pattern follows.) */}
              {suggestionsVisible(state) ? (
                <SuggestionChips
                  /* ONE-TO-ONE (review): two-versus-two read as a four-item
                     menu; one plain row against one bordered card carrying
                     its cost reads as a claim about two kinds of action.
                     Same design work, more of the point visible. */
                  suggestions={(['ask', 'do'] as const).flatMap((k) => {
                    const first = state.suggestions.find((s) => s.kind === k)
                    return first ? [first] : []
                  })}
                  disabled={state.composer.locked}
                  onPick={(s) => onSuggest?.(s)}
                />
              ) : null}
              <div className="cfg__composer">{composerNode}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/** THE AQUILO MARK on the universe's ONE tile: a geometric A whose
 * crossbar overshoots left as a single wind stroke. The plate and its
 * sheen stay from the B2 treatment; only the glyph changed. Set
 * dressing, one colour — the mark wears the tile's own hardware ink
 * (the literal the orb-ring wore before it), because the plate is
 * always dark and inheriting the theme's ink would go illegible in
 * light. Every container shows the same product, so both tiles are
 * this one component. */
function MockBrandMark({ idp = 'fbm' }: { idp?: string }) {
  return (
    <svg className="cfg__mock-logo" viewBox="0 0 96 96">
      <defs>
        {/* The plate's stops come from the tile's custom properties (see
            .cfg__mock-logo): neutral by default and in monochrome, the
            host's accent otherwise. Inline style, because var() is not
            honoured in a presentation attribute. */}
        <linearGradient id={`${idp}-p`} x1="0" y1="0" x2="0.45" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--cfg-tile-1)' }} />
          <stop offset="0.52" style={{ stopColor: 'var(--cfg-tile-2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--cfg-tile-3)' }} />
        </linearGradient>
        <linearGradient id={`${idp}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.17" />
          <stop offset="0.38" stopColor="#fff" stopOpacity="0.02" />
          <stop offset="0.62" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${idp}-k`}>
          <rect width="96" height="96" rx="27" />
        </clipPath>
      </defs>
      <rect width="96" height="96" rx="27" fill={`url(#${idp}-p)`} />
      <g clipPath={`url(#${idp}-k)`}>
        <g
          transform="translate(18 12.25) scale(3)"
          fill="none"
          stroke="#F4F5FB"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6.5 20 L12 4.5 L17.5 20" />
          <path d="M2.5 14.5 H15.55" />
        </g>
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
          ['Quarterly planning', 'Today · 10:24'],
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
          ['Compare the two carrier quotes', 'Tue · 16:02'],
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
  /* Truncation lands ON THE WORD (review: the title read "since las…").
     The budget is sized to the narrowest bar at the largest scale and
     the cut walks back to the last whole word; the CSS ellipsis stays
     underneath as the backstop for widths this arithmetic cannot see. */
  const truncateWords = (text: string | undefined, budget = 30) => {
    if (!text || text.length <= budget) return text ?? ''
    const cut = text.slice(0, budget + 1)
    const atSpace = cut.lastIndexOf(' ')
    return `${cut.slice(0, atSpace > 8 ? atSpace : budget).trimEnd()}…`
  }
  const title =
    pane === 'history'
      ? 'Chat history'
      : truncateWords(
          state.turns[0]?.prompt.parts
            .flatMap((p) => (p.kind === 'text' ? [p.text] : []))
            .join(' '),
        ) ||
        /* An empty thread is the APP'S home screen, so the app's name —
           the title becomes a conversation's only once one exists. */
        'Aquilo'
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
        <span>Aquilo</span>
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
      {/* The drawer's translucency needs a WITNESS: saturated furniture
          its left edge crosses, so Glass visibly carries the colour
          through the blurred pane while Paper's hard edge just covers
          it. Plausible, not a test pattern — these bars are the
          paragraph above, drawn. */}
      <div className="cfg__mock-chart">
        {(
          [
            ['Carrier onboarding', 72, 'ok'],
            ['Report-template rollout', 64, 'ok'],
            ['Booth and logistics', 55, 'ok'],
            ['Budget revision', 38, 'blocked'],
            ['Workstream review', 22, 'blocked'],
          ] as const
        ).map(([label, pct, tone]) => (
          <div className="cfg__mock-chart-row" key={label}>
            <span>{label}</span>
            <span className="cfg__mock-track">
              <i style={{ inlineSize: `${pct}%` }} data-tone={tone} />
            </span>
          </div>
        ))}
      </div>
      <div className="cfg__mock-callout">
        Review moved to Thursday. Both blocked workstreams wait on it; the
        venue hold expires Friday.
      </div>
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
  /* THE OPENING PLAYBACK (motion pass): the site has a real scripted
     runtime, so on FIRST arrival the frozen mid-thread plays itself
     into being — six-odd seconds of the real events at real pace, then
     genuine stillness. Playback is a PATH to the resting state, never
     a different destination: it dispatches the same OPENER_EVENTS the
     instant seed does, so the settled page is byte-identical and every
     audit and capture stays valid. Skipped for: deep links (they own
     the opening), ?instant=1 (audits and captures must not wait, and
     they say so — the browser is never sniffed; ?playback=1 forces the
     playback for the recording), reduced motion, repeat visits this
     session, and every Reset. */
  const playbackWanted = useMemo(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      if (q.has('state')) return false
      /* Reduced motion beats the force flag: it is an accessibility
         preference, and a recording rig never sets it. */
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
      if (q.has('playback')) return true
      /* Never inferred from the browser (round 06): a reviewer's automated
         browser must see what a person sees, so nothing here reads
         navigator.webdriver. A capture or audit that needs the resting
         thread at once says so — ?instant=1. */
      if (q.has('instant')) return false
      return window.sessionStorage.getItem('lucet-konf-played') === null
    } catch {
      return false
    }
  }, [])
  const lucet = useMemo(() => {
    const instance = createLucet({ suggestions: SUGGESTIONS })
    instance.store.dispatch({ type: 'usage/changed', patch: MONTH_SEED })
    if (!playbackWanted) for (const e of OPENER_EVENTS) instance.store.dispatch(e)
    return instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /* Run-once across StrictMode's doubled effects: the ref survives the
     simulated remount, so the player and its listeners install exactly
     once. No effect cleanup on purpose — the listeners remove
     themselves when playback ends or is interrupted, and a strict-mode
     cleanup would strip them from the one live player. */
  const playbackStarted = useRef(false)
  /* Mirrors the player: 'history' narration while it runs, 'live' the
     moment it ends or is interrupted. Automation, reduced motion, and
     repeat visits never enter playback, so they are 'live' from the
     first frame. */
  const [playing, setPlaying] = useState(playbackWanted)
  /* The instrument behind Reset, reachable by the audits: what is still
     pending after a reset must be nothing. Assigned from an effect so it
     can only ever name the MOUNTED instance — development double-invokes
     state initializers and discards one result, and an assignment made
     inside the initializer named the discarded twin. */
  useEffect(() => {
    ;(window as unknown as { __lucet?: Lucet }).__lucet = lucet
  }, [lucet])
  useEffect(() => {
    if (!playbackWanted || playbackStarted.current) return
    playbackStarted.current = true
    try {
      window.sessionStorage.setItem('lucet-konf-played', '1')
    } catch {
      /* storage may be unavailable; playback still runs once */
    }
    let done = false
    let cursor = 0
    /* True while the event AT cursor is mid-flight (a streaming delta,
       a running tool): the loop's own tail completes it exactly once,
       so fast-forward must not re-dispatch it. */
    let inFlight = false
    const finish = () => {
      if (done) return
      done = true
      setPlaying(false)
      /* Fast-forward, never skip: the remaining events land as-is, so
         the resting state is exactly the seeded one. */
      for (let i = cursor + (inFlight ? 1 : 0); i < OPENER_EVENTS.length; i++) {
        lucet.store.dispatch(OPENER_EVENTS[i]!)
      }
      cleanup()
    }
    const cleanup = () => {
      window.removeEventListener('pointerdown', finish, true)
      window.removeEventListener('keydown', finish, true)
    }
    window.addEventListener('pointerdown', finish, true)
    window.addEventListener('keydown', finish, true)
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    void (async () => {
      await sleep(700)
      for (; cursor < OPENER_EVENTS.length && !done; ) {
        const e = OPENER_EVENTS[cursor]!
        if (e.type === 'part/added' && e.part.kind === 'tool') {
          /* The receipt runs for real: the running part first, the
             true settle after its honest 1.4s. The seed's part arrives
             already-succeeded, so running + tool/settled reproduces it
             exactly; on interrupt the settle still lands (once). */
          inFlight = true
          const part = e.part
          lucet.store.dispatch({
            type: 'part/added',
            messageId: e.messageId,
            part: { ...part, status: 'running', detail: null, result: null },
          })
          await sleep(1400)
          lucet.store.dispatch({
            type: 'tool/settled',
            messageId: e.messageId,
            partId: part.id,
            status: 'succeeded',
            detail: part.detail ?? '',
            result: part.result,
          })
          inFlight = false
          cursor++
          continue
        }
        if (e.type === 'part/delta') {
          /* Stream the answer word by word through the same event the
             runtime uses; on interrupt the remainder lands whole. */
          inFlight = true
          const words = e.delta.match(/\S+\s*/g) ?? [e.delta]
          let sent = 0
          for (const w of words) {
            if (done) break
            lucet.store.dispatch({ type: 'part/delta', messageId: e.messageId, partId: e.partId, delta: w })
            sent += w.length
            await sleep(22)
          }
          if (sent < e.delta.length)
            lucet.store.dispatch({
              type: 'part/delta',
              messageId: e.messageId,
              partId: e.partId,
              delta: e.delta.slice(sent),
            })
          inFlight = false
          cursor++
          continue
        }
        lucet.store.dispatch(e)
        cursor++
        if (e.type === 'turn/submitted') await sleep(550)
        else if (e.type === 'response/started') await sleep(380)
        else if (e.type === 'response/settled') await sleep(650)
        else if (e.type === 'part/added' && e.part.kind === 'sources') await sleep(300)
      }
      done = true
      setPlaying(false)
      cleanup()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  /* Below 1100 the sidebar used to display:none — unreachable, and the
     collapsed state is itself worth showing (review). It now COLLAPSES:
     the floating toggle and the edge peek stay, and the person can pin
     it open even here. */
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1100px)')
    const apply = () => {
      if (mq.matches) setSideOpen(false)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
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
    if (id === 'cold-start') {
      /* The cold start's scenario IS the reset: an empty thread with the
         greeting and the ways in. The month survives, as always. */
      lucet.reset()
      return
    }
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
    /* cold-start is the rail's own state, not a runtime scenario — the
       registry check alone dropped it, so the URL the rail itself
       writes for it could never reopen. */
    if (linked && (linked === 'cold-start' || lucet.triggers.get(linked))) fire(linked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lucet])

  return (
    <LucetProvider lucet={lucet}>
      <SiteHeader page="konfabulator" />

      <div className="cfg__layout">
        <div className="cfg__main">
          {/* The floor the frame floats on is the host's, and follows the
              exhibit (ruling, 2026-09-01) — see .cfg__stage-floor in
              konfabulator.css. It wears the expression for its ground
              alone; the axis itself still rides on the frame below. */}
          <div className="cfg__stage-floor" data-expression={themeState.expression} aria-hidden="true" />
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

          {/* THE EXHIBIT WEARS THE AXIS; THE CHROME DOES NOT (decision,
              2026-09-01): the docs page around the stage pins to Paper — a
              constant instrument reading — and data-expression rides on
              the app containers themselves. This also demonstrates the
              axis as it ships: scoped to a subtree, the way a host
              product would adopt it, not a whole-page mode. Amended
              2026-09-01: the chrome is a constant; the floor is the
              host's, and follows the exhibit (.cfg__stage-floor above). */}
          {view === 'full' ? (
            <section
              className="cfg__frame cfg__frame--app"
              data-expression={themeState.expression}
              aria-label="The running app"
            >
              <AppCore
                geometryEpoch={`${view}:${drawerMode}`}
                narration={playing ? 'history' : 'live'}
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
                        <span className="cfg__side-brand-name">Northbound</span>
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
                      <div className="cfg__side-row">Compare the two carrier quotes</div>
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
              data-expression={themeState.expression}
              aria-label="The running app, as a drawer"
            >
              {/* The host application's own chrome. The brand is REAL but
                  nobody's — the Aquilo wind-stroke A on the plated tile Lucet
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
                  Aquilo
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
                geometryEpoch={`${view}:${drawerMode}`}
                        narration={playing ? 'history' : 'live'}
                        chrome="bare"
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
              <div className="cfg__phone" data-expression={themeState.expression}>
                <div className="cfg__phone-status" aria-hidden>
                  {/* Any time but Apple's 9:41 — the demo-time that reads as borrowed. */}
                  <span>10:24</span>
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
                geometryEpoch={`${view}:${drawerMode}`}
                    narration={playing ? 'history' : 'live'}
                    chrome="bare"
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
            {/* The rail is a PANEL with parts: tabs and Reset fixed at the
                head, the states flow scrolling in the middle (the house
                scroll fade as its cue), the event log pinned at the floor. */}
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
            <div className="cfg__aside">
              <EventLog />
            </div>
          </div>
        </div>
      </div>
    </LucetProvider>
  )
}
