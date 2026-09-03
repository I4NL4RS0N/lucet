import { useEffect, useMemo, useRef, useState } from 'react'
import { createInitialState, createLucet, reduce } from 'lucet-core'
import type { RecoveryVerb, LucetEvent, ThreadState } from 'lucet-core'
import { PromptInput, SuggestionChips, Thread } from 'lucet-react'
import { AppearancePrefs, useAppearance, useCanvasGround } from '../components/ThemeControls'
import { Chapter } from '../components/Chapter'
import { SiteHeader } from '../components/SiteHeader'
import { OPENER_EVENTS } from '../opener'

/**
 * The components stage. Public since 2026-09-01 — the primitives page's
 * method applied to composites.
 *
 * Every specimen's state is built by REPLAYING EVENTS through the real
 * reducer, exactly as the runtime would produce them. Nothing here is a
 * drawing of a state; it is the state, which is the whole point of keeping
 * the logic in core.
 */

const noop = () => {}

/** Replay events over a fresh thread. Same helper the core tests use. */
function play(events: readonly LucetEvent[]): ThreadState {
  return events.reduce((s, e) => reduce(s, e, { now: 0 }), createInitialState('stage'))
}

const type = (text: string): LucetEvent => ({ type: 'composer/changed', text })
const add = (id: string, name: string, kind: 'image' | 'document' = 'document'): LucetEvent => ({
  type: 'attachment/added',
  id,
  name,
  fileKind: kind,
  sizeBytes: 240_000,
})
const settle = (id: string, status: 'ready' | 'failed', reason: string | null = null): LucetEvent => ({
  type: 'attachment/settled',
  id,
  status,
  reason,
})

type Fixture = {
  label: string
  note: string
  /** The state IS these events, replayed — and the Code view shows them,
      generated from this very array so it can never drift. */
  events: readonly LucetEvent[]
  streaming?: boolean
}

/* Replay once per fixture; render reads the cache. */
const FIXTURE_STATE = new WeakMap<Fixture, ThreadState>()
function stateOf(f: Fixture): ThreadState {
  let st = FIXTURE_STATE.get(f)
  if (!st) {
    st = play(f.events)
    FIXTURE_STATE.set(f, st)
  }
  return st
}

/* The Code view: the exact events above the exact usage — the state
   inspector doubling as API documentation, per the brief. */
function codeFor(f: Fixture, usage: string): string {
  /* Pretty-printed, one event per stanza: a single-line event ran off
     the edge of the page and read as noise, not documentation. */
  const lines = f.events.map(
    (e) =>
      JSON.stringify(e, null, 2)
        .split('\n')
        .map((ln) => `  ${ln}`)
        .join('\n') + ',',
  )
  return [
    '// This state is nothing but these events, replayed through the reducer.',
    ...(lines.length === 0
      ? ['const events: LucetEvent[] = []']
      : ['const events: LucetEvent[] = [', ...lines, ']']),
    "const state = events.reduce((s, e) => reduce(s, e, { now: 0 }), createInitialState('app'))",
    '',
    usage,
  ].join('\n')
}

const USAGE_THREAD = '<Thread state={state} selfId="you" onRetry={onRetry} onRecover={onRecover} onFeedback={onFeedback} />'

/**
 * Preview | Code, the adoption affordance — with the Lucet difference:
 * the Code view is generated FROM the fixture's own events, so what you
 * copy is the exact truth of what you saw. Elements shows one snippet
 * for one happy path; this shows the event story of every state.
 */
function Example({
  label,
  note,
  code,
  max,
  variant,
  children,
}: {
  label: string
  note: string
  code: string
  max?: number
  /** Composition role on the components page: 'band' spans a well's full
      width with the note as a hanging label — the section's showcase row. */
  variant?: 'band'
  children: React.ReactNode
}) {
  const [view, setView] = useState<'preview' | 'code'>('preview')
  const [copied, setCopied] = useState(false)
  return (
    <div className={variant ? `spec spec--wide spec--${variant}` : 'spec spec--wide'}>
      <div className="spec__head">
        <span className="spec__label">{label}</span>
        <div className="spec__tabs" role="group" aria-label="View as">
          {(['preview', 'code'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v === 'preview' ? 'Preview' : 'Code'}
            </button>
          ))}
        </div>
      </div>
      {view === 'preview' ? (
        <div
          className="spec__demo"
          style={max === undefined ? undefined : ({ '--demo-max': `${max}px` } as React.CSSProperties)}
        >
          {children}
        </div>
      ) : (
        <div className="spec__code">
          <button
            type="button"
            className="spec__copy"
            onClick={() => {
              navigator.clipboard
                .writeText(code)
                .then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                })
                .catch(() => setCopied(false))
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <pre tabIndex={0} role="region" aria-label={`${label} — code`}>
            <code>{code}</code>
          </pre>
        </div>
      )}
      <p className="spec__note">{note}</p>
    </div>
  )
}
const USAGE_PROMPT = [
  '<PromptInput',
  '  composer={state.composer}',
  '  model={state.model}',
  '  service={state.service}',
  '  selfId="you"',
  '  onChange={…} onSubmit={…} onQueue={…} onModelChange={…}',
  '  onAttach={…} onRemoveAttachment={…} onRetryAttachment={…}',
  '/>',
].join('\n')

