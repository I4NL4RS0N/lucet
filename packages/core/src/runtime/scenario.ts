/**
 * A scenario is a script.
 *
 * The docs site runs against this instead of a live model, which is the only way
 * to force a refusal, a partial tool failure, or a provider outage on demand and
 * get the same result every time. States also have to chain, so a scenario is a
 * flat list of steps rather than a single canned response.
 */

import type { ServiceStatus, ToolStatus, NoticeAction, NoticeKind, NoticeTone, RecoveryIcon, SourceStatus } from '../types.js'

/** One tool's run, as a step or as a member of a staged group. */
export interface ToolWork {
  name: string
  ms: number
  outcome: Extract<ToolStatus, 'succeeded' | 'failed' | 'partial'>
  detail: string
  /** The raw exchange, when the scenario models a host that shares it. */
  args?: string
  result?: string
}

export type Step =
  /** Dead air. Latency is a designed state, not an accident. */
  | { type: 'wait'; ms: number }
  /** Stream visible text, chunk by chunk. */
  | { type: 'say'; text: string; chunkMs?: number }
  /** Stream reasoning into a disclosure, not the response body. */
  | { type: 'think'; text: string; chunkMs?: number }
  | ({ type: 'tool' } & ToolWork)
  /** A STAGED GROUP (round 06): every receipt enters pending at once, then
      each runs and settles in order. A frame frozen mid-run shows the work
      under way and what is still to come; no receipt enters complete. */
  | { type: 'tools'; items: readonly ToolWork[] }
  /** Attach the response's bibliography, all sources arriving `ok`. */
  | {
      type: 'sources'
      /** What the rows are; "Sources" when absent. */
      label?: string
      sources: readonly {
        id: string
        title: string
        location: string
        sourceKind: 'document' | 'web' | 'data'
        /** Locator in words ("Pages 4–6"); trace is the exact receipt. */
        detail?: string
        trace?: string
      }[]
    }
  /** Age one cited source after the fact — the states nobody designs. */
  /** A source's condition changes after settle — aged, removed, or (on a re-check) cleared. */
  | { type: 'sourceChange'; sourceId: string; status: SourceStatus; note: string | null }
  /** Resubmit this scenario's own prompt: same words, NEW commit, with a
      fresh (usually better) response. The version-history demo. */
  | { type: 'retryTurn'; say: string; chunkMs?: number }
  /** Enter the restored view at this scenario's first commit. */
  | { type: 'restore' }
  /** Install the scope ladder, as the host would. */
  | {
      type: 'scope'
      levels: readonly { id: string; label: string; summary: string; itemCount: number; name?: string }[]
      selectedId: string | null
    }
  /** The page changes under the scope — new ladder, selection follows, note
      says so; held behind a draft by the reducer's freeze rule. Allowed after
      settle: navigation does not wait. */
  | {
      type: 'scopeMoved'
      levels: readonly { id: string; label: string; summary: string; itemCount: number; name?: string }[]
      selectedId: string | null
      note: string
      /** The destination page's own name, for the decision's message. */
      pageName?: string
    }
  | { type: 'refuse'; reason: string }
  /** With retryAt (ms from now) the failure is a limit that lifts: the
   * ending shows the exact time and the recovery may schedule itself. */
  /** With a tone the ending departs from the failed status's red: a limit
   * that lifts is caution (round 05 P2). */
  | { type: 'fail'; reason: string; retryAt?: number; tone?: NoticeTone }
  /** Append to the LAST text part of the resumed response — a continuation
   * from where it stopped, not a new paragraph. Resume mode only. */
  | { type: 'continue'; text: string; chunkMs?: number }
  /** Replace a cited source, in place, with another. */
  | {
      type: 'sourceReplace'
      sourceId: string
      replacement: { id: string; title: string; location: string; sourceKind: 'document' | 'web' | 'data'; detail?: string; trace?: string }
    }
  | { type: 'interrupt'; reason: string }
  /** Without costUsd the runtime prices the tokens at the SELECTED model's
   * rate — so the model the person chose is the model that runs. */
  | { type: 'usage'; tokens: number; costUsd?: number }
  /** An inline notice in the response, before the answer (a fallback model, a limit). */
  | { type: 'notice'; state: NoticeKind; tone?: NoticeTone; label: string; text: string; action?: Omit<NoticeAction, 'turnId'> }
  /** The model the runtime is actually using; the composer's control agrees. */
  | { type: 'model'; modelId: string }
  /** Put words in the composer without sending them — the pre-send state. */
  | { type: 'draft'; text: string }
  /** Seed or move the monthly ledger — the account's month, not the thread's tally. */
  /** resetsInMs, when given, says when the month resets — the exact time the blocked composer shows. */
  | { type: 'budget'; budgetUsd: number; spentUsd: number; resetsInMs?: number }
  | { type: 'service'; status: ServiceStatus; message: string | null }
  | { type: 'complete' }

export interface Recovery {
  readonly verb?: { readonly label: string; readonly icon: RecoveryIcon }
  readonly mode: 'retry' | 'resume' | 'retry-at'
  readonly steps: readonly Step[]
}

export interface Scenario {
  readonly id: string
  readonly label: string
  /** Groups the trigger rail. Keeps the happy path away from the failures. */
  readonly group: string
  /**
   * The thesis has two halves and the rail shows both: STATES are the ways
   * a response can go (the coverage argument), FEATURES are the things
   * other libraries do not have at all (the differentiator argument).
   * Defaults to 'state'.
   */
  readonly kind?: 'state' | 'feature'
  /** Shown in the rail and in the docs. Say what this proves. */
  readonly description: string
  /** The prompt to put in the thread, if this scenario starts a turn. */
  readonly prompt: string | null
  /** Who submits the prompt. Defaults to the local participant — another
      name makes the turn arrive from someone else in the shared thread. */
  readonly author?: string
  /** Steps that run when the trigger fires, BEFORE any turn exists: the
   * world is set up (usage, a budget, a draft in the composer) and the
   * runtime stops there. `steps` then answer the person's own send, on
   * the model they chose. The decision happens before tokens are spent. */
  readonly preSend?: readonly Step[]
  /** Replay without frames: no streaming, no waits — the scenario lands
   * settled within one dispatch run. For triggers whose point is the
   * state they end in, not the arrival. */
  readonly instant?: boolean
  /** Firing again adds nothing: when the thread already holds this
   * scenario's turns, only a final `restore` step re-enters the preview. */
  readonly oncePerThread?: boolean
  readonly steps: readonly Step[]
  /**
   * What retrying this turn plays. A failure that tells the user "ask
   * again and I will retry" is making a promise, and the runtime keeps
   * it: Ask again on a turn born from this scenario runs these steps
   * (same prompt, new version) instead of the generic reply. Absent,
   * a retry gets the default.
   */
  /**
   * EVERY ENDING GETS ITS OWN EXIT (round 05, P1). The verb is offered on
   * the ending in the user's words and drawn with its own glyph; the mode
   * says how the runtime keeps it: 'retry' plays the steps as a new turn
   * of the same words, 'resume' continues this very response, 'retry-at'
   * schedules the retry for the failure's reset time. A recovery without a
   * verb is reached another way (the fallback's notice action).
   */
  readonly recovery?: Recovery
}

export function defineScenario(scenario: Scenario): Scenario {
  return scenario
}
