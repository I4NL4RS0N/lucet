/**
 * Pure reads over the state contract. Framework-free, like everything here.
 *
 * The first selector exists because "why can't I send this" is one of the
 * questions AI interfaces answer worst. A send button that merely greys out
 * teaches nothing; this returns the REASON, one at a time, most actionable
 * first, and the component renders it as words.
 */

import type { BudgetIntercept, ModelOption, SubmitBlocker, ThreadState, UsageState } from './types.js'

/** The slice the blocker logic actually reads, so components holding only
    composer + service can call it without inventing a whole thread. */
export type SubmitBlockerInput = Pick<ThreadState, 'composer' | 'service'> & {
  /** Present when the thread is being viewed as a restored state. */
  restoredFrom?: string | null | undefined
  /** Present when the host tracks a monthly budget; omitting it never blocks. */
  usage?: Pick<UsageState, 'monthlyBudgetUsd' | 'monthlySpentUsd'> | undefined
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
  /* A wall, not a warning: the warning lived in the meter while there was
     still something to decide. By the time the budget is spent the only
     honest state is a stopped composer that says why. */
  if (
    state.usage &&
    state.usage.monthlyBudgetUsd !== null &&
    state.usage.monthlySpentUsd >= state.usage.monthlyBudgetUsd
  )
    return 'budget'
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
      return 'Previewing an earlier version — return to latest to continue'
    case 'locked':
      return 'A response is being written — yours will send next'
    case 'service-down':
      return 'Can’t reach the service right now'
    case 'budget':
      return 'This month’s budget is spent — new turns are paused until it resets'
    case 'attachment-uploading':
      return 'Uploading your attachment…'
    case 'attachment-failed':
      return 'An attachment didn’t upload — try again or remove it'
    case 'empty':
      return 'Write something or attach a file'
  }
}

/**
 * THE PRICE BEFORE YOU SPEND IT. Plenty of tools tell you what a turn cost;
 * none price the next one. This is the projection the Budget Meter renders
 * beside the model picker, and it is DERIVED — never stored — so it cannot
 * go stale against the state it is computed from.
 *
 * The estimate is honest about being one: the context window re-sends with
 * every turn (which is why long threads cost more per turn — budget and
 * memory are different meters, but they are coupled here and the meter
 * teaches the coupling), plus the draft, plus a flat allowance for the
 * host's instructions and a typical reply. Every figure this produces
 * should render behind an ≈.
 */
export interface TurnProjection {
  readonly model: ModelOption
  readonly tokens: number
  readonly costUsd: number
}

const PROMPT_OVERHEAD_TOKENS = 900
const REPLY_ALLOWANCE_TOKENS = 600
const CHARS_PER_TOKEN = 4

export type ProjectionInput = Pick<ThreadState, 'model'> & {
  usage: Pick<UsageState, 'contextTokens'>
  composer: Pick<ThreadState['composer'], 'text'>
}

export function projectNextTurn(
  state: ProjectionInput,
  modelId?: string,
): TurnProjection | null {
  const id = modelId ?? state.model.selectedId
  const model = state.model.options.find((option) => option.id === id)
  if (!model || model.usdPerMTok === null) return null
  const tokens =
    PROMPT_OVERHEAD_TOKENS +
    state.usage.contextTokens +
    Math.ceil(state.composer.text.length / CHARS_PER_TOKEN) +
    REPLY_ALLOWANCE_TOKENS
  const costUsd = Number(((tokens / 1_000_000) * model.usdPerMTok).toFixed(4))
  return { model, tokens, costUsd }
}

/**
 * THE HOLD, DERIVED (round 06): the send that would cost more than the month
 * has left, priced. Null when the month is spent (that is a wall, not a
 * decision — see submitBlocker), when the host has no budget, when the model
 * has no price, or when the turn fits. The meter's caution and the runtime's
 * hold read this one function, so they can never disagree.
 */
export type BudgetHoldInput = Omit<ProjectionInput, 'usage'> & {
  usage: Pick<UsageState, 'contextTokens' | 'monthlyBudgetUsd' | 'monthlySpentUsd'>
}

export function budgetHold(state: BudgetHoldInput): BudgetIntercept | null {
  if (state.usage.monthlyBudgetUsd === null) return null
  const remainingUsd = Number((state.usage.monthlyBudgetUsd - state.usage.monthlySpentUsd).toFixed(4))
  if (remainingUsd <= 0) return null
  const projection = projectNextTurn(state)
  if (projection === null || projection.costUsd <= remainingUsd) return null
  return { text: state.composer.text, costUsd: projection.costUsd, remainingUsd }
}
