/**
 * Pure reads over the state contract. Framework-free, like everything here.
 *
 * The first selector exists because "why can't I send this" is one of the
 * questions AI interfaces answer worst. A send button that merely greys out
 * teaches nothing; this returns the REASON, one at a time, most actionable
 * first, and the component renders it as words.
 */

import type { SubmitBlocker, ThreadState } from './types.js'

/** The slice the blocker logic actually reads, so components holding only
    composer + service can call it without inventing a whole thread. */
export type SubmitBlockerInput = Pick<ThreadState, 'composer' | 'service'> & {
  /** Present when the thread is being viewed as a restored state. */
  restoredFrom?: string | null | undefined
}

/**
 * Why the composer cannot submit right now, or null when it can.
 *
 * Precedence is by actionability, not severity:
 *
 *   locked                someone's turn is in flight; yours queues
 *   service-down          nothing will get through; degraded still submits
 *   attachment-uploading  wait, it is nearly yours to send
 *   attachment-failed     remove it or it blocks -- submitting around a failed
 *                         attachment silently sends less than the person
 *                         thinks they sent, which is worse than waiting
 *   empty                 nothing to send; attachments alone are enough
 */
export function submitBlocker(state: SubmitBlockerInput): SubmitBlocker | null {
  const { composer, service } = state
  /* Above even the lock: you are looking at the PAST, and the past does
     not take new commits. Return to latest first. */
  if (state.restoredFrom) return 'restored'
  if (composer.locked) return 'locked'
  if (service.status === 'down') return 'service-down'
  if (composer.attachments.some((a) => a.status === 'uploading')) return 'attachment-uploading'
  if (composer.attachments.some((a) => a.status === 'failed')) return 'attachment-failed'
  const hasText = composer.text.trim().length > 0
  const hasReady = composer.attachments.some((a) => a.status === 'ready')
  if (!hasText && !hasReady) return 'empty'
  return null
}

/**
 * Default copy for each blocker, in the same voice as describeEvent: plain,
 * present tense, says what happens next. Components may override; most
 * libraries never write these strings at all, which is why their send buttons
 * go grey without explanation.
 */
/**
 * When the conversation starters show: an empty, idle thread — the cold
 * start. The moment anything exists (a turn arriving, a scenario running)
 * they leave; suggestions are a way IN, not furniture. Follow-up chips
 * after a response are the Action Surface's territory, not this rule's.
 */
export function suggestionsVisible(
  state: Pick<ThreadState, 'suggestions' | 'turns' | 'status'>,
): boolean {
  return state.suggestions.length > 0 && state.turns.length === 0 && state.status === 'idle'
}

export function describeSubmitBlocker(blocker: SubmitBlocker): string {
  switch (blocker) {
    case 'restored':
      return 'Viewing a restored state — return to latest to continue'
    case 'locked':
      return 'A response is being written — yours will send next'
    case 'service-down':
      return 'Can’t reach the service right now'
    case 'attachment-uploading':
      return 'Uploading your attachment…'
    case 'attachment-failed':
      return 'An attachment didn’t upload — try again or remove it'
    case 'empty':
      return 'Write something or attach a file'
  }
}