/* Build a full turn: prompt in, response streamed, settled however told. */
function turn(
  n: number,
  prompt: string,
  opts: {
    author?: string
    attachmentIds?: readonly string[]
    reply?: string
    tool?: {
      name: string
      status: 'running' | 'succeeded' | 'failed' | 'partial'
      detail?: string
      args?: string
      result?: string
      /** A running specimen shows a FIXED elapsed time (component audit
          02): a specimen demonstrates a state, and a state does not age. */
      elapsedMs?: number
    }
    /** The ending's own exit, as the Konfabulator's scenarios stamp it. */
    recovery?: RecoveryVerb
    /** Reasoning text streamed before the reply. */
    reasoning?: string
    settle?: 'complete' | 'interrupted' | 'failed' | 'refused' | 'streaming'
    reason?: string
    /** The commit this turn retries — same words, new version. */
    retryOf?: string
  } = {},
): LucetEvent[] {
  const t = `t${n}`, pm = `pm${n}`, rm = `rm${n}`
  const events: LucetEvent[] = [
    { type: 'turn/submitted', turnId: t, versionId: `v${n}`, messageId: pm, text: prompt, authorId: opts.author ?? 'you', attachmentIds: opts.attachmentIds ?? [], retryOf: opts.retryOf ?? null },
    { type: 'response/started', turnId: t, messageId: rm },
  ]
  if (opts.reasoning !== undefined) events.push({ type: 'part/added', messageId: rm, part: { kind: 'reasoning', id: `${rm}_r`, text: opts.reasoning } })
  if (opts.tool) events.push({ type: 'part/added', messageId: rm, part: { kind: 'tool', id: `${rm}_t`, name: opts.tool.name, status: opts.tool.status, detail: opts.tool.detail ?? null, args: opts.tool.args ?? null, result: opts.tool.result ?? null, ...(opts.tool.elapsedMs === undefined ? {} : { elapsedMs: opts.tool.elapsedMs }) } })
  if (opts.reply !== undefined) {
    events.push({ type: 'part/added', messageId: rm, part: { kind: 'text', id: `${rm}_x`, text: '' } })
    events.push({ type: 'part/delta', messageId: rm, partId: `${rm}_x`, delta: opts.reply })
  }
  const settle = opts.settle ?? 'complete'
  if (settle !== 'streaming') {
    events.push({ type: 'response/settled', messageId: rm, status: settle, reason: opts.reason ?? null, ...(opts.recovery ? { recovery: opts.recovery } : {}) })
    events.push({ type: 'composer/unlocked' })
  }
  return events
}

/* Citations & sources: the bibliography in each of its three conditions,
   the aging built by replaying source/changed through the real reducer. */
const CITE = (n: 1 | 2 | 3) => [
  ...turn(1, 'Where do the revised dates come from?', {
    reply:
      'The freeze lands Tuesday per the Q3 revision [1], and the vendor quote fixes the print deadline [2].',
  }),
  {
    type: 'part/added' as const,
    messageId: 'rm1',
    part: {
      kind: 'sources' as const,
      id: 'srcp1',
      sources: [
        {
          id: 's-q3',
          title: 'Q3 revision',
          location: 'Plans / Quarterly',
          sourceKind: 'document' as const,
          status: 'ok' as const,
          note: null,
          detail: 'Pages 4\u20136',
          trace: '{ "pages": [4, 5, 6], "passage": "Freeze lands Tuesday; nothing merges after." }',
        },
        {
          id: 's-quote',
          title: 'Vendor quote',
          location: 'Suppliers / Print',
          sourceKind: 'data' as const,
          status: 'ok' as const,
          note: null,
          detail: 'Query, 3 rows',
          trace: '{ "query": "deadline FROM quotes WHERE vendor = \'print\'", "returned": 3 }',
        },
        /* No trace shared by the host: a plain row, no chevron — the
           anti-dead-expand law on the stage where the audit can see it. */
        {
          id: 's-survey',
          title: 'Site survey',
          location: 'Facilities / Reviews',
          sourceKind: 'document' as const,
          status: 'ok' as const,
          note: null,
          detail: null,
          trace: null,
        },
      ],
    },
  },
  ...(n >= 2
    ? [{
        type: 'source/changed' as const,
        messageId: 'rm1',
        partId: 'srcp1',
        sourceId: 's-q3',
        status: 'stale' as const,
        note: 'Updated after it was cited — the dates may have moved.',
      }]
    : []),
  ...(n >= 3
    ? [{
        type: 'source/changed' as const,
        messageId: 'rm1',
        partId: 'srcp1',
        sourceId: 's-quote',
        status: 'gone' as const,
        note: 'Removed from the library after it was cited.',
      }]
    : []),
]

const SOURCES_FIXTURES: readonly Fixture[] = [
  {
    label: 'Cited, everything standing',
    note: 'Markers in the text, the bibliography under the answer. Sources are part of the message.',
    events: (CITE(1)),
  },
  {
    label: 'A source updated since it was cited',
    note: 'The citation aged after settle: caution ink, the clock turned back, and the words say what happened.',
    events: (CITE(2)),
  },
  {
    label: 'A source removed since it was cited',
    note: 'Struck through and said so, in the danger ink. A dead reference marked dead beats a confident link to nothing.',
    events: (CITE(3)),
  },
]

/* Version marker + restore: two commits of the same words, then the
   restored view — replayed through the real reducer like everything. */
const VERSION_EVENTS = [
  ...turn(1, 'Tighten the summary to three sentences.', {
    reply:
      'The workstreams are mostly on schedule, though two are blocked on the same review. The budget follows the revised figures. The template switches Tuesday. The venue hold still needs confirming.',
  }),
  ...turn(2, 'Tighten the summary to three sentences.', {
    reply:
      'Three of five workstreams are on schedule; the rest unblock after Thursday. Budget and template switch Tuesday. Only the venue hold is open.',
    retryOf: 't1',
  }),
]

