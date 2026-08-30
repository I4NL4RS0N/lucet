import type { Message, MessagePart, ThreadState } from 'lucet'
import { ActivityOrb } from './ActivityOrb.js'
import { Avatar } from './Avatar.js'
import { StateIcon } from './StateIcon.js'

/**
 * The thread: turns, rendered from the contract. New-era counterpart to the
 * old Message/Sheet pair, which retires at the Configurator rebuild.
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
 * Reasoning and tool parts render as quiet single rows here; each is its own
 * baseline component later and will take over that rendering.
 */

export interface ThreadProps {
  state: ThreadState
  /** Matched against message authorIds; your own turns are labelled You. */
  selfId?: string | undefined
}

const TERMINAL: Record<string, { icon: 'interrupted' | 'failed' | 'refused'; word: string }> = {
  interrupted: { icon: 'interrupted', word: 'Stopped early' },
  failed: { icon: 'failed', word: 'Failed' },
  refused: { icon: 'refused', word: 'Declined' },
}

function Part({ part, streaming, last }: { part: MessagePart; streaming: boolean; last: boolean }) {
  switch (part.kind) {
    case 'text':
      return (
        <p className="lucet-thread__text">
          {part.text}
          {streaming && last ? <span className="lucet-thread__caret" aria-hidden /> : null}
        </p>
      )
    case 'reasoning':
      return (
        <div className="lucet-thread__aside">
          <span className="lucet-thread__aside-caret" aria-hidden />
          <span>Thought about it</span>
          <span className="lucet-thread__aside-meta">{part.text.length > 0 ? 'expand' : ''}</span>
        </div>
      )
    case 'tool':
      return (
        <div className="lucet-thread__aside" data-status={part.status}>
          {part.status === 'running' || part.status === 'pending' ? (
            <ActivityOrb state="searching" label={part.name} size="sm" />
          ) : (
            <>
              <StateIcon name={part.status === 'succeeded' ? 'operational' : part.status === 'partial' ? 'degraded' : 'failed'} />
              <span>{part.name}</span>
            </>
          )}
          {part.detail ? <span className="lucet-thread__aside-meta">{part.detail}</span> : null}
        </div>
      )
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

function MessageView({ message, self }: { message: Message; self: boolean }) {
  const isUser = message.role === 'user'
  const terminal = TERMINAL[message.status]
  const attachments = message.parts.filter((p) => p.kind === 'attachment')
  const rest = message.parts.filter((p) => p.kind !== 'attachment')
  const lastTextId = [...rest].reverse().find((p) => p.kind === 'text')?.id

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
      {isUser && !self ? (
        <div className="lucet-thread__head">
          <Avatar name={message.authorId} />
          <span className="lucet-thread__author">{message.authorId}</span>
        </div>
      ) : null}
      {!isUser ? <span className="lucet-visually-hidden">Assistant</span> : null}

      <div className={isUser ? 'lucet-thread__prompt' : 'lucet-thread__doc'}>
        {rest.map((part) => (
          <Part
            key={part.id}
            part={part}
            streaming={message.status === 'streaming'}
            last={part.id === lastTextId}
          />
        ))}
        {attachments.length > 0 ? (
          <div className="lucet-thread__atts">
            {attachments.map((part) => (
              <Part key={part.id} part={part} streaming={false} last={false} />
            ))}
          </div>
        ) : null}
        {message.status === 'streaming' && rest.length === 0 ? (
          <ActivityOrb state="composing" label="Writing…" size="sm" />
        ) : null}
      </div>

      {terminal ? (
        <p className="lucet-thread__ended" data-status={message.status} role="status">
          <StateIcon name={terminal.icon} />
          <span>
            <strong>{terminal.word}.</strong> {message.reason ?? ''}
          </span>
        </p>
      ) : null}
    </div>
  )
}

export function Thread({ state, selfId }: ThreadProps) {
  return (
    /*
     * role="log": streamed text must reach people who are not looking at it.
     * Additions announce politely; a real-world host may want to throttle
     * announcements per sentence rather than per chunk, which is noted in the
     * rationale doc as the streaming component's future concern.
     */
    <div className="lucet-thread" role="log" aria-label="Conversation">
      {state.turns.map((turn) => (
        <article className="lucet-thread__pair" key={turn.id}>
          <MessageView message={turn.prompt} self={turn.prompt.authorId === (selfId ?? null)} />
          {turn.response ? <MessageView message={turn.response} self={false} /> : null}
        </article>
      ))}
    </div>
  )
}
