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
import type { ModelOption, Suggestion, ThreadState } from './types.js'

export * from './types.js'
export * from './events.js'
export * from './markdown.js'
export * from './announce.js'
export * from './clock.js'
export * from './store.js'
export * from './reducer.js'
export * from './selectors.js'
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
  /** The model options the thread offers. Defaults to the capability-named set. */
  models?: readonly ModelOption[]
  /** Conversation starters, shown while the thread is empty. */
  suggestions?: readonly Suggestion[]
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
  /**
   * Ask again with the same words: a NEW turn that knows its ancestor
   * (Turn.retryOf), because every prompt is a commit and a retry is not an
   * exception to that law. Attachments do not re-send — they left the
   * composer with the original turn; the words are what travel again.
   */
  retry(turnId: string): Promise<void>
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
    ...(options.models === undefined ? {} : { models: options.models }),
    ...(options.suggestions === undefined ? {} : { suggestions: options.suggestions }),
  })
  const triggers = createTriggerRegistry(options.scenarios ?? builtInScenarios)
  const runtime = createMockRuntime({
    store,
    nextId,
    scheduler: options.scheduler ?? systemScheduler,
    ...(options.authorId === undefined ? {} : { authorId: options.authorId }),
  })

  let controller: AbortController | null = null

  const submitScenario = (text: string): Scenario => ({
    id: 'submit',
    label: 'Submitted prompt',
    group: 'Baseline',
    description: 'A prompt sent from the composer.',
    prompt: text,
    steps: defaultReply,
  })

  /* Which scenario a turn came from, so a retry can play the scenario's
     own recovery instead of the generic reply. A weak map by turn id,
     filled after each run that created a turn. */
  const turnScenarios = new Map<string, Scenario>()

  async function run(scenario: Scenario, meta?: { retryOf?: string }): Promise<void> {
    controller?.abort()
    const own = new AbortController()
    controller = own
    const turnsBefore = store.getState().turns.length
    try {
      await runtime.run(scenario, own.signal, meta)
    } finally {
      if (controller === own) controller = null
    }
    const turnsNow = store.getState().turns
    if (turnsNow.length > turnsBefore) {
      const born = turnsNow[turnsNow.length - 1]
      if (born) turnScenarios.set(born.id, scenario)
    }

    /*
     * THE QUEUE PROMISE, KEPT HERE. The strip says "Queued — yours sends
     * next", so when a turn frees, anything queued actually sends -- by the
     * library, not by every host remembering to. Stopping a response is
     * different: Stop means "I am taking control", so an unsent queued prompt
     * is handed back to the field instead of firing behind your back (unless
     * a newer draft is already there, in which case it stays lodged and goes
     * after the next completed turn).
     */
    const after = store.getState()
    if (after.composer.queued !== null && !after.composer.locked) {
      const queued = after.composer.queued
      if (own.signal.aborted) {
        if (after.composer.text.trim() === '') {
          store.dispatch({ type: 'composer/dequeued' })
          store.dispatch({ type: 'composer/changed', text: queued })
        }
      } else {
        store.dispatch({ type: 'composer/dequeued' })
        await run(submitScenario(queued))
      }
    }
  }

  return {
    store,
    triggers,
    getState: () => store.getState(),
    getLog: () => store.getLog(),
    subscribe: (listener) => store.subscribe(listener),

    submit(text) {
      return run(submitScenario(text))
    },

    retry(turnId) {
      const turn = store.getState().turns.find((t) => t.id === turnId)
      if (!turn) {
        return Promise.reject(new Error(`Unknown turn: ${turnId}`))
      }
      const text = turn.prompt.parts.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join('\n')
      /* A failure whose text says "ask again and I will retry" made a
         promise; the scenario's recovery steps are the runtime keeping
         it. Same words, new version — only the outcome differs. */
      const source = turnScenarios.get(turnId)
      if (source?.recovery) {
        const { recovery, ...rest } = source
        return run({ ...rest, prompt: text, steps: recovery }, { retryOf: turnId })
      }
      return run(submitScenario(text), { retryOf: turnId })
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
