/**
 * The only place thread state changes. Pure, total, framework-free.
 */

import type { LucetEvent } from './events.js'
import type { Message, MessagePart, ModelOption, Suggestion, ThreadState, Turn } from './types.js'

export interface ReducerContext {
  readonly now: number
}

/**
 * Deliberately capability-shaped, never vendor-named. A library that ships one
 * vendor's model names reads as built for that vendor.
 *
 * The default is AUTO -- the system fits the model to each prompt (a trivial
 * request goes to something fast and cheap, a hard one to the reasoner).
 * "Balanced" held this slot first and told the user nothing: a tier name
 * describes the machine, "Auto" describes what happens to your prompt.
 */
export const defaultModels: readonly ModelOption[] = [
  { id: 'auto', label: 'Auto', note: 'Fits the model to each prompt', usdPerMTok: 3 },
  { id: 'fast', label: 'Fast', note: 'Quick answers, lighter reasoning', usdPerMTok: 0.6 },
  { id: 'deep', label: 'Deep reasoning', note: 'Slower, best for hard problems', usdPerMTok: 15 },
]

export function createInitialState(
  id: string,
  contextLimit = 200_000,
  models: readonly ModelOption[] = defaultModels,
  suggestions: readonly Suggestion[] = [],
): ThreadState {
  return {
    id,
    suggestions,
    turns: [],
    status: 'idle',
    composer: { text: '', locked: false, lockedBy: null, queued: null, attachments: [] },
    model: { selectedId: models[0]?.id ?? 'auto', options: models },
    service: { status: 'operational', message: null, dismissed: false },
    usage: {
      threadTokens: 0,
      contextTokens: 0,
      contextLimit,
      threadCostUsd: 0,
      monthlyBudgetUsd: null,
      monthlySpentUsd: 0,
    },
    restoredFrom: null,
    scope: { levels: [], selectedId: null, movedNote: null },
  }
}

function mapResponse(
  state: ThreadState,
  messageId: string,
  fn: (message: Message) => Message,
): readonly Turn[] {
  return state.turns.map((turn) =>
    turn.response && turn.response.id === messageId
      ? { ...turn, response: fn(turn.response) }
      : turn,
  )
}

function mapPart(
  message: Message,
  partId: string,
  fn: (part: MessagePart) => MessagePart,
): Message {
  return {
    ...message,
    parts: message.parts.map((part) => (part.id === partId ? fn(part) : part)),
  }
}

