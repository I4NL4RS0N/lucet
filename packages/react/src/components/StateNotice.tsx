import type { ReactNode } from 'react'

/**
 * The notice that carries an unhappy state.
 *
 * One component, ten states, because the difference between them is copy and
 * tone, not structure. Inventing a separate component per failure is how
 * libraries end up with a red box for everything.
 *
 * It is not an alert and does not shout. Refusals and interruptions are normal
 * events in a conversation, and a banner treatment would teach people that
 * something went wrong every time the assistant declined.
 */

export type NoticeState =
  | 'refused'
  | 'interrupted'
  | 'partial'
  | 'degraded'
  | 'down'
  | 'failed'
  | 'rate-limited'
  | 'stale'
  | 'uncertain'
  | 'queued'

export interface StateNoticeProps {
  state: NoticeState
  /** Short, sentence case, no trailing period unless there are two sentences. */
  label: string
  children?: ReactNode
  /** Rendered at the end. A notice with no way forward is just bad news. */
  action?: ReactNode
  onDismiss?: (() => void) | undefined
}

export function StateNotice({ state, label, children, action, onDismiss }: StateNoticeProps) {
  return (
    <div className="lucet-notice" data-state={state} role="status">
      <p className="lucet-notice__body">
        <strong className="lucet-notice__label">{label}</strong>
        {children ? <span className="lucet-notice__text">{children}</span> : null}
      </p>
      {action || onDismiss ? (
        <div className="lucet-notice__actions">
          {action}
          {onDismiss ? (
            <button type="button" className="lucet-button" data-variant="ghost" onClick={onDismiss}>
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
