import { useEffect, useMemo, useState } from 'react'
import { createInitialState, createLucet, reduce } from 'lucet'
import type { LucetEvent, ThreadState } from 'lucet'
import { PromptInput } from 'lucet-react'

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

/* The single-player state matrix. */
const CORE_FIXTURES: readonly Fixture[] = [
  {
    label: 'Empty',
    note: 'Send is quiet and disabled. An empty composer explains itself, so no words.',
    state: play([]),
  },
  {
    label: 'Composing',
    note: 'Text present, nothing blocking.',
    state: play([type('Summarise the attached documents and list anything unresolved.')]),
  },
  {
    label: 'Attachment uploading',
    note: 'Uploading is a state. Send waits, and says so.',
    state: play([type('What changed between these two?'), add('a1', 'quarterly-summary.pdf'), settle('a1', 'ready'), add('a2', 'site-photograph.jpg', 'image')]),
  },
  {
    label: 'Attachment variety',
    note: 'Icons are by CATEGORY (a silhouette that survives 13px); the extension carries the exact format, which is why truncation keeps it — a chip reading "quarterl….pdf" beats "quarterly-rep…".',
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
    note: 'The failure lives on the chip, with its reason. Sending is blocked until it is removed — never silently dropped.',
    state: play([type('What changed between these two?'), add('a1', 'quarterly-summary.pdf'), settle('a1', 'ready'), add('a2', 'recording.mp4'), settle('a2', 'failed', 'Too large')]),
  },
  {
    label: 'Service down',
    note: 'Down blocks with words. Degraded deliberately does not block at all.',
    state: play([type('Is anything getting through?'), { type: 'service/changed', status: 'down', message: 'The model provider is having an outage. Nothing you have written is lost.' }]),
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
    note: 'Ada submitted; the thread is single-writer, so the composer closes for everyone. Her avatar makes the multiplayer explicit — and the field stays writable, because locked is not dead: Send becomes QUEUE.',
    state: play([type('And what about the appendix?'), { type: 'composer/locked', by: 'Ada' }]),
  },
  {
    label: 'Queued behind her turn',
    note: 'A settled fact, not a spinner: your prompt sends the moment her response finishes.',
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
          Composites, staged the way the primitives were: every state, built by
          replaying real events through the real reducer. Private page.
        </p>

        <Section n="01" name="Prompt input" note="live, on the bare page — the surface it actually ships on">
          <div style={{ maxInlineSize: 620, paddingBlock: 8 }}>
            <Live />
          </div>
        </Section>

        <Section n="02" name="Prompt input — every state" note="fixtures replayed through the reducer">
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
          note="a Lucet thread is shared and single-writer; most AI tools cannot say that sentence"
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
                    onAttach={noop}
                  />
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)', maxInlineSize: '56ch' }}>{f.note}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section n="04" name="Prompt input — streaming" note="your own turn: send becomes stop; the lock holds the thread">
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
