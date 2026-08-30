import { useEffect, useMemo, useState } from 'react'
import { createInitialState, createLucet, reduce } from 'lucet'
import type { LucetEvent, ThreadState } from 'lucet'
import { PromptInput, Thread } from 'lucet-react'

/**
 * The components stage. Private, never deployed — the primitives page's
 * method applied to composites.
 *
 * Every specimen's state is built by REPLAYING EVENTS through the real
 * reducer, exactly as the runtime would produce them. Nothing here is a
 * drawing of a state; it is the state, which is the whole point of keeping
 * the logic in core.
 */

const ACCENTS = [
  'monochrome', 'slate', 'blue', 'indigo', 'violet', 'magenta',
  'rose', 'green', 'teal', 'cyan', 'amber',
] as const

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

type Fixture = { label: string; note: string; state: ThreadState; streaming?: boolean }

/* Build a full turn: prompt in, response streamed, settled however told. */
function turn(
  n: number,
  prompt: string,
  opts: {
    author?: string
    attachmentIds?: readonly string[]
    reply?: string
    tool?: { name: string; status: 'running' | 'succeeded' | 'failed' | 'partial'; detail?: string }
    reasoning?: boolean
    settle?: 'complete' | 'interrupted' | 'failed' | 'refused' | 'streaming'
    reason?: string
  } = {},
): LucetEvent[] {
  const t = `t${n}`, pm = `pm${n}`, rm = `rm${n}`
  const events: LucetEvent[] = [
    { type: 'turn/submitted', turnId: t, versionId: `v${n}`, messageId: pm, text: prompt, authorId: opts.author ?? 'you', attachmentIds: opts.attachmentIds ?? [] },
    { type: 'response/started', turnId: t, messageId: rm },
  ]
  if (opts.reasoning) events.push({ type: 'part/added', messageId: rm, part: { kind: 'reasoning', id: `${rm}_r`, text: 'thinking' } })
  if (opts.tool) events.push({ type: 'part/added', messageId: rm, part: { kind: 'tool', id: `${rm}_t`, name: opts.tool.name, status: opts.tool.status, detail: opts.tool.detail ?? null } })
  if (opts.reply !== undefined) {
    events.push({ type: 'part/added', messageId: rm, part: { kind: 'text', id: `${rm}_x`, text: '' } })
    events.push({ type: 'part/delta', messageId: rm, partId: `${rm}_x`, delta: opts.reply })
  }
  const settle = opts.settle ?? 'complete'
  if (settle !== 'streaming') {
    events.push({ type: 'response/settled', messageId: rm, status: settle, reason: opts.reason ?? null })
    events.push({ type: 'composer/unlocked' })
  }
  return events
}

const THREAD_FIXTURES: readonly Fixture[] = [
  {
    label: 'A finished turn, attachments and all',
    note: 'The prompt keeps a surface and shows what went with it; the answer is a document — no bubble, full measure.',
    state: play([
      add('f1', 'quarterly-summary.pdf'), settle('f1', 'ready'),
      ...turn(1, 'What changed between these two revisions?', {
        attachmentIds: ['f1'],
        tool: { name: 'Searched the document', status: 'succeeded', detail: '12 passages' },
        reply: 'Only the schedule moved. The review step now runs after approval, and anything filed before Tuesday follows the previous order.',
      }),
    ]),
  },
  {
    label: 'Streaming',
    note: 'The caret rides the live edge of the text — the eye tracks one thing.',
    state: play(
      turn(1, 'Summarise the meeting notes.', {
        reply: 'Three decisions were made. The first covers the',
        settle: 'streaming',
      }),
    ),
  },
  {
    label: 'Stopped early',
    note: 'What arrived stays, and the ending says so plainly.',
    state: play(
      turn(1, 'List every open question.', {
        reply: 'There are four. The first two concern the budget',
        settle: 'interrupted',
        reason: 'Stopped by you. What arrived is kept.',
      }),
    ),
  },
  {
    label: 'Failed',
    note: 'A failure is an ending with words, never a spinner that never resolves.',
    state: play(
      turn(1, 'Compare the proposals.', {
        settle: 'failed',
        reason: 'The service dropped the connection. Nothing was charged.',
      }),
    ),
  },
  {
    label: 'Declined',
    note: 'A refusal is not an error, so it does not wear red. It says why, calmly.',
    state: play(
      turn(1, 'Write it in her voice exactly.', {
        settle: 'refused',
        reason: 'That would imitate a real person. Happy to draft it in a neutral voice instead.',
      }),
    ),
  },
  {
    label: 'Multiplayer — two people, one thread',
    note: 'Turns are author-labelled, not aligned by self: alignment stops meaning anything with three people in the room.',
    state: play([
      ...turn(1, 'Pull the numbers for the northern site.', { author: 'Ada', reply: 'Done — the totals are in the table above, and the outlier is flagged.' }),
      ...turn(2, 'And the same for the southern one?', { author: 'you', reply: 'Same shape, one difference: the southern site peaks a month later.' }),
    ]),
  },
]