const VERSIONS_FIXTURES: readonly Fixture[] = [
  {
    label: 'An earlier version, and it says so',
    note: 'Asking again makes a new version of the same words: the retried one wears its word, the earlier one recedes instead of vanishing — hover it for the ordinal.',
    events: (VERSION_EVENTS),
  },
  {
    label: 'The preview',
    note: 'Previewing an earlier version: later turns set aside — dimmed, inert, skipped by the reader — and the banner pairs the way back with the commit. Restoring only ever adds.',
    events: ([...VERSION_EVENTS, { type: 'restore/entered' as const, turnId: 't1' }]),
  },
]

/* The receipt lifecycle, staged as one horizontal sequence: running,
   partly returned, failed. Partial is the differentiator — succeeded-or-
   failed is the lie that lets a product answer from two thirds of the
   data — so the three truths stand side by side where the progression
   reads at a glance. */
const TOOL_FIXTURES: readonly Fixture[] = [
  {
    label: 'A tool at work',
    note: 'A running tool is a progress report, not the subject: the orb and the tool’s name. The receipt of what it was asked is already behind the chevron, mid-run. The clock reads 1.2s and holds: this specimen demonstrates a state, and a state does not age — sequences (the live thread above, the Konfabulator’s Do path) run on the real clock and settle.',
    events: [
      ...turn(1, 'Check the three sources I flagged.', {
        tool: {
          name: 'Searching the documents',
          status: 'running',
          args: '{ "query": "sources flagged this week", "limit": 3 }',
          elapsedMs: 1200,
        },
        settle: 'streaming',
      }),
    ],
  },
  {
    label: 'A tool, partly returned',
    note: 'The differentiator. Partial wears the caution ink, says so in words, and the receipt shows exactly what came back. The chip stays calm; the word carries it. The exit is the state’s own — Retry missing source, one press, a new version — not a generic Ask again.',
    events: [
      ...turn(1, 'Check the three sources I flagged.', {
        tool: {
          name: 'Searched the documents',
          status: 'partial',
          detail: '2 of 3 sources returned. Timed out on the third.',
          args: '{ "query": "sources flagged this week", "limit": 3 }',
          result: '{ "returned": 2, "timed_out": ["carrier quote"], "retryable": true }',
        },
        reply: 'Two of the three have changed. The third did not come back in time, so this is not the full picture.',
        recovery: { label: 'Retry missing source', icon: 'retry-one', mode: 'retry', at: null, scheduledAt: null },
      }),
    ],
  },
  {
    label: 'A tool that failed, with nothing to show',
    note: 'No result came back, so there is no receipt to open on that side — no payload means no chevron: a disclosure over an empty body is a dead promise, and this library has shipped its last one.',
    events: [
      ...turn(1, 'Check the carrier quote.', {
        tool: {
          name: 'Searched the documents',
          status: 'failed',
          detail: 'The source did not respond.',
        },
        reply: 'I could not check it — the source did not respond. Ask again and I will retry.',
      }),
    ],
  },
]

