import { useEffect, useRef, useState } from 'react'
import { announcementPlan } from 'lucet'
import type { Message, MessagePart, ThreadState } from 'lucet'
import { ActivityOrb } from './ActivityOrb.js'
import { Avatar } from './Avatar.js'
import { Markdown } from './Markdown.js'
import { MessageActions } from './MessageActions.js'
import { Reasoning } from './Reasoning.js'
import { Sources } from './Sources.js'
import { StateIcon } from './StateIcon.js'
import { ToolCall } from './ToolCall.js'

/**
 * The thread: turns, rendered from the contract.
 *
 * The positions this encodes:
 *
 * 1. THE RESPONSE IS A DOCUMENT, NOT A BUBBLE. The assistant's output is the
 *    artefact the whole interface exists to produce, so it reads at full
 *    measure with no container. The PROMPT keeps a surface: it is an
 *    utterance, something you said, and you need to find it again while
 *    scrolling.
 * 2. PEOPLE HAVE FACES; THE MACHINE HAS OUTPUT. The group-chat grammar:
 *    your own turns sit right with no avatar (you know who you are), other
 *    people's turns sit left with a PROMINENT avatar -- multiplayer is the
 *    differentiator, so the humans get the faces. The assistant gets no
 *    avatar and no header at all: the document is its presence, which is the
 *    no-bubble position taken to its conclusion.
 * 3. A RESPONSE IS NEVER SIMPLY "LOADING" OR "DONE". Streaming shows the
 *    caret on the live edge; interrupted, failed, and refused each end the
 *    message with words that say what happened and what survives.
 * 4. WHAT YOU SENT STAYS VISIBLE. Attachment parts render as read-only chips
 *    on the prompt -- the composer's chips, minus the verbs.
 *
 * Reasoning and tool parts render through their own components (Reasoning,
 * ToolCall); the thread only decides where they sit and when they are live.
 */

export interface ThreadProps {
  /** Walk the view back to this commit (restore/entered). Offered on
      settled, non-latest turns while not already viewing the past. */
  onRestore?: ((turnId: string) => void) | undefined
  /** Return to latest (restore/exited); the banner's one way forward. */
  onExitRestore?: (() => void) | undefined
  state: ThreadState
  /** Matched against message authorIds; your own turns are labelled You. */
  selfId?: string | undefined
  /** Ask again with the same words: a new turn that knows its ancestor. */
  onRetry?: ((turnId: string) => void) | undefined
  /** Record or retract a verdict on a response. */
  onFeedback?: ((messageId: string, verdict: 'up' | 'down' | null) => void) | undefined
}

const TERMINAL: Record<string, { icon: 'interrupted' | 'failed' | 'refused'; word: string }> = {
  interrupted: { icon: 'interrupted', word: 'Stopped early' },
  failed: { icon: 'failed', word: 'Failed' },
  refused: { icon: 'refused', word: 'Declined' },
}

function Part({
  part,
  streaming,
  last,
  doc,
}: {
  part: MessagePart
  streaming: boolean
  last: boolean
  doc: boolean
}) {
  switch (part.kind) {
    case 'text':
      /*
       * The assistant's text is a DOCUMENT and renders as one: markdown,
       * through the core's streaming-safe parser. The prompt stays verbatim
       * plain text on purpose — it is a quotation of what you typed, and
       * dressing it up would misquote you.
       */
      return doc ? (
        <Markdown text={part.text} streaming={streaming} caret={streaming && last} />
      ) : (
        <p className="lucet-thread__text">
          {part.text}
          {streaming && last ? <span className="lucet-thread__caret" aria-hidden /> : null}
        </p>
      )
    case 'reasoning':
      /* Live only while it is the newest thing in the message: the moment
         the answer starts, the thinking row settles into a plain fact. */
      return <Reasoning text={part.text} streaming={streaming && last} />
    case 'tool':
      return (
        <ToolCall
          name={part.name}
          status={part.status}
          detail={part.detail}
          args={part.args}
          result={part.result}
        />
      )
    case 'sources':
      return <Sources sources={part.sources} />
    case 'attachment':
      return (
        <span className="lucet-att lucet-att--readonly">
          <svg className="lucet-att__icon" viewBox="0 0 24 24" aria-hidden>
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5" />
          </svg>
          <span className="lucet-att__name">{part.name}</span>
        </span>
      )
  }
}

