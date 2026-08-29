import { useState } from 'react'
import { useLucet, useThread } from 'lucet-react'

/**
 * Prompt input, with the turn lock wired from the start.
 *
 * Being locked out feels dead unless you can see whose turn it is and can still
 * write the thing you want to send next. The queue affordance is not a nicety.
 */
export function Composer() {
  const lucet = useLucet()
  const thread = useThread()
  const [text, setText] = useState('')
  const locked = thread.composer.locked
  const streaming = thread.status === 'streaming'

  function submit() {
    const value = text.trim()
    if (!value) return
    setText('')
    void lucet.submit(value)
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {locked ? (
        <p role="status">
          Waiting on {thread.composer.lockedBy}. You can write your next prompt now.
        </p>
      ) : null}

      <label htmlFor="composer">Prompt</label>
      <textarea
        id="composer"
        rows={3}
        value={text}
        placeholder={locked ? 'Queued until the response finishes' : 'Ask something'}
        onChange={(event) => setText(event.target.value)}
      />

      <button type="submit" disabled={locked}>
        Send
      </button>
      {streaming ? (
        <button type="button" onClick={() => lucet.abort()}>
          Stop
        </button>
      ) : null}
    </form>
  )
}
