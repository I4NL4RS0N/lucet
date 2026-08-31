/**
 * A tiny event-sourced store. No dependencies, no framework, no magic.
 */

import type { Clock } from './clock.js'
import { systemClock } from './clock.js'
import type { LoggedEvent, LucetEvent } from './events.js'
import { createInitialState, reduce } from './reducer.js'
import type { ModelOption, Suggestion, ThreadState } from './types.js'

export type Listener = (state: ThreadState, event: LoggedEvent) => void

export interface Store {
  getState(): ThreadState
  /** Every transition, in order. The docs inspector renders this. */
  getLog(): readonly LoggedEvent[]
  dispatch(event: LucetEvent): void
  subscribe(listener: Listener): () => void
}

export interface StoreOptions {
  id: string
  clock?: Clock
  contextLimit?: number
  models?: readonly ModelOption[]
  suggestions?: readonly Suggestion[]
}

export function createStore(options: StoreOptions): Store {
  const clock = options.clock ?? systemClock
  let state = createInitialState(options.id, options.contextLimit, options.models, options.suggestions)
  const log: LoggedEvent[] = []
  const listeners = new Set<Listener>()
  let seq = 0

  return {
    getState: () => state,
    getLog: () => log,
    dispatch(event) {
      const at = clock.now()
      state = reduce(state, event, { now: at })
      const logged: LoggedEvent = { seq: seq++, at, event }
      log.push(logged)
      for (const listener of listeners) listener(state, logged)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
