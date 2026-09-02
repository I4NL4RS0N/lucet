/**
 * Executes a scenario against the store.
 *
 * The mock runtime: it confidently makes things up, on
 * purpose and repeatably. Swapping it for a real transport is a matter of
 * emitting the same events.
 */

import type { Clock, Scheduler } from '../clock.js'
import { systemClock, systemScheduler } from '../clock.js'
import type { Store } from '../store.js'
import type { MessageStatus, RecoveryVerb } from '../types.js'
import type { Scenario, Step } from './scenario.js'

export interface MockRuntimeOptions {
  store: Store
  nextId: (prefix: string) => string
  scheduler?: Scheduler
  /** Reset times and limit windows are clock times; injected like the scheduler. */
  clock?: Clock
  /** Who the local participant is. Used for turn attribution. */
  authorId?: string
}

export interface MockRuntime {
  run(scenario: Scenario, signal?: AbortSignal, meta?: { retryOf?: string }): Promise<void>
  /** Run a scenario's pre-send steps: the world changes, no turn is made. */
  prepare(scenario: Scenario, signal?: AbortSignal): Promise<void>
  /** Continue a settled response with the given steps, then settle it
      again — its own status and reason restored unless a step settles it. */
  resume(scenario: Scenario, messageId: string, signal?: AbortSignal): Promise<void>
}

const DEFAULT_CHUNK_MS = 24

function chunk(text: string): string[] {
  /* Leading whitespace rides with the first word: a continuation begins
     mid-sentence, and its first chunk is " applied", not "applied". */
  return text.match(/\s*\S+\s*/g) ?? [text]
}