const THREAD_FIXTURES: readonly Fixture[] = [
  {
    label: 'A finished turn, attachments and all',
    note: 'The prompt keeps a surface and shows what went with it; the answer is a document — no bubble, full measure.',
    events: ([
      add('f1', 'quarterly-summary.pdf'), settle('f1', 'ready'),
      ...turn(1, 'What changed between these two revisions?', {
        attachmentIds: ['f1'],
        tool: {
          name: 'Searched the document',
          status: 'succeeded',
          detail: '12 passages',
          args: '{ "query": "changes between revisions", "limit": 20 }',
          result: '{ "passages": 12, "sections": ["schedule", "review"] }',
        },
        reply: 'Only the schedule moved. The review step now runs after approval, and anything filed before Tuesday follows the previous order.',
      }),
      /* A recorded verdict, so the pressed state is on the stage. */
      { type: 'feedback/given', messageId: 'rm1', verdict: 'up' },
    ]),
  },
  {
    label: 'Streaming',
    note: 'The caret rides the live edge of the text — the eye tracks one thing.',
    events: [
      ...turn(1, 'Summarise the meeting notes.', {
        reply: 'Three decisions were made. The first covers the',
        settle: 'streaming',
      }),
    ],
  },
  {
    label: 'Thinking, live',
    note: 'While the model thinks, the row IS the loading state: the orb and its word, expandable mid-stream for anyone who wants to watch the working arrive.',
    events: [
      ...turn(1, 'Which plan is more likely to slip?', {
        reasoning: 'Both end on the same date, so comparing end dates says nothing. The second front-loads its',
        settle: 'streaming',
      }),
    ],
  },
  {
    label: 'Why this answer',
    note: 'Settled thinking is a quiet fact wearing the quote’s grammar — the machine quoting its own working, collapsed by default, never pushed at you. A real disclosure now: it opens.',
    events: [
      ...turn(1, 'Which plan is more likely to slip?', {
        reasoning: 'Both end on the same date, so comparing end dates says nothing. The second front-loads its dependencies, which shortens the critical path but leaves no slack if any single one moves.',
        reply: 'The second, though not for the reason the timeline suggests. Every task depends on the one before it, so a single delay moves the end date by the same amount.',
      }),
    ],
  },
  {
    label: 'A formatted answer',
    note: 'The response is a document, and markdown is the dress documents arrive in: headings demoted below the page’s own, links that earn the click, a table in a hairline grid, code with honest copy.',
    events: [
      ...turn(1, 'Turn my notes into a short plan.', {
        reply: [
          '## The plan',
          '',
          'Three steps, smallest risk first — dates from the [revised timeline](https://example.com/timeline).',
          '',
          '1. **Freeze the template** — nothing merges after Tuesday.',
          '2. **Move the review** to Thursday.',
          '',
          '| Workstream | Owner | Due |',
          '| --- | --- | --- |',
          '| Template | Ada | Tuesday |',
          '| Review | Sam | Thursday |',
          '',
          '```text',
          'plan/',
          '  brief.md',
          '  decisions.md',
          '```',
          '',
          'Anything undecided lands in `decisions.md` with a date next to it.',
          '',
          '> If a step slips, say so the day it slips — *that* day, not Friday.',
        ].join('\n'),
      }),
    ],
  },
  {
    label: 'Streaming into a code block',
    note: 'At the live edge, markers are promises: the open fence is already a code surface, the caret rides inside it, and copy waits — offering half a snippet would hand you broken code.',
    events: [
      ...turn(1, 'Show the folder layout.', {
        reply: 'Flat, three files:\n\n```text\nplan/\n  brief.md',
        settle: 'streaming',
      }),
    ],
  },
  {
    label: 'Stopped inside a code block',
    note: 'The fence never closed, but at settle the grace is withdrawn and what arrived is kept — rendered as code, copyable, with the ending saying so in words.',
    events: [
      ...turn(1, 'Show the folder layout.', {
        reply: 'Flat, three files:\n\n```text\nplan/\n  brief.md',
        settle: 'interrupted',
        reason: 'Stopped by you. What arrived is kept.',
      }),
    ],
  },
  {
    label: 'Stopped early',
    note: 'What arrived stays, and the ending says so plainly.',
    events: [
      ...turn(1, 'List every open question.', {
        reply: 'There are four. The first two concern the budget',
        settle: 'interrupted',
        reason: 'Stopped by you. What arrived is kept.',
      }),
    ],
  },
  {
    label: 'Failed',
    note: 'A failure is an ending with words, never a spinner that never resolves.',
    events: [
      ...turn(1, 'Compare the proposals.', {
        settle: 'failed',
        reason: 'The service dropped the connection. Nothing was charged.',
      }),
    ],
  },
  {
    label: 'Declined',
    note: 'A refusal is not an error, so it does not wear red. It says why, calmly.',
    events: [
      ...turn(1, 'Write it in her voice exactly.', {
        settle: 'refused',
        reason: 'That would imitate a real person. Happy to draft it in a neutral voice instead.',
      }),
    ],
  },
  {
    label: 'Multiplayer — two people, one thread',
    note: 'The group-chat grammar: yours sit right with no avatar, other people sit left with a face — the humans get the avatars, the assistant is just its document.',
    events: ([
      ...turn(1, 'Pull the numbers for the northern site.', { author: 'Ada', reply: 'Done — the totals are in the table above, and the outlier is flagged.' }),
      ...turn(2, 'And the same for the southern one?', { author: 'you', reply: 'Same shape, one difference: the southern site peaks a month later.' }),
    ]),
  },
]

/* THE SECTION'S COMPOSITION (audit round 02): composed, not listed, and
   it tells the story in order. The finished turn opens on the rail; the
   three arriving states sit as one trio — text streaming, thinking live,
   thinking settled — because they are short and belong together; the
   formatted answer takes the rail at full measure, since the response is
   a document and that is the thesis; the code pair shares a well; the
   three endings sit side by side, because the contrast between Stopped
   early, Failed and Declined is the pedagogy; the shared thread closes
   on the rail its grammar needs. Pairing by height matters as much as
   pairing by meaning: a short example beside a tall one leaves a void.
   Specimen text and reducer states are untouched. Every fixture is
   placed exactly once — asserted below, so a fixture added to the list
   cannot fall out of the page. */
const THREAD_LAYOUT: ReadonlyArray<{ kind: 'rail' | 'duet' | 'trio'; open?: true; labels: readonly string[] }> = [
  { kind: 'rail', labels: ['A finished turn, attachments and all'] },
  /* The trios sit on the OPEN plane (audit round 03): unequal-height
     states inside one equal-height well left voids, so the enclosure
     goes and the gutters separate. The code duet's cells match within
     37px and keep their well. */
  { kind: 'trio', open: true, labels: ['Streaming', 'Thinking, live', 'Why this answer'] },
  { kind: 'rail', labels: ['A formatted answer'] },
  { kind: 'duet', labels: ['Streaming into a code block', 'Stopped inside a code block'] },
  { kind: 'trio', open: true, labels: ['Stopped early', 'Failed', 'Declined'] },
  { kind: 'rail', labels: ['Multiplayer — two people, one thread'] },
]
const threadFixture = (label: string): Fixture => {
  const f = THREAD_FIXTURES.find((x) => x.label === label)
  if (!f) throw new Error(`Thread layout names a fixture that does not exist: ${label}`)
  return f
}
{
  const placed = THREAD_LAYOUT.flatMap((g) => g.labels)
  const all = THREAD_FIXTURES.map((f) => f.label)
  if (placed.length !== all.length || new Set(placed).size !== placed.length || all.some((l) => !placed.includes(l)))
    throw new Error('Thread layout must place every fixture exactly once')
}

