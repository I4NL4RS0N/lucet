import { useEffect, useRef } from 'react'
import { useLucet, useThread } from 'lucet-react'
import type { Message, MessagePart } from 'lucet'

function Part({ part }: { part: MessagePart }) {
  if (part.kind === 'reasoning') {
    return (
      <details>
        <summary>Thinking</summary>
        <p>{part.text}</p>
      </details>
    )
  }
  if (part.kind === 'tool') {
    return (
      <p>
        <code>{part.name}</code> <b>{part.status}</b>
        {part.detail ? ` — ${part.detail}` : null}
      </p>
    )
  }
  return <p>{part.text}</p>
}

/**
 * A response is not finished when the text stops. These are the states it can
 * actually end in, and each one needs different copy.
 */
function Outcome({ message }: { message: Message }) {
  if (message.status === 'streaming' || message.status === 'complete') return null
  const label =
    message.status === 'refused'
      ? 'Declined'
      : message.status === 'interrupted'
        ? 'Stopped'
        : 'Failed'
  return (
    <p role="status">
      <b>{label}.</b> {message.reason}
    </p>
  )
}

export function Conversation() {
  const lucet = useLucet()
  const thread = useThread()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [thread.turns.length, thread.status])

  const banner =
    thread.service.status !== 'operational' && !thread.service.dismissed ? (
      <p role="status">
        <b>{thread.service.status === 'down' ? 'Service unavailable.' : 'Running slow.'}</b>{' '}
        {thread.service.message}{' '}
        <button type="button" onClick={() => lucet.store.dispatch({ type: 'service/dismissed' })}>
          Dismiss
        </button>
      </p>
    ) : null

  if (thread.turns.length === 0) {
    return (
      <div>
        {banner}
        <p>Nothing here yet. Fire a state from the rail, or send a prompt.</p>
      </div>
    )
  }

  return (
    <div>
      {banner}
      <ol>
        {thread.turns.map((turn) => (
          <li key={turn.id}>
            <article aria-label={`Turn ${turn.index + 1}, prompt`}>
              <b>{turn.prompt.authorId}</b>
              {turn.prompt.parts.map((part) => (
                <Part key={part.id} part={part} />
              ))}
              {/* Every prompt is a commit. The marker is structural even before
                  the restore affordance is designed. */}
              <small>
                <code>{turn.versionId}</code>
              </small>
            </article>

            {turn.response ? (
              <article aria-label={`Turn ${turn.index + 1}, response`}>
                <b>assistant</b>
                {turn.response.parts.map((part) => (
                  <Part key={part.id} part={part} />
                ))}
                <Outcome message={turn.response} />
              </article>
            ) : null}
          </li>
        ))}
      </ol>
      <div ref={endRef} />
    </div>
  )
}
