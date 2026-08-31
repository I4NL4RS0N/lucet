/**
 * A scenario is a script.
 *
 * The docs site runs against this instead of a live model, which is the only way
 * to force a refusal, a partial tool failure, or a provider outage on demand and
 * get the same result every time. States also have to chain, so a scenario is a
 * flat list of steps rather than a single canned response.
 */

import type { ServiceStatus, ToolStatus } from '../types.js'

export type Step =
  /** Dead air. Latency is a designed state, not an accident. */
  | { type: 'wait'; ms: number }
  /** Stream visible text, chunk by chunk. */
  | { type: 'say'; text: string; chunkMs?: number }
  /** Stream reasoning into a disclosure, not the response body. */
  | { type: 'think'; text: string; chunkMs?: number }
  | {
      type: 'tool'
      name: string
      ms: number
      outcome: Extract<ToolStatus, 'succeeded' | 'failed' | 'partial'>
      detail: string
      /** The raw exchange, when the scenario models a host that shares it. */
      args?: string
      result?: string
    }
  /** Attach the response's bibliography, all sources arriving `ok`. */
  | {
      type: 'sources'
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
  | { type: 'sourceChange'; sourceId: string; status: 'stale' | 'gone'; note: string }
  /** Resubmit this scenario's own prompt: same words, NEW commit, with a
      fresh (usually better) response. The version-history demo. */
  | { type: 'retryTurn'; say: string; chunkMs?: number }
  /** Enter the restored view at this scenario's first commit. */
  | { type: 'restore' }
  /** Install the scope ladder, as the host would. */
  | {
      type: 'scope'
      levels: readonly { id: string; label: string; summary: string; itemCount: number }[]
      selectedId: string | null
    }
  /** The page moves underneath — new ladder, selection follows, note
      says so. Allowed after settle: navigation does not wait. */
  | {
      type: 'scopeMoved'
      levels: readonly { id: string; label: string; summary: string; itemCount: number }[]
      selectedId: string | null
      note: string
    }
  | { type: 'refuse'; reason: string }
  | { type: 'fail'; reason: string }
  | { type: 'interrupt'; reason: string }
  | { type: 'usage'; tokens: number; costUsd: number }
  /** Seed or move the monthly ledger — the account's month, not the thread's tally. */
  | { type: 'budget'; budgetUsd: number; spentUsd: number }
  | { type: 'service'; status: ServiceStatus; message: string | null }
  | { type: 'complete' }

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
  readonly steps: readonly Step[]
}

export function defineScenario(scenario: Scenario): Scenario {
  return scenario
}
