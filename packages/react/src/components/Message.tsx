import type { ReactNode } from 'react'
import type { Message as MessageType } from 'lucet'
import { Reasoning } from './Reasoning'
import { ToolCall } from './ToolCall'
import { StateNotice } from './StateNotice'
import type { NoticeState } from './StateNotice'

/**
 * Message and thread.
 *
 * THE DECISION THAT SHAPES EVERYTHING ELSE: the assistant does not get a bubble.
 *
 * A bubble frames output as chat. But the assistant's output is the artefact,
 * the thing being made and read, and once you accept that, a lot follows: it
 * gets the full measure, it reads as a document, and the prompt that produced it
 * is the smaller element on the page. The user's prompt keeps a surface, because
 * it IS an utterance and needs to be findable when you scroll back.
 *
 * This is also the versioning thesis made visual. If the thread is the version
 * history, each turn is a commit, and a commit is not a speech bubble.
 */

const TERMINAL: Partial<Record<MessageType['status'], NoticeState>> = {
  refused: 'refused',
  interrupted: 'interrupted',
  failed: 'failed',
}

const TERMINAL_LABEL: Partial<Record<MessageType['status'], string>> = {
  refused: 'Declined.',
  interrupted: 'Stopped.',
  failed: 'Failed.',
}

export interface MessageProps {
  message: MessageType
  /** Shown beside a prompt. The version marker: every prompt is a commit. */
  version?: string | undefined
  /** Restore affordance, rendered on the turn rather than in a side panel. */
  actions?: ReactNode
}

export function Message({ message, version, actions }: MessageProps) {
  const isUser = message.role === 'user'
  const state = TERMINAL[message.status]

  return (
    <article className="lucet-message" data-role={message.role} data-status={message.status}>
      {isUser ? (
        <header className="lucet-message__head">
          <span className="lucet-message__author">{message.authorId}</span>
          {version ? <code className="lucet-message__version">{version}</code> : null}
        </header>
      ) : null}

      <div className="lucet-message__body">
        {message.parts.map((part) => {
          if (part.kind === 'reasoning') {
            return (
              <Reasoning
                key={part.id}
                text={part.text}
                streaming={message.status === 'streaming'}
              />
            )
          }
          if (part.kind === 'tool') {
            return (
              <ToolCall
                key={part.id}
                name={part.name}
                status={part.status}
                detail={part.detail}
              />
            )
          }
          /* Attachment parts are the NEW thread component's job; this
             old-era renderer retires at the Configurator rebuild and its
             scenarios never produce them. */
          if (part.kind === 'attachment') return null
          if (part.kind === 'sources') return null
          return (
            <p key={part.id} className="lucet-message__text">
              {part.text}
              {/* The caret marks the live edge of the stream. It is on the text
                  itself, not floating below, so the eye tracks one thing. */}
              {message.status === 'streaming' ? (
                <span className="lucet-caret" aria-hidden="true" />
              ) : null}
            </p>
          )
        })}

        {state ? (
          <StateNotice state={state} label={TERMINAL_LABEL[message.status] ?? ''}>
            {message.reason}
          </StateNotice>
        ) : null}
      </div>

      {actions ? <footer className="lucet-message__actions">{actions}</footer> : null}
    </article>
  )
}