function MessageView({
  message,
  self,
  shared,
  actions,
}: {
  message: Message
  self: boolean
  /** More than one human has spoken: the collaborative grammar applies
      to EVERYONE — face, name, left — you included. Solo threads keep
      the messaging grammar, where position says yours. */
  shared?: boolean
  actions?: React.ReactNode
}) {
  const isUser = message.role === 'user'
  const terminal = TERMINAL[message.status]
  const attachments = message.parts.filter((p) => p.kind === 'attachment')
  const rest = message.parts.filter((p) => p.kind !== 'attachment')
  /* The LAST part is where content is arriving, so it is where liveness
     lives: the caret if it is text, the thinking orb if it is reasoning.
     Everything before it has already settled into history. */
  const lastPartId = rest[rest.length - 1]?.id

  /* A VALUE, not a nested component. Rendered as <PromptBody /> this was
     a fresh component type every render, so React remounted the whole
     prompt/doc subtree on every streamed chunk — replaying the arrival
     animation on turns that had long since arrived, and rebuilding their
     DOM for nothing. */
  const promptBody = (
    <div className={isUser ? 'lucet-thread__prompt' : 'lucet-thread__doc'}>
      {rest.map((part) => (
        <Part
          key={part.id}
          part={part}
          streaming={message.status === 'streaming'}
          last={part.id === lastPartId}
          doc={!isUser}
        />
      ))}
      {attachments.length > 0 ? (
        <div className="lucet-thread__atts">
          {attachments.map((part) => (
            <Part key={part.id} part={part} streaming={false} last={false} doc={false} />
          ))}
        </div>
      ) : null}
      {message.status === 'streaming' && rest.length === 0 ? (
        <ActivityOrb state="composing" label="Writing…" size="sm" />
      ) : null}
    </div>
  )

  return (
    <div className="lucet-thread__turn" data-role={message.role} data-self={self || undefined}>
      {/*
       * Heads only where they inform. Your own turns carry no head at all --
       * position says it. Other PEOPLE get the prominent avatar and their
       * name: the faces belong to the humans. The assistant gets a
       * visually-hidden label for screen readers and nothing else; its
       * document is its presence. (The version marker left with the heads;
       * it returns with the Version Marker + Restore pattern, where a
       * restore affordance gives it meaning beyond jargon.)
       */}
      {!isUser ? <span className="lucet-visually-hidden">Assistant</span> : null}

      {isUser && (!self || shared) ? (
        /* Another person's turn: the face sits OUTSIDE the bubble,
           bottom-aligned to it — meeting the bubble's anchored tail
           corner, so the corner and the face point at each other. The
           name rides above the bubble in the same column. */
        <div className="lucet-thread__withface">
          <Avatar name={message.authorId} />
          <div className="lucet-thread__spoke">
            <span className="lucet-thread__author">{message.authorId}</span>
            {promptBody}
          </div>
        </div>
      ) : (
        promptBody
      )}
      {terminal ? (
        <p className="lucet-thread__ended" data-status={message.status} role="status">
          <StateIcon name={terminal.icon} />
          <span>
            <strong>{terminal.word}.</strong> {message.reason ?? ''}
          </span>
        </p>
      ) : null}
      {actions}
    </div>
  )
}

/**
 * What a screen reader hears while the answer streams. The visible document
 * is NOT a live region — mirroring raw chunks announces word fragments, and
 * mirroring markdown announces its syntax. Instead this hidden log receives
 * the core's announcement UNITS: finished sentences, structure described
 * rather than spelled ("Code, ts, 8 lines"). The plan's prefix invariant
 * (see packages/core/src/announce.ts) is what lets this be a counter and a
 * slice, with no timers: units only ever append.
 */
function ResponseAnnouncer({ state }: { state: ThreadState }) {
  const [units, setUnits] = useState<readonly string[]>([])
  const seen = useRef({ messageId: '', count: 0 })

  useEffect(() => {
    const response = state.turns[state.turns.length - 1]?.response
    if (!response) {
      if (state.turns.length === 0 && seen.current.messageId !== '') {
        seen.current = { messageId: '', count: 0 }
        setUnits([])
      }
      return
    }
    const settled = response.status !== 'streaming' && response.status !== 'pending'
    const textParts = response.parts.filter((p) => p.kind === 'text')
    const plan = textParts.flatMap((part, i) =>
      announcementPlan(part.text, settled || i < textParts.length - 1),
    )
    if (response.id !== seen.current.messageId) {
      /*
       * A response that was ALREADY settled when we first saw it is history,
       * not news: announcing its whole backlog on mount would read a page of
       * old answers at whoever loads the thread. Start the counter at the
       * end and say nothing. (Joining mid-stream announces from the top --
       * you just arrived; the recent context is the point.)
       */
      seen.current = { messageId: response.id, count: settled ? plan.length : 0 }
      setUnits([])
    }
    if (plan.length > seen.current.count) {
      const fresh = plan.slice(seen.current.count)
      seen.current.count = plan.length
      setUnits((prev) => [...prev, ...fresh])
    }
  }, [state])

  return (
    <div className="lucet-visually-hidden" role="log" aria-label="The response, as it arrives">
      {units.map((unit, i) => (
        <p key={i}>{unit}</p>
      ))}
    </div>
  )
}

