import { useEffect, useRef } from 'react'
import { useLucet, useThread, Message, StateNotice, Button } from 'lucet-react'

/**
 * The conversation, assembled from the library's own components.
 *
 * Deliberately thin. If the docs site needed its own version of Message, the
 * library's Message would be wrong.
 */
export function Conversation() {
  const lucet = useLucet()
  const thread = useThread()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [thread.turns.length, thread.status])

  const service =
    thread.service.status !== 'operational' && !thread.service.dismissed ? (
      <StateNotice
        state={thread.service.status === 'down' ? 'down' : 'degraded'}
        label={thread.service.status === 'down' ? 'Service unavailable.' : 'Running slow.'}
        onDismiss={() => lucet.store.dispatch({ type: 'service/dismissed' })}
      >
        {thread.service.message}
      </StateNotice>
    ) : null

  return (
    <div>
      {service}
      {thread.turns.length === 0 ? (
        <p className="sheet__note">Nothing here yet. Fire a state from the rail, or send a prompt.</p>
      ) : null}

      {thread.turns.map((turn) => (
        <div key={turn.id}>
          <Message
            message={turn.prompt}
            version={turn.versionId}
            actions={
              <>
                <Button variant="ghost">Restore</Button>
                <Button variant="ghost">Copy</Button>
              </>
            }
          />
          {turn.response ? <Message message={turn.response} /> : null}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}