/* The single-player state matrix. */
const CORE_FIXTURES: readonly Fixture[] = [
  {
    label: 'Empty',
    note: 'Nothing to send yet, so the arrow waits. No nagging text — an empty box explains itself.',
    events: ([]),
  },
  {
    label: 'Composing',
    note: 'Something to send: the arrow is ready.',
    events: ([type('Summarise the attached documents and list anything unresolved.')]),
  },
  {
    label: 'Attachment uploading',
    note: 'A file is still uploading, so sending waits — and says so, up top.',
    events: ([type('What changed between these two?'), add('a1', 'quarterly-summary.pdf'), settle('a1', 'ready'), add('a2', 'site-photograph.jpg', 'image')]),
  },
  {
    label: 'Attachment variety',
    note: 'Icons show the kind of file, and the ending (.pdf, .mp4) never gets cut off, because the ending is what tells you the format.',
    events: ([
      type('Compare these.'),
      add('v1', 'site-visit-recordings-2026-08-final-selects-building-a.mp4'), settle('v1', 'ready'),
      add('v2', 'budget-projections-fy27.xlsx'), settle('v2', 'ready'),
      add('v3', 'design-notes.md'), settle('v3', 'ready'),
      add('v4', 'archive-of-previous-revisions.zip'), settle('v4', 'ready'),
    ]),
  },
  {
    label: 'Attachment failed',
    note: 'This file didn’t upload. Try again (↻) or remove it (×) — it is never dropped silently. The strip above says what to do; the chip says which file and why.',
    events: ([type('What changed between these two?'), add('a1', 'quarterly-summary.pdf'), settle('a1', 'ready'), add('a2', 'recording.mp4'), settle('a2', 'failed', 'Too large')]),
  },
  {
    label: 'Service down',
    note: 'Nothing can send right now, and it says so. Your draft stays in the box. (A merely slow service never blocks you.)',
    events: ([type('Is anything getting through?'), { type: 'service/changed', status: 'down', message: 'We can’t reach the AI service right now. Your draft is safe here in the composer.' }]),
  },
  {
    label: 'Streaming — Send becomes Stop',
    note: 'While it writes, Send becomes Stop — hover Stop for what it does. The field stays open for the next thought.',
    events: ([{ type: 'composer/locked', by: 'you' }]),
    streaming: true,
  },
]

/*
 * The multiplayer matrix, staged apart ON PURPOSE. A Lucet thread is
 * single-writer and shared: when anyone submits, the composer locks for
 * everyone until the response settles. Most AI tools have no idea another
 * person could be in the room, which is exactly why these states carry a
 * FACE and copy that names the shared thread -- the context has to be
 * unmistakable to someone arriving from a single-player world.
 */
const SCOPE_LADDER = [
  { id: 'page', label: 'This page', name: 'Quarterly planning', summary: 'Quarterly planning — the plan and its 4 linked notes', itemCount: 5 },
  { id: 'section', label: 'Plans', summary: 'Everything filed under Plans', itemCount: 12 },
  { id: 'all', label: 'All of Aquilo', summary: 'Every plan, report and directory in Aquilo', itemCount: 48 },
]

const SCOPE_FIXTURES: readonly Fixture[] = [
  {
    label: 'Scoped to this page',
    note: 'The host installed its ladder; the control shows the rung and, opened, what every rung actually holds — the trust half.',
    events: [{ type: 'scope/configured' as const, levels: SCOPE_LADDER, selectedId: 'page' }],
  },
  {
    label: 'Scope updated after navigation',
    note: 'The person navigated to a different page; the scope followed it and says so until they act on scope again.',
    events: [
      { type: 'scope/configured' as const, levels: SCOPE_LADDER, selectedId: 'page' },
      {
        type: 'scope/moved' as const,
        levels: SCOPE_LADDER.map((l) =>
          l.id === 'page' ? { ...l, name: 'Reports review', summary: 'Reports review — the summary and its 2 appendices', itemCount: 3 } : l,
        ),
        selectedId: 'page',
        note: 'Scope updated to Reports review.',
        pageName: 'Reports review',
      },
    ],
  },
  {
    label: 'Scope held behind a draft',
    note: 'The page changed while words were already in the field. The move is held and the control asks which page the words are for — Keep Quarterly planning, or Use Vendor call — with keeping the drafted context as the primary way. With nothing typed it would simply have followed.',
    events: [
      { type: 'scope/configured' as const, levels: SCOPE_LADDER, selectedId: 'page' },
      { type: 'composer/changed' as const, text: 'Summarise what changed in the review for the vendor.' },
      {
        type: 'scope/moved' as const,
        levels: SCOPE_LADDER.map((l) =>
          l.id === 'page' ? { ...l, name: 'Vendor call', summary: 'Vendor call — the notes and the quote', itemCount: 2 } : l,
        ),
        selectedId: 'page',
        note: 'Scope updated to Vendor call.',
        pageName: 'Vendor call',
      },
    ],
  },
  {
    label: 'Scope kept on the previous page',
    note: 'The person kept Quarterly planning while the page beneath became Vendor call. The chip and the picker name the kept page; "This page" is offered as the first row and means the page on screen, and nothing else.',
    events: [
      { type: 'scope/configured' as const, levels: SCOPE_LADDER, selectedId: 'page' },
      { type: 'composer/changed' as const, text: 'Summarise what changed in the review for the vendor.' },
      {
        type: 'scope/moved' as const,
        levels: SCOPE_LADDER.map((l) =>
          l.id === 'page' ? { ...l, name: 'Vendor call', summary: 'Vendor call — the notes and the quote', itemCount: 2 } : l,
        ),
        selectedId: 'page',
        note: 'Scope updated to Vendor call.',
        pageName: 'Vendor call',
      },
      { type: 'scope/updateDeclined' as const },
    ],
  },
]