/* The single-player state matrix. */
const CORE_FIXTURES: readonly Fixture[] = [
  {
    label: 'Empty',
    note: 'Nothing to send yet, so the arrow waits. No nagging text — an empty box explains itself.',
    state: play([]),
  },
  {
    label: 'Composing',
    note: 'Something to send: the arrow is ready.',
    state: play([type('Summarise the attached documents and list anything unresolved.')]),
  },
  {
    label: 'Attachment uploading',
    note: 'A file is still uploading, so sending waits — and says so, up top.',
    state: play([type('What changed between these two?'), add('a1', 'quarterly-summary.pdf'), settle('a1', 'ready'), add('a2', 'site-photograph.jpg', 'image')]),
  },
  {
    label: 'Attachment variety',
    note: 'Icons show the kind of file, and the ending (.pdf, .mp4) never gets cut off, because the ending is what tells you the format.',
    state: play([
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
    state: play([type('What changed between these two?'), add('a1', 'quarterly-summary.pdf'), settle('a1', 'ready'), add('a2', 'recording.mp4'), settle('a2', 'failed', 'Too large')]),
  },
  {
    label: 'Service down',
    note: 'Nothing can send right now, and it says so. Your draft stays in the box. (A merely slow service never blocks you.)',
    state: play([type('Is anything getting through?'), { type: 'service/changed', status: 'down', message: 'We can’t reach the AI service right now. Your draft is safe here in the composer.' }]),
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
const MULTI_FIXTURES: readonly Fixture[] = [
  {
    label: 'Locked — another person’s turn',
    note: 'Ada pressed send, so the thread is hers until her answer finishes. You can keep typing — Queue lines yours up to go next.',
    state: play([type('And what about the appendix?'), { type: 'composer/locked', by: 'Ada' }]),
  },
  {
    label: 'Queued behind her turn',
    note: 'Yours is lined up. It sends itself the moment her answer finishes — nothing to watch, nothing to redo.',
    state: play([{ type: 'composer/locked', by: 'Ada' }, { type: 'composer/queued', text: 'And what about the appendix?' }, type('And what about the appendix?')]),
  },
]

function Section({ n, name, note, children }: { n: string; name: string; note: string; children: React.ReactNode }) {
  return (
    <section className="sec">
      <header className="sec__head">
        <span className="sec__n">{n}</span>
        <h2 className="sec__name">{name}</h2>
        <span className="sec__note">{note}</span>
      </header>
      {children}
    </section>
  )
}

/** One live composer on a real store, mock runtime and all. */
function Live() {
  const lucet = useMemo(() => createLucet({ threadId: 'stage_live' }), [])
  const [state, setState] = useState(lucet.getState())
  const [attachCount, setAttachCount] = useState(0)
  useEffect(() => lucet.subscribe(() => setState(lucet.getState())), [lucet])

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Thread state={state} selfId="you" />
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
        // attachment fails, so the failure path stays one click away.
        const n = attachCount + 1
        setAttachCount(n)
        const id = `live_${n}`
        lucet.store.dispatch({ type: 'attachment/added', id, name: `document-${n}.pdf`, fileKind: 'document', sizeBytes: 240_000 })
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
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [accent, setAccent] = useState('monochrome')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent)
  }, [accent])

  return (
    <div className="prim">
      <header className="prim__bar">
        <span className="prim__mark">
          Lucet <span>· components</span>
        </span>
        <div className="prim__bar-end">
          <label className="select" style={{ inlineSize: 128 }}>
            <select value={accent} onChange={(e) => setAccent(e.target.value)} aria-label="Accent">
              {ACCENTS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <div className="seg" role="group" aria-label="Theme">
            {(['dark', 'light'] as const).map((t) => (
              <label key={t}>
                <input type="radio" name="theme" checked={theme === t} onChange={() => setTheme(t)} />
                <span>{t}</span>
              </label>
            ))}
          </div>
        </div>
      </header>

      <main className="prim__main">
        <h1 className="prim__title">Components</h1>
        <p className="prim__lede">
          The prompt box, in every state it can be in. Each specimen is a real
          state, not a picture of one. Private page.
        </p>

        <Section n="01" name="The app, live" note="try it — type, attach, send, watch it answer">
          <div style={{ maxInlineSize: 620, paddingBlock: 8 }}>
            <Live />
          </div>
        </Section>

        <Section n="02" name="Prompt input — every state" note="side by side, nothing hidden behind a pointer">
          <div className="stage" style={{ display: 'grid', gap: 26 }}>
            {CORE_FIXTURES.map((f) => (
              <div className="spec" key={f.label} style={{ inlineSize: '100%' }}>
                <span className="spec__label">{f.label}</span>
                <div style={{ inlineSize: '100%', maxInlineSize: 560 }}>
                  <PromptInput
                    composer={f.state.composer}
                    model={f.state.model}
                    service={f.state.service}
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
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)', maxInlineSize: '56ch' }}>{f.note}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          n="03"
          name="Prompt input — multiplayer"
          note="one thread, several people, one turn at a time — most AI tools cannot do this"
        >
          <div className="stage" style={{ display: 'grid', gap: 26 }}>
            {MULTI_FIXTURES.map((f) => (
              <div className="spec" key={f.label} style={{ inlineSize: '100%' }}>
                <span className="spec__label">{f.label}</span>
                <div style={{ inlineSize: '100%', maxInlineSize: 560 }}>
                  <PromptInput
                    composer={f.state.composer}
                    model={f.state.model}
                    service={f.state.service}
                    selfId="you"
                    onChange={noop}
                    onSubmit={noop}
                    onQueue={noop}
                    onModelChange={noop}
                    onRemoveAttachment={noop}
                    onRetryAttachment={noop}
                    onAttach={noop}
                  />
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)', maxInlineSize: '56ch' }}>{f.note}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section n="04" name="Thread — every ending" note="a response is never simply loading or done">
          <div className="stage" style={{ display: 'grid', gap: 34 }}>
            {THREAD_FIXTURES.map((f) => (
              <div className="spec" key={f.label} style={{ inlineSize: '100%' }}>
                <span className="spec__label">{f.label}</span>
                <div style={{ inlineSize: '100%', maxInlineSize: 640 }}>
                  <Thread state={f.state} selfId="you" />
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)', maxInlineSize: '56ch' }}>{f.note}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section n="05" name="Prompt input — streaming" note="while it writes, Send becomes Stop — hover Stop for what it does">
          <div className="stage">
            <div style={{ inlineSize: '100%', maxInlineSize: 560 }}>
              <PromptInput
                composer={play([{ type: 'composer/locked', by: 'you' }]).composer}
                model={play([]).model}
                service={play([]).service}
                selfId="you"
                streaming
                onStop={noop}
                onChange={noop}
                onSubmit={noop}
                onModelChange={noop}
                onRemoveAttachment={noop}
              />
            </div>
          </div>
        </Section>
      </main>
    </div>
  )
}
