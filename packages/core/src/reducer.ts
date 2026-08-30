/**
 * The only place thread state changes. Pure, total, framework-free.
 */

import type { LucetEvent } from './events.js'
import type { Message, MessagePart, ModelOption, ThreadState, Turn } from './types.js'

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
  { id: 'auto', label: 'Auto', note: 'Fits the model to each prompt' },
  { id: 'fast', label: 'Fast', note: 'Quick answers, lighter reasoning' },
  { id: 'deep', label: 'Deep reasoning', note: 'Slower, best for hard problems' },
]

export function createInitialState(
  id: string,
  contextLimit = 200_000,
  models: readonly ModelOption[] = defaultModels,
): ThreadState {
  return {
    id,
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
      projectedCostUsd: null,
    },
    restoredFrom: null,
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
      return createInitialState(state.id, state.usage.contextLimit, state.model.options)

    case 'composer/changed':
      return { ...state, composer: { ...state.composer, text: event.text } }

    case 'composer/queued':
      return { ...state, composer: { ...state.composer, queued: event.text } }

    case 'composer/locked':
      return {
        ...state,
        composer: { ...state.composer, locked: true, lockedBy: event.by },
      }

    case 'composer/unlocked': {
      // Being unlocked promotes anything queued while waiting, rather than
      // making the person retype what they already wrote.
      const { queued } = state.composer
      return {
        ...state,
        composer: {
          ...state.composer,
          text: queued ?? state.composer.text,
          locked: false,
          lockedBy: null,
          queued: null,
        },
      }
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
      const prompt: Message = {
        id: event.messageId,
        role: 'user',
        authorId: event.authorId,
        parts: [{ kind: 'text', id: `${event.messageId}_p1`, text: event.text }],
        status: 'complete',
        reason: null,
        createdAt: ctx.now,
      }
      const turn: Turn = {
        id: event.turnId,
        index: state.turns.length,
        versionId: event.versionId,
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
              ? { ...part, status: event.status, detail: event.detail }
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

    case 'restore/entered':
      return { ...state, restoredFrom: event.turnId }

    case 'restore/exited':
      return { ...state, restoredFrom: null }
  }
}
