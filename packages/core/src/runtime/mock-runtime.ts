/**
 * Executes a scenario against the store.
 *
 * The mock runtime: it confidently makes things up, on
 * purpose and repeatably. Swapping it for a real transport is a matter of
 * emitting the same events.
 */

import type { Scheduler } from '../clock.js'
import { systemScheduler } from '../clock.js'
import type { Store } from '../store.js'
import type { MessageStatus } from '../types.js'
import type { Scenario, Step } from './scenario.js'

export interface MockRuntimeOptions {
  store: Store
  nextId: (prefix: string) => string
  scheduler?: Scheduler
  /** Who the local participant is. Used for turn attribution. */
  authorId?: string
}

export interface MockRuntime {
  run(scenario: Scenario, signal?: AbortSignal, meta?: { retryOf?: string }): Promise<void>
}

const DEFAULT_CHUNK_MS = 24

function chunk(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text]
}

export function createMockRuntime(options: MockRuntimeOptions): MockRuntime {
  const { store, nextId } = options
  const scheduler = options.scheduler ?? systemScheduler
  const authorId = options.authorId ?? 'you'

  async function stream(
    messageId: string,
    kind: 'text' | 'reasoning',
    text: string,
    chunkMs: number,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const partId = nextId('part')
    store.dispatch({
      type: 'part/added',
      messageId,
      part:
        kind === 'text'
          ? { kind: 'text', id: partId, text: '' }
          : { kind: 'reasoning', id: partId, text: '' },
    })
    for (const piece of chunk(text)) {
      await scheduler.sleep(chunkMs, signal)
      store.dispatch({ type: 'part/delta', messageId, partId, delta: piece })
    }
  }

  /* The most recent bibliography, so a later sourceChange can address it. */
  let lastSourcesPartId: string | null = null
  /* This run's original commit, so retryTurn and restore can point home. */
  let currentTurnId: string | null = null
  let currentPrompt: string | null = null

  async function step(
    s: Step,
    messageId: string,
    signal: AbortSignal | undefined,
  ): Promise<MessageStatus | null> {
    switch (s.type) {
      case 'wait':
        await scheduler.sleep(s.ms, signal)
        return null

      case 'say':
        await stream(messageId, 'text', s.text, s.chunkMs ?? DEFAULT_CHUNK_MS, signal)
        return null

      case 'think':
        await stream(messageId, 'reasoning', s.text, s.chunkMs ?? DEFAULT_CHUNK_MS, signal)
        return null

      case 'tool': {
        const partId = nextId('part')
        store.dispatch({
          type: 'part/added',
          messageId,
          part: {
            kind: 'tool',
            id: partId,
            name: s.name,
            status: 'running',
            detail: null,
            args: s.args ?? null,
            result: null,
          },
        })
        await scheduler.sleep(s.ms, signal)
        store.dispatch({
          type: 'tool/settled',
          messageId,
          partId,
          status: s.outcome,
          detail: s.detail,
          result: s.result ?? null,
        })
        return null
      }

      case 'retryTurn': {
        /* The whole commit ceremony again, deliberately: same words, new
           turn ids, retryOf pointing home. The log reads exactly like a
           person pressing Ask again. */
        const retryTurnId = nextId('turn')
        const retryPromptId = nextId('msg')
        const retryResponseId = nextId('msg')
        store.dispatch({
          type: 'turn/submitted',
          turnId: retryTurnId,
          versionId: nextId('v'),
          messageId: retryPromptId,
          text: currentPrompt ?? '',
          authorId,
          attachmentIds: [],
          retryOf: currentTurnId,
        })
        store.dispatch({ type: 'response/started', turnId: retryTurnId, messageId: retryResponseId })
        await stream(retryResponseId, 'text', s.say, s.chunkMs ?? DEFAULT_CHUNK_MS, signal)
        store.dispatch({
          type: 'response/settled',
          messageId: retryResponseId,
          status: 'complete',
          reason: null,
        })
        return null
      }

      case 'restore':
        store.dispatch({ type: 'restore/entered', turnId: currentTurnId ?? '' })
        return null

      case 'sources': {
        const partId = nextId('part')
        lastSourcesPartId = partId
        store.dispatch({
          type: 'part/added',
          messageId,
          part: {
            kind: 'sources',
            id: partId,
            sources: s.sources.map((source) => ({
              ...source,
              status: 'ok',
              note: null,
              detail: source.detail ?? null,
              trace: source.trace ?? null,
            })),
          },
        })
        return null
      }

      case 'sourceChange':
        /* Ages a source on the CURRENT response's bibliography. Scenarios
           cite first, then age; a change with nothing cited is a script
           bug and throws in the fixture run, not silently in the UI. */
        if (!lastSourcesPartId) throw new Error('sourceChange before sources')
        store.dispatch({
          type: 'source/changed',
          messageId,
          partId: lastSourcesPartId,
          sourceId: s.sourceId,
          status: s.status,
          note: s.note,
        })
        return null

      case 'usage': {
        const { usage } = store.getState()
        store.dispatch({
          type: 'usage/changed',
          patch: {
            threadTokens: usage.threadTokens + s.tokens,
            contextTokens: usage.contextTokens + s.tokens,
            threadCostUsd: Number((usage.threadCostUsd + s.costUsd).toFixed(4)),
          },
        })
        return null
      }

      case 'service':
        store.dispatch({ type: 'service/changed', status: s.status, message: s.message })
        return null

      case 'refuse':
        store.dispatch({
          type: 'response/settled',
          messageId,
          status: 'refused',
          reason: s.reason,
        })
        return 'refused'

      case 'fail':
        store.dispatch({
          type: 'response/settled',
          messageId,
          status: 'failed',
          reason: s.reason,
        })
        return 'failed'

      case 'interrupt':
        store.dispatch({
          type: 'response/settled',
          messageId,
          status: 'interrupted',
          reason: s.reason,
        })
        return 'interrupted'

      case 'complete':
        store.dispatch({
          type: 'response/settled',
          messageId,
          status: 'complete',
          reason: null,
        })
        return 'complete'
    }
  }

  return {
    async run(scenario, signal, meta) {
      const turnId = nextId('turn')
      const promptId = nextId('msg')
      const messageId = nextId('msg')
      currentTurnId = turnId
      currentPrompt = scenario.prompt

      store.dispatch({
        type: 'turn/submitted',
        turnId,
        versionId: nextId('v'),
        messageId: promptId,
        text: scenario.prompt ?? '',
        authorId: scenario.author ?? authorId,
        attachmentIds: store
          .getState()
          .composer.attachments.filter((a) => a.status === 'ready')
          .map((a) => a.id),
        retryOf: meta?.retryOf ?? null,
      })
      // Single writer at a time. The composer closes for everyone, not just
      // the person who submitted — and it is held BY whoever that was.
      store.dispatch({ type: 'composer/locked', by: scenario.author ?? authorId })
      store.dispatch({ type: 'response/started', turnId, messageId })

      let settled = false
      try {
        for (const s of scenario.steps) {
          if (settled) {
            /* The response has settled, but the WORLD keeps moving: a
               cited source can age behind a finished answer. Only steps
               that model the world after settle may run here — the rest
               stay unreachable, exactly as before. */
            if (
              s.type === 'wait' ||
              s.type === 'sourceChange' ||
              s.type === 'retryTurn' ||
              s.type === 'restore'
            ) {
              await step(s, messageId, signal)
            }
            continue
          }
          const outcome = await step(s, messageId, signal)
          if (outcome !== null) settled = true
        }
        if (!settled) {
          store.dispatch({
            type: 'response/settled',
            messageId,
            status: 'complete',
            reason: null,
          })
        }
      } catch (error) {
        // An aborted stream is a designed state, not an error to swallow. What
        // arrived before the abort stays on screen.
        if (error instanceof Error && error.name === 'AbortError') {
          store.dispatch({
            type: 'response/settled',
            messageId,
            status: 'interrupted',
            reason: 'Stopped before it finished.',
          })
        } else {
          store.dispatch({
            type: 'response/settled',
            messageId,
            status: 'failed',
            reason: error instanceof Error ? error.message : 'Unknown failure',
          })
        }
      } finally {
        store.dispatch({ type: 'composer/unlocked' })
      }
    },
  }
}
