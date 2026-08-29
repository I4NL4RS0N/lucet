import { useId } from 'react'
import type { ReactNode } from 'react'

/**
 * Prompt input.
 *
 * The lock is designed in rather than bolted on, because being locked out is a
 * normal state in a shared thread and the disabled-and-silent version of it
 * feels broken. When locked, the field stays editable and the SEND is what
 * disables, so you can write your next prompt while someone else's runs.
 *
 * The toolbar sits below the field, not above it: the model picker and
 * attachments are decisions you make about the prompt you have just written.
 */

export interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  /** Someone else holds the turn. Their name, not a boolean, so we can say who. */
  lockedBy?: string | null
  streaming?: boolean
  onStop?: (() => void) | undefined
  /** Model picker, attachments, and anything else the host adds. */
  toolbar?: ReactNode
  placeholder?: string
}

export function Composer({
  value,
  onChange,
  onSubmit,
  lockedBy = null,
  streaming = false,
  onStop,
  toolbar,
  placeholder = 'Ask something',
}: ComposerProps) {
  const id = useId()
  const locked = lockedBy !== null

  return (
    <form
      className="lucet-composer"
      data-locked={locked || undefined}
      onSubmit={(event) => {
        event.preventDefault()
        if (!locked && value.trim()) onSubmit()
      }}
    >
      {locked ? (
        <p className="lucet-composer__lock" role="status">
          Waiting on {lockedBy}. You can write your next prompt now.
        </p>
      ) : null}

      <label className="lucet-visually-hidden" htmlFor={id}>
        Prompt
      </label>
      <textarea
        id={id}
        className="lucet-composer__field"
        rows={2}
        value={value}
        placeholder={locked ? 'Queued until the response finishes' : placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            if (!locked && value.trim()) onSubmit()
          }
        }}
      />

      <div className="lucet-composer__bar">
        <div className="lucet-composer__tools">{toolbar}</div>
        {streaming ? (
          <button type="button" className="lucet-button" data-variant="secondary" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="lucet-button"
            data-variant="primary"
            disabled={locked || !value.trim()}
          >
            Send
          </button>
        )}
      </div>
    </form>
  )
}