const BUDGET_FIXTURES: readonly Fixture[] = [
  {
    label: 'Priced — the trigger is the projection',
    note: 'The picker grew into the meter: the next turn’s ≈price sits on the trigger, and every model row reprices in place. Open it for the ledger — thread, then month.',
    events: [
      {
        type: 'usage/changed' as const,
        patch: { monthlyBudgetUsd: 10, monthlySpentUsd: 6.24, threadTokens: 4_200, contextTokens: 4_200, threadCostUsd: 0.05 },
      },
    ],
  },
  {
    label: 'Running low — the warning arrives with an exit',
    note: 'What remains no longer covers the next turn on the selected model, and the trigger changes silhouette, not just colour. The note names the model that still fits — already a priced row in the same panel, one click away.',
    events: [
      {
        type: 'usage/changed' as const,
        patch: { monthlyBudgetUsd: 10, monthlySpentUsd: 9.91, threadTokens: 48_400, contextTokens: 48_400, threadCostUsd: 0.52 },
      },
    ],
  },
  {
    label: 'Spent — a wall with words',
    note: 'The month ran out mid-conversation, the way months do. The composer stops and says why. Nothing failed, so the strip wears caution, not danger — and the crossing turn itself was allowed to finish.',
    events: [
      {
        type: 'usage/changed' as const,
        patch: { monthlyBudgetUsd: 10, monthlySpentUsd: 10.02, threadTokens: 32_600, contextTokens: 32_600, threadCostUsd: 0.95 },
      },
    ],
  },
]

const MULTI_FIXTURES: readonly Fixture[] = [
  {
    label: 'Locked — another person’s turn',
    note: 'Ada pressed send, so the thread is hers until her answer finishes. You can keep typing — Queue lines yours up to go next.',
    events: ([type('And what about the appendix?'), { type: 'composer/locked', by: 'Ada' }]),
  },
  {
    label: 'Queued behind her turn',
    note: 'Yours is lodged and the field is yours again for whatever comes next. It sends itself the moment her answer finishes — a promise the runtime keeps, not just copy.',
    events: ([{ type: 'composer/locked', by: 'Ada' }, { type: 'composer/queued', text: 'And what about the appendix?' }]),
  },
]

function Section({
  name,
  note,
  variant,
  children,
}: {
  name: string
  note: string
  /** 'hero' floats its content directly on the page — no stage well.
      'kin' follows a section of the same component family at the
      related-group interval instead of the major one. */
  variant?: 'hero' | 'kin'
  children: React.ReactNode
}) {
  return (
    <section className={variant ? `sec sec--${variant}` : 'sec'}>
      <header className="sec__head">
        <h3 className="sec__name">{name}</h3>
        <span className="sec__note">{note}</span>
      </header>
      {children}
    </section>
  )
}

/** One live composer on a real store, mock runtime and all. */
function Live() {
  /* Seeded from the SAME moment the Konfabulator opens on (opener.ts),
     CROPPED to the one representative sequence: prompt, tool receipt,
     cited answer, composer — one composition, not a second application
     shell. The prior exchange belongs to the Konfabulator, where
     mid-thread honesty is the point; here it was dead air above the
     specimen. The link under the specimen points at the whole. */
  const lucet = useMemo(() => {
    const instance = createLucet({ threadId: 'stage_live' })
    for (const e of OPENER_EVENTS) {
      if (JSON.stringify(e).includes('_prev')) continue
      instance.store.dispatch(e)
    }
    return instance
  }, [])
  const [state, setState] = useState(lucet.getState())
  const [attachCount, setAttachCount] = useState(0)
  useEffect(() => lucet.subscribe(() => setState(lucet.getState())), [lucet])

  return (
    <div className="demo-flow">
      <Thread
        state={state}
        selfId="you"
        onRetry={(turnId) => void lucet.retry(turnId)}
        onRecover={(turnId) => void lucet.recover(turnId)}
        onFeedback={(messageId, verdict) =>
          lucet.store.dispatch({ type: 'feedback/given', messageId, verdict })
        }
      />
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
        setTimeout(() => lucet.store.dispatch({ type: 'attachment/settled', id, status: 'ready', reason: null }), 1200)
      }}
      onAttach={() => {
        // The host owns file IO; the stage fakes one honestly. Every third
        // attachment fails, so the failure path stays one click away. The
        // names are Northbound's, not placeholders — content is part of
        // the specimen.
        const n = attachCount + 1
        setAttachCount(n)
        const id = `live_${n}`
        const files = [
          { name: 'carrier-onboarding-checklist.pdf', fileKind: 'document' as const },
          { name: 'booth-floorplan-hall-b.png', fileKind: 'image' as const },
          { name: 'report-template-v2.docx', fileKind: 'document' as const },
          { name: 'q3-carrier-shortlist.xlsx', fileKind: 'document' as const },
        ]
        const f = files[(n - 1) % files.length]!
        lucet.store.dispatch({ type: 'attachment/added', id, name: f.name, fileKind: f.fileKind, sizeBytes: 240_000 })
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
  )
}

