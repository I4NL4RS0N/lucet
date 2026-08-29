/**
 * lucet
 *
 * Framework-free headless core. All state logic lives here: the state contract,
 * the event log, the reducer, and the scripted mock runtime the docs site runs
 * against. Zero framework imports, by rule.
 *
 * React (and any later Vue, Svelte, or web-component wrapper) is a thin binding
 * over this module.
 */

import { createIdFactory, systemClock, systemScheduler } from './clock.js'
import type { Clock, Scheduler } from './clock.js'
import type { LoggedEvent } from './events.js'
import { createStore } from './store.js'
import type { Listener, Store } from './store.js'
import { createMockRuntime } from './runtime/mock-runtime.js'
import { createTriggerRegistry } from './runtime/triggers.js'
import type { TriggerRegistry } from './runtime/triggers.js'
import type { Scenario } from './runtime/scenario.js'
import { builtInScenarios } from './scenarios/index.js'
import type { ThreadState } from './types.js'

export * from './types.js'
export * from './events.js'
export * from './clock.js'
export * from './store.js'
export * from './reducer.js'
export * from './runtime/scenario.js'
export * from './runtime/mock-runtime.js'
export * from './runtime/triggers.js'
export * from './scenarios/index.js'

export const VERSION = '0.0.0'

export interface LucetOptions {
  threadId?: string
  clock?: Clock
  scheduler?: Scheduler
  contextLimit?: number
  authorId?: string
  /** Replaces the built-in set. Pass [] for a registry you fill yourself. */
  scenarios?: readonly Scenario[]
}

export interface Lucet {
  readonly store: Store
  readonly triggers: TriggerRegistry
  getState(): ThreadState
  getLog(): readonly LoggedEvent[]
  subscribe(listener: Listener): () => void
  /** Send a prompt. With the mock runtime, this runs the default script. */
  submit(text: string): Promise<void>
  /** Force a named state, in context, without resetting the thread. */
  trigger(id: string): Promise<void>
  /** Stop the current response. What already arrived stays. */
  abort(): void
  reset(): void
}

const defaultReply: readonly Scenario['steps'][number][] = [
  { type: 'wait', ms: 350 },
  {
    type: 'say',
    text: 'This is the mock runtime. It is scripted on purpose, so every state in the rail can be forced instantly and reproduced exactly.',
  },
  { type: 'usage', tokens: 320, costUsd: 0.0048 },
  { type: 'complete' },
]

export function createLucet(options: LucetOptions = {}): Lucet {
  const nextId = createIdFactory()
  const store = createStore({
    id: options.threadId ?? 'thread_1',
    clock: options.clock ?? systemClock,
    ...(options.contextLimit === undefined ? {} : { contextLimit: options.contextLimit }),
  })
  const triggers = createTriggerRegistry(options.scenarios ?? builtInScenarios)
  const runtime = createMockRuntime({
    store,
    nextId,
    scheduler: options.scheduler ?? systemScheduler,
    ...(options.authorId === undefined ? {} : { authorId: options.authorId }),
  })

  let controller: AbortController | null = null

  async function run(scenario: Scenario): Promise<void> {
    controller?.abort()
    controller = new AbortController()
    try {
      await runtime.run(scenario, controller.signal)
    } finally {
      controller = null
    }
  }

  return {
    store,
    triggers,
    getState: () => store.getState(),
    getLog: () => store.getLog(),
    subscribe: (listener) => store.subscribe(listener),

    submit(text) {
      return run({
        id: 'submit',
        label: 'Submitted prompt',
        group: 'Baseline',
        description: 'A prompt sent from the composer.',
        prompt: text,
        steps: defaultReply,
      })
    },

    trigger(id) {
      const scenario = triggers.get(id)
      if (!scenario) {
        return Promise.reject(new Error(`Unknown trigger: ${id}`))
      }
      return run(scenario)
    },

    abort() {
      controller?.abort()
    },

    reset() {
      controller?.abort()
      store.dispatch({ type: 'thread/reset' })
    },
  }
}
