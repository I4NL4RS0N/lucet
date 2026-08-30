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

/* The state matrix, one fixture per row. */
const FIXTURES: readonly { label: string; note: string; state: ThreadState; streaming?: boolean }[] = [
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
    label: 'Attachment failed',
    note: 'The failure lives on the chip, with its reason. Sending is blocked until it is removed — never silently dropped.',
    state: play([type('What changed between these two?'), add('a1', 'quarterly-summary.pdf'), settle('a1', 'ready'), add('a2', 'recording.mp4'), settle('a2', 'failed', 'Too large')]),
  },
  {
    label: 'Locked — someone’s turn',
    note: 'The field stays writable and Send becomes QUEUE. Locked is not dead.',
    state: play([type('And what about the appendix?'), { type: 'composer/locked', by: 'Ada' }]),
  },
  {
    label: 'Queued',
    note: 'A settled fact, not a spinner: it sends the moment the turn frees.',
    state: play([{ type: 'composer/locked', by: 'Ada' }, { type: 'composer/queued', text: 'And what about the appendix?' }, type('And what about the appendix?')]),
  },
  {
    label: 'Service down',
    note: 'Down blocks with words. Degraded deliberately does not block at all.',
    state: play([type('Is anything getting through?'), { type: 'service/changed', status: 'down', message: 'outage' }]),
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
            {FIXTURES.map((f) => (
              <div className="spec" key={f.label} style={{ inlineSize: '100%' }}>
                <span className="spec__label">{f.label}</span>
                <div style={{ inlineSize: '100%', maxInlineSize: 560 }}>
                  <PromptInput
                    composer={f.state.composer}
                    model={f.state.model}
                    service={f.state.service}
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

        <Section n="03" name="Prompt input — streaming" note="send becomes stop; the lock holds the thread">
          <div className="stage">
            <div style={{ inlineSize: '100%', maxInlineSize: 560 }}>
              <PromptInput
                composer={play([{ type: 'composer/locked', by: 'you' }]).composer}
                model={play([]).model}
                service={play([]).service}
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