export function ComponentsStage() {
  /* The stored appearance wins. The docs site is a host, and hosts choose
     accents; booting with Violet selected is the demonstration, not an
     exception — the library's own default stays monochrome. (Ruled
     2026-09-01; monochrome remains one click away for judging components
     without accent seduction.) */
  const [appearance, setAppearance] = useAppearance({ theme: 'dark', accent: 'violet' })
  const groundRef = useRef<HTMLDivElement | null>(null)
  useCanvasGround(groundRef, appearance)

  return (
    /* The lab rides the axis whole: its stage wells are part of the
       specimen presentation. (The Konfabulator pins its chrome instead —
       see App.tsx.) */
    <div ref={groundRef} className="prim prim--comp" data-expression={appearance.expression}>
      <SiteHeader page="components" />

      <main className="prim__main">
        {/* Viewing controls live with the stage they change, not in the
            site header — same law as the Konfabulator's stage bar. */}
        <div className="prim__controls">
            <AppearancePrefs state={appearance} onChange={setAppearance} />
        </div>
        <h1 className="prim__title">Components</h1>
        <p className="prim__lede">
          The components, in every state each one can be in — composed from
          the primitives, built by replaying real events through the real
          reducer. Each specimen is a state, not a picture of one — the
          working surface beside the primitives.
        </p>

        <Chapter name="Live system" note="The application on the mock runtime, and the receipt that reports what a tool did." />

        <Section variant="hero" name="The app, live" note="try it — type, attach, send, watch it answer">
          <div className="hero-wrap">
            <div className="hero-app">
              <Live />
            </div>
            <p className="spec__note">
              One exchange, replayed through the real reducer: the receipt
              with its duration, the cited answer, the sources aging beneath
              it — and the composer is live. Type into it; the runtime
              answers.
            </p>
          </div>
          <p className="hero-app__more">
            <a href="/">The complete application, every state on its rail — the Konfabulator</a>
          </p>
        </Section>

        <Section
          name="Tool calls — the receipt lifecycle"
          note="running, partly returned, failed — the receipt tells the truth at every stage"
        >
          {/* OPEN PLANE (audit round 03): the three receipts differ in height by 103px, and the well showed it as a void. */}
          <div className="stage stage--trio stage--open">
            {TOOL_FIXTURES.map((f) => (
              <Example key={f.label} label={f.label} note={f.note} code={codeFor(f, USAGE_THREAD)}>
                <Thread state={stateOf(f)} selfId="you" onRetry={noop} onRecover={noop} onFeedback={noop} />
              </Example>
            ))}
          </div>
        </Section>

        <Chapter name="Compose" note="What a person sends, and what the field knows before they send it: scope, price, whose turn it is." />

        <Section name="Prompt input — every state" note="side by side, nothing hidden behind a pointer">
          {/* OPEN PLANE (audit round 03): seven states in a two-column grid leave an orphan cell; on the open plane the empty half is just the page. */}
          <div className="stage stage--duet stage--open">
            {CORE_FIXTURES.map((f) => (
              <Example key={f.label} label={f.label} note={f.note} code={codeFor(f, USAGE_PROMPT)} max={560}>
                  <PromptInput
                    composer={stateOf(f).composer}
                    model={stateOf(f).model}
                    service={stateOf(f).service}
                    scope={stateOf(f).scope}
                    onScopeChange={noop}
                    onScopeUpdate={noop}
                    onScopeRebind={noop}
                    selfId="you"
                    onChange={noop}
                    onSubmit={noop}
                    onQueue={noop}
                    onModelChange={noop}
                    onRemoveAttachment={noop}
                    onRetryAttachment={noop}
                    onAttach={noop}
                    {...(f.streaming ? { streaming: true, onStop: noop } : {})}
                  />
              </Example>
            ))}
          </div>
        </Section>

        <Section variant="kin" name="Scope control — the breadcrumb is the ladder" note="wrong answers are usually wrong context, not a wrong model">
          <div className="stage stage--duet stage--open">
            {SCOPE_FIXTURES.map((f) => (
              <Example key={f.label} label={f.label} note={f.note} code={codeFor(f, USAGE_PROMPT)} max={560}>
                  <PromptInput
                    composer={stateOf(f).composer}
                    model={stateOf(f).model}
                    service={stateOf(f).service}
                    scope={stateOf(f).scope}
                    onScopeChange={noop}
                    onScopeUpdate={noop}
                    onScopeRebind={noop}
                    selfId="you"
                    onChange={noop}
                    onSubmit={noop}
                    onQueue={noop}
                    onModelChange={noop}
                    onRemoveAttachment={noop}
                    onRetryAttachment={noop}
                    onAttach={noop}
                  />
              </Example>
            ))}
          </div>
        </Section>

        <Section
          variant="kin"
          name="Budget meter — the price before you spend it"
          note="the projected price of the next turn, on every model, before you commit — and the month it lands in"
        >
          {/* OPEN PLANE (audit round 03): three states in a two-column grid leave an orphan cell; the well showed the empty half as a void. */}
          <div className="stage stage--duet stage--open">
            {BUDGET_FIXTURES.map((f, i) => (
              <Example key={f.label} label={f.label} note={f.note} code={codeFor(f, USAGE_PROMPT)} max={560} {...(i === 2 ? { variant: 'band' as const } : {})}>
                  <PromptInput
                    composer={stateOf(f).composer}
                    model={stateOf(f).model}
                    service={stateOf(f).service}
                    usage={stateOf(f).usage}
                    selfId="you"
                    onChange={noop}
                    onSubmit={noop}
                    onQueue={noop}
                    onModelChange={noop}
                    onRemoveAttachment={noop}
                    onRetryAttachment={noop}
                    onAttach={noop}
                  />
              </Example>
            ))}
          </div>
        </Section>

        <Section
          variant="kin"
          name="Prompt input — multiplayer"
          note="one thread, several people, one turn at a time"
        >
          <div className="stage stage--duet stage--open">
            {MULTI_FIXTURES.map((f) => (
              <Example key={f.label} label={f.label} note={f.note} code={codeFor(f, USAGE_PROMPT)} max={560}>
                  <PromptInput
                    composer={stateOf(f).composer}
                    model={stateOf(f).model}
                    service={stateOf(f).service}
                    scope={stateOf(f).scope}
                    onScopeChange={noop}
                    onScopeUpdate={noop}
                    onScopeRebind={noop}
                    selfId="you"
                    onChange={noop}
                    onSubmit={noop}
                    onQueue={noop}
                    onModelChange={noop}
                    onRemoveAttachment={noop}
                    onRetryAttachment={noop}
                    onAttach={noop}
                  />
              </Example>
            ))}
          </div>
        </Section>

        <Section name="Suggestion chips — the cold start" note="prompts made visible: what you click is what sends, verbatim">
          {/* OPEN PLANE (audit round 03): the shared well showed an empty lower-right quadrant beside the inset; each example is sized to its content on the page. */}
          <div className="stage stage--duet stage--open">
            <div className="spec spec--wide">
              <span className="spec__label">Ways in</span>
              <div className="spec__demo spec__demo--fit" style={{ '--demo-max': '460px' } as React.CSSProperties}>
                <SuggestionChips
                  suggestions={[
                    { id: 's1', prompt: 'Summarise the three documents I shared.', kind: 'ask' },
                    { id: 's3', prompt: 'Which of these two plans is more likely to slip?', kind: 'ask' },
                    { id: 's2', prompt: 'Turn my notes into a short plan.', kind: 'do', effect: 'Creates a page in Plans', durationHint: '~2 min' },
                    { id: 's4', prompt: 'Check the three sources I flagged.', kind: 'do', effect: 'Reads 3 flagged sources', durationHint: '~1 min' },
                  ]}
                  onPick={noop}
                />
              </div>
              <p className="spec__note">
                The chip is the prompt — one field in the contract, so what it says is what sends.
                They show on an empty, idle thread and leave the moment the conversation exists.
              </p>
            </div>
            {/* A compact INSET beside the dominant example (audit round 02):
                top-aligned, sized to its two disabled suggestions, the
                explanation 12px beneath — the height follows the content
                and disabled rows are never stretched to fill a cell. Round
                03 opened the duet and capped the inset at 22rem. */}
            <div className="spec spec--wide spec--inset">
              <span className="spec__label">Locked — another person’s turn</span>
              <div className="spec__demo spec__demo--fit" style={{ '--demo-max': '22rem' } as React.CSSProperties}>
                <SuggestionChips
                  suggestions={[
                    { id: 's1', prompt: 'Summarise the three documents I shared.' },
                    { id: 's2', prompt: 'Turn my notes into a short plan.' },
                  ]}
                  onPick={noop}
                  disabled
                />
              </div>
              <p className="spec__note">
                The single-writer lock reaches the chips too: while it is someone else’s turn,
                a way in that would fail is not offered as live.
              </p>
            </div>
          </div>
        </Section>

        <Chapter name="Respond and recover" note="What comes back, how it can end, where it came from, and how to return to an earlier turn." />

        <Section name="Thread — every ending" note="a response is never simply loading or done">
          {THREAD_LAYOUT.map((group) => (
            <div key={group.labels.join('|')} className={`stage stage--${group.kind}${group.open ? ' stage--open' : ''}`}>
              {group.labels.map(threadFixture).map((f) => (
                <Example key={f.label} label={f.label} note={f.note} code={codeFor(f, USAGE_THREAD)}>
                  <Thread state={stateOf(f)} selfId="you" onRetry={noop} onRecover={noop} onFeedback={noop} />
                </Example>
              ))}
            </div>
          ))}
        </Section>

        <Section name="Citations & sources" note="a citation is a claim with a timestamp — sources age after settle">
          <div className="stage stage--trio">
            {SOURCES_FIXTURES.map((f) => (
              <Example key={f.label} label={f.label} note={f.note} code={codeFor(f, USAGE_THREAD)}>
                <Thread state={stateOf(f)} selfId="you" onRetry={noop} onRecover={noop} onFeedback={noop} />
              </Example>
            ))}
          </div>
        </Section>

        <Section name="Version marker + restore" note="the thread is the version history, and it speaks in words">
          <div className="stage stage--duet stage--open">
            {/* The restore handlers are wired (audit round 04) so the lab
                shows the flow's controls — Preview version on the older
                version, the banner's Return to latest and Restore version
                pair — the way every other fixture shows its actions. */}
            {VERSIONS_FIXTURES.map((f) => (
              <Example key={f.label} label={f.label} note={f.note} code={codeFor(f, USAGE_THREAD)}>
                <Thread
                  state={stateOf(f)}
                  selfId="you"
                  onRetry={noop}
                  onRecover={noop}
                  onFeedback={noop}
                  onRestore={noop}
                  onExitRestore={noop}
                  onRestoreCommit={noop}
                />
              </Example>
            ))}
          </div>
        </Section>
      </main>
    </div>
  )
}
