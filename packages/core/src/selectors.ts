/**
 * Pure reads over the state contract. Framework-free, like everything here.
 *
 * The first selector exists because "why can't I send this" is one of the
 * questions AI interfaces answer worst. A send button that merely greys out
 * teaches nothing; this returns the REASON, one at a time, most actionable
 * first, and the component renders it as words.
 */

import type { SubmitBlocker, ThreadState } from './types.js'

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
export function submitBlocker(state: ThreadState): SubmitBlocker | null {
  const { composer, service } = state
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
export function describeSubmitBlocker(blocker: SubmitBlocker): string {
  switch (blocker) {
    case 'locked':
      return 'A response is in progress — your prompt will queue'
    case 'service-down':
      return 'The service is unreachable right now'
    case 'attachment-uploading':
      return 'Waiting for an attachment to finish uploading'
    case 'attachment-failed':
      return 'An attachment failed — remove it to send'
    case 'empty':
      return 'Write something or attach a file'
  }
}
