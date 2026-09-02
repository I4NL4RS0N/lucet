/**
 * Every state change is an event.
 *
 * Two reasons this is event-sourced rather than a pile of setters. First, the
 * docs site inspector shows each transition as it happens, and an event log is
 * that, for free. Second, "every prompt is a commit" is much easier to honour
 * when the history is already the source of truth.
 */

import type {
  AttachmentKind,
  MessagePart,
  MessageStatus,
  ServiceStatus,
  ToolStatus,
  UsageState,
  SourceStatus,
  ScopeLevel,
} from './types.js'

export type LucetEvent =
  | { type: 'thread/reset' }
  | { type: 'composer/changed'; text: string }
  | { type: 'composer/queued'; text: string }
  | { type: 'composer/locked'; by: string }
  | { type: 'composer/unlocked' }
  | { type: 'composer/dequeued' }
  | {
      type: 'attachment/added'
      id: string
      name: string
      fileKind: AttachmentKind
      sizeBytes: number
    }
  | { type: 'attachment/settled'; id: string; status: 'ready' | 'failed'; reason: string | null }
  | { type: 'attachment/retried'; id: string }
  | { type: 'attachment/removed'; id: string }
  | { type: 'model/changed'; modelId: string }
  | {
      type: 'turn/submitted'
      turnId: string
      versionId: string
      messageId: string
      text: string
      authorId: string
      /** What actually went with the turn. The log stays truthful. */
      attachmentIds: readonly string[]
      /** The turn this one retries, when it is a retry. Same words, new commit. */
      retryOf: string | null
    }
  | { type: 'response/started'; turnId: string; messageId: string }
  | { type: 'part/added'; messageId: string; part: MessagePart }
  | { type: 'part/delta'; messageId: string; partId: string; delta: string }
  | {
      type: 'tool/settled'
      messageId: string
      partId: string
      status: ToolStatus
      detail: string
      /** The raw output, if the host shares it. The words go in `detail`. */
      result: string | null
    }
  | {
      type: 'response/settled'
      messageId: string
      status: MessageStatus
      reason: string | null
    }
  | { type: 'service/changed'; status: ServiceStatus; message: string | null }
  | { type: 'service/dismissed' }
  | { type: 'usage/changed'; patch: Partial<UsageState> }
  | {
      type: 'feedback/given'
      messageId: string
      /** null retracts: a rating you cannot take back is not feedback. */
      verdict: 'up' | 'down' | null
    }
  | { type: 'restore/entered'; turnId: string }
  | { type: 'restore/exited' }
  | {
      /** Restore commits as a COPY: a new version of the restored turn
          lands at the end of the thread; nothing is deleted. */
      type: 'turn/restored'
      turnId: string
      versionId: string
      promptMessageId: string
      responseMessageId: string
      restoreOf: string
    }
  | {
      /** The host installs or replaces the scope ladder. */
      type: 'scope/configured'
      levels: readonly ScopeLevel[]
      selectedId: string | null
    }
  | {
      /** The person picked a rung. Clears any moved note: acting on
          scope is what settles it. */
      type: 'scope/changed'
      levelId: string
    }
  | {
      /**
       * Navigation changed the ground under the scope: a new ladder for
       * the new place, the selection following, and a NOTE that says so
       * — in a drawer the page keeps moving, and a scope that follows
       * silently is a guess again.
       */
      type: 'scope/moved'
      levels: readonly ScopeLevel[]
      selectedId: string | null
      note: string
    }
  | {
      /**
       * A cited source's condition changed AFTER the response settled —
       * updated behind the citation, or removed outright. This is why
       * sources live in the event log: the thread can tell the truth
       * about its own bibliography aging.
       */
      type: 'source/changed'
      messageId: string
      partId: string
      sourceId: string
      status: SourceStatus
      note: string | null
    }

export interface LoggedEvent {
  readonly seq: number
  readonly at: number
  readonly event: LucetEvent
}

/**
 * A one-line, non-technical description of an event.
 *
 * The inspector shows this above the raw payload, on the same progressive
 * disclosure principle the Audit Trail uses: legible at the top, exact
 * underneath.
 */
export function describeEvent(event: LucetEvent): string {
  switch (event.type) {
    case 'thread/reset':
      return 'Thread reset'
    case 'composer/changed':
      return 'Composer text changed'
    case 'composer/queued':
      return 'Next prompt queued while locked'
    case 'composer/locked':
      return `Composer locked by ${event.by}`
    case 'composer/unlocked':
      return 'Composer unlocked'
    case 'composer/dequeued':
      return 'Queued prompt taken to send'
    case 'attachment/added':
      return `Attaching ${event.name}`
    case 'attachment/settled':
      return event.status === 'ready' ? 'Attachment ready' : 'Attachment failed'
    case 'attachment/retried':
      return 'Attachment retrying'
    case 'attachment/removed':
      return 'Attachment removed'
    case 'model/changed':
      return `Model set to ${event.modelId}`
    case 'turn/submitted':
      return event.retryOf
        ? `Turn resubmitted by ${event.authorId} — same words, new commit`
        : `Turn submitted by ${event.authorId}`
    case 'response/started':
      return 'Response started'
    case 'part/added':
      return `Added ${event.part.kind} part`
    case 'part/delta':
      return 'Streamed a chunk'
    case 'tool/settled':
      return `Tool ${event.status}`
    case 'response/settled':
      return `Response ${event.status}`
    case 'service/changed':
      return `Service ${event.status}`
    case 'service/dismissed':
      return 'Service notice dismissed'
    case 'usage/changed':
      return 'Usage updated'
    case 'feedback/given':
      return event.verdict === 'up'
        ? 'Marked helpful'
        : event.verdict === 'down'
          ? 'Marked unhelpful'
          : 'Feedback taken back'
    case 'restore/entered':
      return 'Previewing an earlier version — nothing changes until you restore'
    case 'turn/restored':
      return 'Restored an earlier version — the thread continues from it'
    case 'restore/exited':
      return 'Returned to latest'
    case 'scope/configured':
      return 'Scope ladder configured'
    case 'scope/changed':
      return 'Scope changed'
    case 'scope/moved':
      return 'The page moved — scope followed, and said so'
    case 'source/changed':
      return event.status === 'gone'
        ? 'A cited source is no longer available'
        : event.status === 'stale'
          ? 'A cited source was updated since it was cited'
          : 'A cited source checks out again'
  }
}
