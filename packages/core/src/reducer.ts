/**
 * The only place thread state changes. Pure, total, framework-free.
 */

import type { LucetEvent } from './events.js'
import type { Message, MessagePart, ModelOption, ScopeMove, Suggestion, ThreadState, Turn } from './types.js'

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
    composer: { text: '', locked: false, lockedBy: null, queued: null, attachments: [], intercept: null },
    model: { selectedId: models[0]?.id ?? 'auto', options: models },
    service: { status: 'operational', message: null, dismissed: false },
    usage: {
      threadTokens: 0,
      contextTokens: 0,
      contextLimit,
      threadCostUsd: 0,
      monthlyBudgetUsd: null,
      monthlySpentUsd: 0,
      monthlyResetAt: null,
    },
    restoredFrom: null,
    scope: { levels: [], selectedId: null, movedNote: null, pending: null },
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
        /* A new thread is an act on scope: a page change held behind the
           old draft applies now — the draft is gone with the thread. */
        scope: state.scope.pending
          ? {
              levels: state.scope.pending.levels,
              selectedId: state.scope.pending.selectedId,
              movedNote: null,
              pending: null,
            }
          : { ...state.scope, movedNote: null, pending: null },
        /* The month outlives the thread. A new conversation empties the
           window and the thread's tally, never the account's. */
        usage: {
          ...createInitialState(state.id, state.usage.contextLimit).usage,
          monthlyBudgetUsd: state.usage.monthlyBudgetUsd,
          monthlySpentUsd: state.usage.monthlySpentUsd,
          /* ...and when it resets: a spent month still says exactly when
             it lifts in the thread that follows (component audit 03). */
          monthlyResetAt: state.usage.monthlyResetAt,
        },
      }

    case 'composer/changed':
      /* New words, new projection: a hold on the old words lets go. */
      return { ...state, composer: { ...state.composer, text: event.text, intercept: null } }

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
      /* A model change releases the hold (round 06): the cheaper choice
         WAS the decision, and the next Send re-prices from scratch. */
      return state.model.options.some((option) => option.id === event.modelId)
        ? {
            ...state,
            model: { ...state.model, selectedId: event.modelId },
            composer: { ...state.composer, intercept: null },
          }
        : state

    /* THE HOLD (round 06): the send that would cross the month stops
       here, with its price and what remains, until the person decides. */
    case 'budget/intercepted':
      return {
        ...state,
        composer: {
          ...state.composer,
          intercept: { text: event.text, costUsd: event.costUsd, remainingUsd: event.remainingUsd },
        },
      }

    case 'budget/released':
      return { ...state, composer: { ...state.composer, intercept: null } }

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
        recovery: null, tone: null,
        feedback: null,
        createdAt: ctx.now,
      }
      const turn: Turn = {
        id: event.turnId,
        index: state.turns.length,
        versionId: event.versionId,
        retryOf: event.retryOf,
        restoreOf: null,
        prompt,
        response: null,
      }
      return {
        ...state,
        turns: [...state.turns, turn],
        status: 'submitting',
        /* A held page change applies once the draft has gone (component
           audit 04): the words were sent against the scope they were written
           for, and with nothing left in the field the ground may follow. A
           retry sends older words and leaves the draft — and the hold. */
        scope:
          state.scope.pending && event.retryOf === null
            ? {
                levels: state.scope.pending.levels,
                selectedId: state.scope.pending.selectedId,
                movedNote: state.scope.pending.note,
                pending: null,
              }
            : state.scope,
        composer: {
          ...state.composer,
          intercept: null,
          /* A RETRY IS NOT THE COMPOSER'S SEND (round 05, P1): the words came
             from an earlier turn, so a draft in progress stays exactly as
             typed, attachments included. Only a fresh send empties the field. */
          text: event.retryOf === null ? '' : state.composer.text,
          // Ready attachments went with the turn. Anything still uploading or
          // failed stays behind, visibly -- silently discarding it would send
          // less than the person thinks they sent.
          attachments:
            event.retryOf === null
              ? state.composer.attachments.filter((a) => a.status !== 'ready')
              : state.composer.attachments,
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
        recovery: null, tone: null,
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

    /* A staged receipt begins (round 06): pending becomes running, in place. */
    case 'tool/started':
      return {
        ...state,
        turns: mapResponse(state, event.messageId, (message) =>
          mapPart(message, event.partId, (part) =>
            part.kind === 'tool' ? { ...part, status: 'running' } : part,
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
          recovery: event.recovery ?? null,
          tone: event.tone ?? null,
        })),
      }

    /* THE BOUNDED CONTINUATION (round 05, P1): a settled response goes
       live again, keeping every part it has; the runtime then appends
       with the ordinary part events and settles it once more. The verb
       that reopened it is consumed here — an exit is offered once. */
    case 'response/resumed':
      return {
        ...state,
        status: 'streaming',
        turns: mapResponse(state, event.messageId, (message) => ({
          ...message,
          status: 'streaming',
          reason: null,
          recovery: null, tone: null,
        })),
      }

    case 'recovery/scheduled':
      return {
        ...state,
        turns: mapResponse(state, event.messageId, (message) => ({
          ...message,
          recovery: message.recovery ? { ...message.recovery, scheduledAt: event.at } : null,
        })),
      }

    case 'source/replaced':
      return {
        ...state,
        turns: mapResponse(state, event.messageId, (message) => ({
          ...message,
          parts: message.parts.map((part) =>
            part.kind === 'sources' && part.id === event.partId
              ? {
                  ...part,
                  sources: part.sources.map((source) =>
                    source.id === event.sourceId ? { ...event.replacement, status: 'ok' as const, note: null } : source,
                  ),
                }
              : part,
          ),
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
        scope: { levels: event.levels, selectedId: event.selectedId, movedNote: null, pending: null },
      }

    case 'scope/changed':
      return {
        ...state,
        scope: { ...state.scope, selectedId: event.levelId, movedNote: null, pending: null },
      }

    /* THE SCOPE-FREEZE RULE (round 05 P2). With nothing typed, navigation
       may update the scope, and the note says so. With a draft in the
       field the words were written against a page, and swapping the page
       under them is a silent change of meaning — so the move is HELD until
       the person chooses: Use new page, or Keep previous page. */
    case 'scope/moved': {
      /* ONLY A CHANGED BOUNDARY IS NEWS (component audit 04). The page
         moved, but the question is whether the SELECTED scope did: "All of
         Aquilo" covers the same things from any page, and a draft written
         against it has nothing to protect. When the selected rung reads the
         same in the new ladder — same name, summary and count — the ladder
         updates quietly: no note, no decision. */
      const before = state.scope.levels.find((l) => l.id === state.scope.selectedId)
      const after = event.levels.find((l) => l.id === event.selectedId)
      const same =
        before !== undefined &&
        after !== undefined &&
        (before.name ?? before.label) === (after.name ?? after.label) &&
        before.summary === after.summary &&
        before.itemCount === after.itemCount
      if (same)
        return {
          ...state,
          scope: { ...state.scope, levels: event.levels, selectedId: event.selectedId, pending: null },
        }
      const move: ScopeMove = {
        levels: event.levels,
        selectedId: event.selectedId,
        note: event.note,
        ...(event.pageName ? { pageName: event.pageName } : {}),
      }
      return state.composer.text.trim() !== ''
        ? { ...state, scope: { ...state.scope, pending: move } }
        : { ...state, scope: { levels: event.levels, selectedId: event.selectedId, movedNote: event.note, pending: null } }
    }

    case 'scope/updateAccepted':
      return state.scope.pending
        ? {
            ...state,
            scope: {
              levels: state.scope.pending.levels,
              selectedId: state.scope.pending.selectedId,
              movedNote: state.scope.pending.note,
              pending: null,
            },
          }
        : state

    case 'scope/updateDeclined': {
      /* The kept scope says so in words, so the outcome is as legible as the
         other one (component audit 04): "Scope remains on Reports review." */
      const kept = state.scope.levels.find((l) => l.id === state.scope.selectedId)
      return {
        ...state,
        scope: {
          ...state.scope,
          movedNote: kept ? `Scope remains on ${kept.name ?? kept.label}.` : state.scope.movedNote,
          pending: null,
        },
      }
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

    case 'turn/restored': {
      /*
       * RESTORE IS A COPY, NEVER A ROLLBACK (brief §16.2, resolved:
       * neither branch nor discard). The restored turn's prompt and
       * settled response return as a NEW version at the end of the
       * thread; every later version stays in place and stays
       * restorable, in both directions. The worst case of this event
       * is zero: the store only ever grows.
       */
      const source = state.turns.find((t) => t.id === event.restoreOf)
      if (!source) return state
      const reid = (m: Message, id: string): Message => ({
        ...m,
        id,
        parts: m.parts.map((p, i) => ({ ...p, id: `${id}_p${i + 1}` })),
        feedback: null,
        createdAt: ctx.now,
      })
      const turn: Turn = {
        id: event.turnId,
        index: state.turns.length,
        versionId: event.versionId,
        retryOf: null,
        restoreOf: source.id,
        prompt: reid(source.prompt, event.promptMessageId),
        response: source.response ? reid(source.response, event.responseMessageId) : null,
      }
      return {
        ...state,
        turns: [...state.turns, turn],
        restoredFrom: null,
      }
    }
  }
}
