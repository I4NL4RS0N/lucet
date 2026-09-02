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
  /** Commit a restore: a NEW version of the named turn lands at the end
      of the thread (restore is a copy — nothing is deleted), and any
      preview view returns to latest. */
  restore(turnId: string): void
  /** Perform the settled response's own exit — the verb its ending offered
      (round 05, P1): a new turn from the recovery script, a resumption of
      the same response, or a retry scheduled for when a limit lifts. Falls
      back to retry() when the turn's scenario stamped no verb. */
  recover(turnId: string): Promise<void>
  /** Force a named state, in context, without resetting the thread. A
      scenario with pre-send steps sets the world up and stops; the
      person's own send then gets that scenario's reply. A once-per-thread
      scenario fired again only re-enters its preview. */
  trigger(id: string): Promise<void>
  /** Stop the current response. What already arrived stays. */
  abort(): void
  /** Abort, drop any pending pre-send reply, and return the thread to its
      initial state. Every timer is cancelled with the abort. */
  reset(): void
  /** The instrument behind Reset: what is still pending. */
  inspect(): {
    pendingTimers: number
    running: boolean
    pendingReply: string | null
    queued: string | null
    locked: boolean
    /** Retries armed for a limit's reset and not yet fired. */
    scheduledRetries: number
  }
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
  /* Every sleep is counted in and out, so Reset can be instrumented: a
     cancelled timer rejects and leaves the count at zero. */
  let pendingTimers = 0
  const baseScheduler = options.scheduler ?? systemScheduler
  const scheduler: Scheduler = {
    async sleep(ms, signal) {
      pendingTimers++
      try {
        await baseScheduler.sleep(ms, signal)
      } finally {
        pendingTimers--
      }
    },
  }
  const clock = options.clock ?? systemClock
  const runtime = createMockRuntime({
    store,
    nextId,
    scheduler,
    clock,
    ...(options.authorId === undefined ? {} : { authorId: options.authorId }),
  })
  let scheduledRetries = 0

  let controller: AbortController | null = null
  /* A pre-send scenario waits here for the person's own send. */
  let pendingReply: Scenario | null = null

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
    /* Every turn this run created remembers its scenario — a retryTurn
       makes two, and a once-per-thread trigger must find the original. */
    for (const born of turnsNow.slice(turnsBefore)) turnScenarios.set(born.id, scenario)

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
      /* The pre-send decision, kept: a trigger that set the world up gets
         its own reply when the person sends, on the model they chose. */
      const reply = pendingReply
      pendingReply = null
      return run(reply?.preSend ? { ...reply, prompt: text } : submitScenario(text))
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
        return run({ ...rest, prompt: text, steps: recovery.steps }, { retryOf: turnId })
      }
      return run(submitScenario(text), { retryOf: turnId })
    },

    async recover(turnId) {
      const turn = store.getState().turns.find((t) => t.id === turnId)
      if (!turn) throw new Error(`Unknown turn: ${turnId}`)
      const source = turnScenarios.get(turnId)
      const recovery = source?.recovery
      if (!source || !recovery) return this.retry(turnId)
      const text = turn.prompt.parts.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join('\n')
      const { recovery: _r, ...rest } = source
      if (recovery.mode === 'retry') {
        return run({ ...rest, prompt: text, steps: recovery.steps }, { retryOf: turnId })
      }
      if (recovery.mode === 'resume') {
        if (!turn.response) throw new Error('Nothing to resume')
        controller?.abort()
        const own = new AbortController()
        controller = own
        try {
          await runtime.resume({ ...rest, steps: recovery.steps }, turn.response.id, own.signal)
        } finally {
          if (controller === own) controller = null
        }
        return
      }
      /* retry-at: armed for the moment the limit lifts. The draft in the
         composer is untouched — the wait belongs to the ending that asked
         for it, and Reset cancels it with everything else. */
      if (!turn.response) throw new Error('Nothing to retry')
      const at = turn.response.recovery?.at ?? clock.now()
      store.dispatch({ type: 'recovery/scheduled', messageId: turn.response.id, at })
      controller?.abort()
      const own = new AbortController()
      controller = own
      scheduledRetries++
      try {
        await scheduler.sleep(Math.max(0, at - clock.now()), own.signal)
      } catch {
        return
      } finally {
        scheduledRetries--
        if (controller === own) controller = null
      }
      return run({ ...rest, prompt: text, steps: recovery.steps }, { retryOf: turnId })
    },

    restore(turnId) {
      const source = store.getState().turns.find((t) => t.id === turnId)
      if (!source) throw new Error(`Unknown turn: ${turnId}`)
      store.dispatch({
        type: 'turn/restored',
        turnId: nextId('turn'),
        versionId: nextId('v'),
        promptMessageId: nextId('msg'),
        responseMessageId: nextId('msg'),
        restoreOf: turnId,
      })
    },

    async trigger(id) {
      const scenario = triggers.get(id)
      if (!scenario) {
        throw new Error(`Unknown trigger: ${id}`)
      }
      if (scenario.preSend) {
        controller?.abort()
        const own = new AbortController()
        controller = own
        pendingReply = scenario
        try {
          await runtime.prepare(scenario, own.signal)
        } finally {
          if (controller === own) controller = null
        }
        return
      }
      if (scenario.oncePerThread) {
        const present = store.getState().turns.filter((t) => turnScenarios.get(t.id)?.id === scenario.id)
        if (present.length > 0) {
          /* Already here: re-enter the preview of the ORIGINAL turn, add
             nothing. Entry and exit any number of times leave the thread
             exactly as long as it was. */
          const origin = present.find((t) => t.retryOf === null) ?? present[0]
          if (origin && scenario.steps.some((s) => s.type === 'restore'))
            store.dispatch({ type: 'restore/entered', turnId: origin.id })
          return
        }
      }
      return run(scenario)
    },

    abort() {
      controller?.abort()
    },

    reset() {
      controller?.abort()
      pendingReply = null
      store.dispatch({ type: 'thread/reset' })
    },

    inspect() {
      const { composer } = store.getState()
      return {
        pendingTimers,
        running: controller !== null,
        pendingReply: pendingReply?.id ?? null,
        queued: composer.queued,
        locked: composer.locked,
        scheduledRetries,
      }
    },
  }
}
