import type { ReactNode } from 'react'
import { StateIcon } from './StateIcon'
import type { IconName } from './StateIcon'

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
  | 'operational'
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

/**
 * Status-page vocabulary, borrowed on purpose: green operational, yellow
 * degraded, red down, blue scheduled. People already read it correctly, so
 * adopting it is free comprehension.
 *
 * Green stops here and does not enter the thread. On a status page "everything
 * is fine" is what you came to check; in a conversation the answer is already
 * the success signal, and a green chip on every response trains people to stop
 * reading chips.
 */
const ICON: Record<NoticeState, IconName> = {
  operational: 'operational',
  refused: 'refused',
  interrupted: 'interrupted',
  partial: 'partial',
  degraded: 'degraded',
  down: 'down',
  failed: 'failed',
  'rate-limited': 'rate-limited',
  stale: 'stale',
  uncertain: 'uncertain',
  queued: 'scheduled',
}

export interface StateNoticeProps {
  state: NoticeState
  /** A tone apart from the state's own (round 05): the fallback model is a
   * degraded condition told as information, so it wears info on the
   * degraded glyph. Absent, the state's tone stands. */
  tone?: 'info' | 'caution' | 'danger' | 'neutral' | undefined
  /** Short, sentence case, no trailing period unless there are two sentences. */
  label: string
  children?: ReactNode
  /** Rendered at the end. A notice with no way forward is just bad news. */
  action?: ReactNode
  onDismiss?: (() => void) | undefined
}

export function StateNotice({ state, tone, label, children, action, onDismiss }: StateNoticeProps) {
  return (
    <div className="lucet-notice" data-state={state} data-tone={tone} role="status">
      <StateIcon name={ICON[state]} />
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