export function createMockRuntime(options: MockRuntimeOptions): MockRuntime {
  const { store, nextId } = options
  const scheduler = options.scheduler ?? systemScheduler
  const clock = options.clock ?? systemClock
  const authorId = options.authorId ?? 'you'
  /* The scenario whose steps are running, so a settle can stamp its exit. */
  let currentScenario: Scenario | null = null
  const verbFor = (at: number | null): RecoveryVerb | null => {
    const r = currentScenario?.recovery
    if (!r?.verb) return null
    return { label: r.verb.label, icon: r.verb.icon, mode: r.mode, at, scheduledAt: null }
  }
  /* An instant scenario skips every wait and lands each text whole: the
     state it ends in is the point, and no frame of arrival is shown. */
  let instant = false
  const sleep = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
    instant ? Promise.resolve() : scheduler.sleep(ms, signal)

  async function stream(
    messageId: string,
    kind: 'text' | 'reasoning',
    text: string,
    chunkMs: number,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const partId = nextId('part')
    if (instant) {
      store.dispatch({
        type: 'part/added',
        messageId,
        part: kind === 'text' ? { kind: 'text', id: partId, text } : { kind: 'reasoning', id: partId, text },
      })
      return
    }
    store.dispatch({
      type: 'part/added',
      messageId,
      part:
        kind === 'text'
          ? { kind: 'text', id: partId, text: '' }
          : { kind: 'reasoning', id: partId, text: '' },
    })
    for (const piece of chunk(text)) {
      await sleep(chunkMs, signal)
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
        await sleep(s.ms, signal)
        return null

      case 'notice':
        store.dispatch({
          type: 'part/added',
          messageId,
          part: {
            kind: 'notice',
            id: nextId('part'),
            state: s.state,
            ...(s.tone === undefined ? {} : { tone: s.tone }),
            label: s.label,
            text: s.text,
            action: s.action ? { ...s.action, turnId: currentTurnId ?? '' } : null,
          },
        })
        return null

      case 'model':
        store.dispatch({ type: 'model/changed', modelId: s.modelId })
        return null

      case 'draft':
        store.dispatch({ type: 'composer/changed', text: s.text })
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
        await sleep(s.ms, signal)
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

      case 'tools': {
        /* THE STAGED GROUP (round 06): all the receipts enter pending in one
           frame, then run one at a time — pending, running, settled — so a
           frozen frame in the first second shows work under way and work
           still to come. The answer waits for the last. */
        const ids = s.items.map(() => nextId('part'))
        s.items.forEach((item, i) => {
          store.dispatch({
            type: 'part/added',
            messageId,
            part: {
              kind: 'tool',
              id: ids[i]!,
              name: item.name,
              status: 'pending',
              detail: null,
              args: item.args ?? null,
              result: null,
            },
          })
        })
        for (const [i, item] of s.items.entries()) {
          const partId = ids[i]!
          store.dispatch({ type: 'tool/started', messageId, partId })
          await sleep(item.ms, signal)
          store.dispatch({
            type: 'tool/settled',
            messageId,
            partId,
            status: item.outcome,
            detail: item.detail,
            result: item.result ?? null,
          })
        }
        return null
      }

      case 'scope':
        store.dispatch({ type: 'scope/configured', levels: s.levels, selectedId: s.selectedId })
        return null

      case 'scopeMoved':
        store.dispatch({
          type: 'scope/moved',
          levels: s.levels,
          selectedId: s.selectedId,
          note: s.note,
        })
        return null

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
            ...(s.label === undefined ? {} : { label: s.label }),
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
        const { usage, model } = store.getState()
        /* Priced at the selected model's rate when the script names no
           cost — the whole window, since the context re-sends with every
           turn, the way the meter projects it: the model the person chose
           is the model that runs, and the ledger says what it cost. */
        const rate = model.options.find((o) => o.id === model.selectedId)?.usdPerMTok ?? 0
        const costUsd = s.costUsd ?? Number((((usage.contextTokens + s.tokens) / 1_000_000) * rate).toFixed(4))
        store.dispatch({
          type: 'usage/changed',
          patch: {
            threadTokens: usage.threadTokens + s.tokens,
            contextTokens: usage.contextTokens + s.tokens,
            threadCostUsd: Number((usage.threadCostUsd + costUsd).toFixed(4)),
            /* Every turn the thread pays for, the month pays for too. */
            monthlySpentUsd: Number((usage.monthlySpentUsd + costUsd).toFixed(4)),
          },
        })
        return null
      }

      case 'budget':
        store.dispatch({
          type: 'usage/changed',
          patch: {
            monthlyBudgetUsd: s.budgetUsd,
            monthlySpentUsd: s.spentUsd,
            ...(s.resetsInMs === undefined ? {} : { monthlyResetAt: clock.now() + s.resetsInMs }),
          },
        })
        return null

      case 'service':
        store.dispatch({ type: 'service/changed', status: s.status, message: s.message })
        return null

      case 'refuse':
        store.dispatch({
          type: 'response/settled',
          messageId,
          status: 'refused',
          reason: s.reason,
          recovery: verbFor(null),
        })
        return 'refused'

      case 'fail': {
        const at = s.retryAt === undefined ? null : clock.now() + s.retryAt
        store.dispatch({
          type: 'response/settled',
          messageId,
          status: 'failed',
          reason: s.reason,
          recovery: verbFor(at),
          tone: s.tone ?? null,
        })
        return 'failed'
      }

      case 'interrupt':
        store.dispatch({
          type: 'response/settled',
          messageId,
          status: 'interrupted',
          reason: s.reason,
          recovery: verbFor(null),
        })
        return 'interrupted'

      case 'complete':
        store.dispatch({
          type: 'response/settled',
          messageId,
          status: 'complete',
          reason: null,
          recovery: verbFor(null),
        })
        return 'complete'

      case 'continue': {
        /* Append to the LAST text part: the sentence picks up where it
           stopped. A continuation with no text to continue is a script bug. */
        const message = store.getState().turns.flatMap((t) => (t.response ? [t.response] : [])).find((m) => m.id === messageId)
        const target = message ? [...message.parts].reverse().find((p) => p.kind === 'text') : undefined
        if (!target) throw new Error('continue with no text part to continue')
        if (instant) {
          store.dispatch({ type: 'part/delta', messageId, partId: target.id, delta: s.text })
          return null
        }
        for (const piece of chunk(s.text)) {
          await sleep(s.chunkMs ?? DEFAULT_CHUNK_MS, signal)
          store.dispatch({ type: 'part/delta', messageId, partId: target.id, delta: piece })
        }
        return null
      }

      case 'sourceReplace': {
        const message = store.getState().turns.flatMap((t) => (t.response ? [t.response] : [])).find((m) => m.id === messageId)
        const part = message ? [...message.parts].reverse().find((p) => p.kind === 'sources') : undefined
        if (!part) throw new Error('sourceReplace before sources')
        store.dispatch({
          type: 'source/replaced',
          messageId,
          partId: part.id,
          sourceId: s.sourceId,
          replacement: { ...s.replacement, detail: s.replacement.detail ?? null, trace: s.replacement.trace ?? null, status: 'ok', note: null },
        })
        return null
      }
    }
  }

  return {
    async prepare(scenario, signal) {
      instant = !!scenario.instant
      for (const s of scenario.preSend ?? []) {
        /* No turn exists yet, so nothing that writes into a message may
           run here — a script that tries is a bug, and says so. */
        if (s.type === 'say' || s.type === 'think' || s.type === 'tool' || s.type === 'tools' || s.type === 'notice' || s.type === 'sources' || s.type === 'sourceChange' || s.type === 'retryTurn' || s.type === 'restore' || s.type === 'refuse' || s.type === 'fail' || s.type === 'interrupt' || s.type === 'complete')
          throw new Error(`preSend cannot run a '${s.type}' step`)
        await step(s, '', signal)
      }
    },

    async resume(scenario, messageId, signal) {
      instant = !!scenario.instant
      currentScenario = scenario
      const before = store.getState().turns.flatMap((t) => (t.response ? [t.response] : [])).find((m) => m.id === messageId)
      if (!before) throw new Error(`Unknown response: ${messageId}`)
      store.dispatch({ type: 'response/resumed', messageId })
      store.dispatch({ type: 'composer/locked', by: authorId })
      let settled = false
      try {
        for (const s of scenario.steps) {
          if (settled) continue
          const outcome = await step(s, messageId, signal)
          if (outcome !== null) settled = true
        }
        if (!settled) {
          /* Back to how it ended — a refusal that listed what would go is
             still a refusal — with the exit consumed. */
          store.dispatch({ type: 'response/settled', messageId, status: before.status, reason: before.reason, recovery: null })
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          store.dispatch({ type: 'response/settled', messageId, status: 'interrupted', reason: 'Stopped before it finished.', recovery: null })
        } else {
          store.dispatch({ type: 'response/settled', messageId, status: 'failed', reason: error instanceof Error ? error.message : 'Unknown failure', recovery: null })
        }
      } finally {
        store.dispatch({ type: 'composer/unlocked' })
      }
    },

    async run(scenario, signal, meta) {
      instant = !!scenario.instant
      currentScenario = scenario
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
        /* A retry carries the earlier turn's words, not the composer's
           attachments — those stay with the draft. */
        attachmentIds: meta?.retryOf
          ? []
          : store
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
               cited source can age behind a finished answer, the person
               can start typing (round 05 P2: the draft the scope-freeze
               rule protects). Only steps that model the world after settle
               may run here — the rest stay unreachable, exactly as before. */
            if (
              s.type === 'wait' ||
              s.type === 'sourceChange' ||
              s.type === 'retryTurn' ||
              s.type === 'restore' ||
              s.type === 'scopeMoved' ||
              s.type === 'draft'
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
            recovery: verbFor(null),
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