export function Thread({ state, selfId, onRetry, onFeedback, onRestore, onExitRestore }: ThreadProps) {
  const last = state.turns[state.turns.length - 1]
  /* Version arithmetic: a turn is SUPERSEDED when a later commit retries
     it. Markers appear only where history is non-linear — a plain thread
     stays plain. */
  const supersededBy = new Map<string, number>()
  state.turns.forEach((t, i) => {
    if (t.retryOf) supersededBy.set(t.retryOf, i)
  })
  const restoredIndex = state.restoredFrom
    ? state.turns.findIndex((t) => t.id === state.restoredFrom)
    : -1
  /* Shared the moment a second human speaks — derived from the turns,
     never a flag a host could forget to set. */
  const shared = new Set(state.turns.map((t) => t.prompt.authorId)).size > 1
  const setAside = state.turns.length - 1 - restoredIndex
  return (
    /*
     * The visible thread is a named region for FINDING; the hidden announcer
     * below is the live log for HEARING. They are deliberately not the same
     * element: a live region over the visible document would announce every
     * raw chunk and every piece of markdown syntax, which is the streaming
     * mess this component exists to clean up.
     */
    <section className="lucet-thread" aria-label="Conversation" data-shared={shared || undefined}>
      {state.turns.map((turn) => {
        const response = turn.response
        /* Actions appear once a response has SETTLED — there is nothing to
           copy, judge, or retry about a stream still arriving. The
           latest/older visibility law is CSS on the pair. */
        const settled =
          response !== null && response.status !== 'streaming' && response.status !== 'pending'
        const index = state.turns.indexOf(turn)
        const superseded = supersededBy.has(turn.id)
        const aside = restoredIndex >= 0 && index > restoredIndex
        return (
          <article
            className="lucet-thread__pair"
            key={turn.id}
            data-latest={turn.id === last?.id || undefined}
            data-aside={aside || undefined}
            /* Set-aside turns leave the page for EVERYONE while the view
               is restored: inert removes them from pointer and tab order,
               aria-hidden from the accessibility tree — the eyes and the
               reader agree about what "as of v1" means. */
            ref={(el) => {
              if (el) el.inert = aside
            }}
            aria-hidden={aside || undefined}
          >
            {superseded || turn.retryOf ? (
              <div className="lucet-thread__vrow" data-superseded={superseded || undefined}>
                <code className="lucet-thread__version">v{index + 1}</code>
                <span>
                  {superseded
                    ? `superseded by v${(supersededBy.get(turn.id) ?? 0) + 1}`
                    : 'same words, new commit'}
                </span>
              </div>
            ) : null}
            <MessageView
              message={turn.prompt}
              self={turn.prompt.authorId === (selfId ?? null)}
              shared={shared}
            />
            {response ? (
              <MessageView
                message={response}
                self={false}
                actions={
                  settled ? (
                    <MessageActions
                      message={response}
                      onRetry={onRetry ? () => onRetry(turn.id) : undefined}
                      onFeedback={
                        onFeedback ? (verdict) => onFeedback(response.id, verdict) : undefined
                      }
                      onRestore={
                        onRestore && turn.id !== last?.id && restoredIndex < 0
                          ? () => onRestore(turn.id)
                          : undefined
                      }
                    />
                  ) : null
                }
              />
            ) : null}
            {restoredIndex === index ? (
              /* The seam where history diverges: the banner sits right
                 after the commit being viewed, counts what it set aside,
                 and offers the one way forward. role=status announces the
                 mode change without stealing focus. */
              <div className="lucet-thread__restored" role="status">
                <svg className="lucet-thread__restored-glyph" viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 8v4l2.6 1.6M20.5 12a8.5 8.5 0 1 1-2.5-6M20.5 3.5V6H18" />
                </svg>
                <span>
                  Viewing the thread as of <code className="lucet-thread__version">v{index + 1}</code>
                  {' — '}
                  {setAside} later {setAside === 1 ? 'turn' : 'turns'} set aside.
                </span>
                {onExitRestore ? (
                  <button type="button" className="lucet-thread__return" onClick={onExitRestore}>
                    Return to latest
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        )
      })}
      <ResponseAnnouncer state={state} />
    </section>
  )
}