export function reduce(
  state: ThreadState,
  event: LucetEvent,
  ctx: ReducerContext,
): ThreadState {
  switch (event.type) {
    case 'thread/reset':
      /* Host configuration survives a new thread: the suggestions, and
         the scope ladder — a fresh conversation on the same page still
         has the same page under it. The moved note clears; a new thread
         is an act on scope. */
      return {
        ...createInitialState(
          state.id,
          state.usage.contextLimit,
          state.model.options,
          state.suggestions,
        ),
        scope: { ...state.scope, movedNote: null },
        /* The month outlives the thread. A new conversation empties the
           window and the thread's tally, never the account's. */
        usage: {
          ...createInitialState(state.id, state.usage.contextLimit).usage,
          monthlyBudgetUsd: state.usage.monthlyBudgetUsd,
          monthlySpentUsd: state.usage.monthlySpentUsd,
        },
      }

    case 'composer/changed':
      return { ...state, composer: { ...state.composer, text: event.text } }

    /*
     * Queuing LODGES the prompt and clears the field: your message is on its
     * way, and the field belongs to whatever you want to say after it. The
     * old design left the text in the field and merely promoted it back on
     * unlock -- which also meant anything typed after queueing was silently
     * overwritten by the promotion.
     */
    case 'composer/queued':
      return { ...state, composer: { ...state.composer, queued: event.text, text: '' } }

    /* The runtime takes the queued prompt to send it. See createLucet. */
    case 'composer/dequeued':
      return { ...state, composer: { ...state.composer, queued: null } }

    case 'composer/locked':
      return {
        ...state,
        composer: { ...state.composer, locked: true, lockedBy: event.by },
      }

    /*
     * Unlock ONLY unlocks. The queued prompt is not promoted back into the
     * field -- "Queued — yours sends next" is a promise, and the runtime
     * keeps it by actually submitting the queued text when the turn frees
     * (see createLucet). A reducer that merely refilled the field made the
     * copy a lie.
     */
    case 'composer/unlocked':
      return {
        ...state,
        composer: { ...state.composer, locked: false, lockedBy: null },
      }

    case 'attachment/added':
      return {
        ...state,
        composer: {
          ...state.composer,
          attachments: [
            ...state.composer.attachments,
            {
              id: event.id,
              name: event.name,
              fileKind: event.fileKind,
              sizeBytes: event.sizeBytes,
              status: 'uploading',
              reason: null,
            },
          ],
        },
      }

    case 'attachment/settled':
      return {
        ...state,
        composer: {
          ...state.composer,
          attachments: state.composer.attachments.map((a) =>
            a.id === event.id ? { ...a, status: event.status, reason: event.reason } : a,
          ),
        },
      }

    /* A failed upload can be TRIED AGAIN: the person still has the file, so
       "remove it" was never the only honest answer. Back to uploading, slate
       clean. */
    case 'attachment/retried':
      return {
        ...state,
        composer: {
          ...state.composer,
          attachments: state.composer.attachments.map((a) =>
            a.id === event.id && a.status === 'failed'
              ? { ...a, status: 'uploading', reason: null }
              : a,
          ),
        },
      }

    case 'attachment/removed':
      return {
        ...state,
        composer: {
          ...state.composer,
          attachments: state.composer.attachments.filter((a) => a.id !== event.id),
        },
      }

    // Unknown ids are ignored rather than trusted: the reducer is total over
    // arbitrary event streams, and a picker can never select a model the
    // thread does not offer.
    case 'model/changed':
      return state.model.options.some((option) => option.id === event.modelId)
        ? { ...state, model: { ...state.model, selectedId: event.modelId } }
        : state

    case 'turn/submitted': {
      /*
       * The prompt carries its attachments as PARTS, looked up from the
       * composer by the ids the event names. The event log stays the truth
       * (attachmentIds says exactly what went); the parts are that truth
       * made visible in the thread.
       */
      const sent = event.attachmentIds
        .map((id) => state.composer.attachments.find((a) => a.id === id))
        .filter((a): a is NonNullable<typeof a> => a !== undefined)
        .map((a) => ({
          kind: 'attachment' as const,
          id: a.id,
          name: a.name,
          fileKind: a.fileKind,
          sizeBytes: a.sizeBytes,
        }))
      const prompt: Message = {
        id: event.messageId,
        role: 'user',
        authorId: event.authorId,
        parts: [
          ...(event.text.trim() ? [{ kind: 'text' as const, id: `${event.messageId}_p1`, text: event.text }] : []),
          ...sent,
        ],
        status: 'complete',
        reason: null,
        feedback: null,
        createdAt: ctx.now,
      }
      const turn: Turn = {
        id: event.turnId,
        index: state.turns.length,
        versionId: event.versionId,
        retryOf: event.retryOf,
        prompt,
        response: null,
      }
      return {
        ...state,
        turns: [...state.turns, turn],
        status: 'submitting',
        composer: {
          ...state.composer,
          text: '',
          // Ready attachments went with the turn. Anything still uploading or
          // failed stays behind, visibly -- silently discarding it would send
          // less than the person thinks they sent.
          attachments: state.composer.attachments.filter((a) => a.status !== 'ready'),
        },
      }
    }

    case 'response/started': {
      const response: Message = {
        id: event.messageId,
        role: 'assistant',
        authorId: 'assistant',
        parts: [],
        status: 'streaming',
        reason: null,
        feedback: null,
        createdAt: ctx.now,
      }
      return {
        ...state,
        status: 'streaming',
        turns: state.turns.map((turn) =>
          turn.id === event.turnId ? { ...turn, response } : turn,
        ),
      }
    }

    case 'part/added':
      return {
        ...state,
        turns: mapResponse(state, event.messageId, (message) => ({
          ...message,
          parts: [...message.parts, event.part],
        })),
      }

    case 'part/delta':
      return {
        ...state,
        turns: mapResponse(state, event.messageId, (message) =>
          mapPart(message, event.partId, (part) =>
            part.kind === 'text' || part.kind === 'reasoning'
              ? { ...part, text: part.text + event.delta }
              : part,
          ),
        ),
      }

    case 'tool/settled':
      return {
        ...state,
        turns: mapResponse(state, event.messageId, (message) =>
          mapPart(message, event.partId, (part) =>
            part.kind === 'tool'
              ? { ...part, status: event.status, detail: event.detail, result: event.result }
              : part,
          ),
        ),
      }

    case 'response/settled':
      return {
        ...state,
        status: 'idle',
        turns: mapResponse(state, event.messageId, (message) => ({
          ...message,
          status: event.status,
          reason: event.reason,
        })),
      }

    case 'service/changed':
      return {
        ...state,
        service: { status: event.status, message: event.message, dismissed: false },
      }

    case 'service/dismissed':
      return { ...state, service: { ...state.service, dismissed: true } }

    case 'usage/changed':
      return { ...state, usage: { ...state.usage, ...event.patch } }

    /* Feedback lands on responses only: rating your own words is a no-op
       by construction, since mapResponse never matches a prompt. */
    case 'feedback/given':
      return {
        ...state,
        turns: mapResponse(state, event.messageId, (message) => ({
          ...message,
          feedback: event.verdict,
        })),
      }

    case 'scope/configured':
      return {
        ...state,
        scope: { levels: event.levels, selectedId: event.selectedId, movedNote: null },
      }

    case 'scope/changed':
      return {
        ...state,
        scope: { ...state.scope, selectedId: event.levelId, movedNote: null },
      }

    case 'scope/moved':
      return {
        ...state,
        scope: { levels: event.levels, selectedId: event.selectedId, movedNote: event.note },
      }

    case 'source/changed':
      return {
        ...state,
        turns: mapResponse(state, event.messageId, (message) => ({
          ...message,
          parts: message.parts.map((part) =>
            part.kind === 'sources' && part.id === event.partId
              ? {
                  ...part,
                  sources: part.sources.map((source) =>
                    source.id === event.sourceId
                      ? { ...source, status: event.status, note: event.note }
                      : source,
                  ),
                }
              : part,
          ),
        })),
      }

    case 'restore/entered':
      return { ...state, restoredFrom: event.turnId }

    case 'restore/exited':
      return { ...state, restoredFrom: null }
  }
}
