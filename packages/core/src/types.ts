/**
 * The Lucet state contract.
 *
 * Everything the interface can be in, expressed once, framework-free. The docs
 * site's state inspector renders this directly, which is deliberate: if the
 * contract is not legible here, it is not legible to anyone consuming it.
 */

export type Role = 'user' | 'assistant'

/**
 * A response is never simply "loading" or "done". These are the terminal and
 * non-terminal states a real assistant response actually reaches.
 */
export type MessageStatus =
  | 'pending'
  | 'streaming'
  | 'complete'
  | 'interrupted'
  | 'failed'
  | 'refused'

export type ToolStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  /** Returned something, but not everything it was asked for. */
  | 'partial'

export interface TextPart {
  readonly kind: 'text'
  readonly id: string
  readonly text: string
}

/** Reasoning / thinking disclosure. Separate from text so it can be collapsed. */
export interface ReasoningPart {
  readonly kind: 'reasoning'
  readonly id: string
  readonly text: string
}

export interface ToolPart {
  readonly kind: 'tool'
  readonly id: string
  readonly name: string
  readonly status: ToolStatus
  /** Human-readable outcome. Present once the call settles. */
  readonly detail: string | null
  /**
   * The raw exchange, serialized by the host (usually JSON): what the tool
   * was asked, and what came back. `detail` is the words; these are the
   * receipt — the same progressive-disclosure split as everywhere else,
   * legible at the top, exact underneath. Null when the host withholds
   * them, and the display must then offer nothing to expand.
   */
  readonly args: string | null
  readonly result: string | null
}

/**
 * An attachment that WENT WITH a message. Deferred when the composer landed,
 * due now that messages render: the composer's chips move here on submit, so
 * what you sent stays visible in the thread, not just in the event log.
 */
export interface AttachmentPart {
  readonly kind: 'attachment'
  readonly id: string
  readonly name: string
  readonly fileKind: AttachmentKind
  readonly sizeBytes: number
}

/**
 * Where a claim came from. A citation is a claim WITH A TIMESTAMP: the
 * source was true at citation time and keeps aging afterwards, so its
 * condition lives in the contract, not in the styling. `stale` and
 * `gone` are the unhappy half nobody designs — a bibliography that can
 * only say "fine" is decoration.
 */
export type SourceStatus = 'ok' | 'stale' | 'gone'

export interface Source {
  readonly id: string
  readonly title: string
  /** Where it lives, in words — a collection, a path, a place. The demo
   * cites documents rather than URLs, so nothing pretends to be a link. */
  readonly location: string
  readonly sourceKind: 'document' | 'web' | 'data'
  readonly status: SourceStatus
  /** The condition in words, once status is not 'ok'. */
  readonly note: string | null
  /**
   * The locator, in words on the row: which pages of a document, how
   * many rows a query returned. `trace` underneath is the receipt — the
   * exact pages and passage, the query as it ran — serialized by the
   * host. The same legible-on-top, exact-underneath split as the tool
   * call, and the same law: no trace, no disclosure.
   */
  readonly detail: string | null
  readonly trace: string | null
}

/** The bibliography of a response, as a part — in the message, in the
 * log, in history. Inline [n] markers in the text refer to its order. */
export interface SourcesPart {
  readonly kind: 'sources'
  readonly id: string
  readonly sources: readonly Source[]
}

export type MessagePart = TextPart | ReasoningPart | ToolPart | AttachmentPart | SourcesPart

export interface Message {
  readonly id: string
  readonly role: Role
  readonly authorId: string
  readonly parts: readonly MessagePart[]
  readonly status: MessageStatus
  /** Set when status is 'refused', 'failed', or 'interrupted'. */
  readonly reason: string | null
  /**
   * The reader's verdict on a response, revocable. In the contract rather
   * than fired-and-forgotten at an analytics endpoint, because a rating
   * you cannot see or take back is not feedback, it is surveillance.
   */
  readonly feedback: 'up' | 'down' | null
  readonly createdAt: number
}

/**
 * A turn is one prompt and its response.
 *
 * `versionId` exists because every prompt is a commit: the thread is the version
 * history, so restore has to address a turn, not a separate snapshot store.
 */
export interface Turn {
  readonly id: string
  readonly index: number
  readonly versionId: string
  /**
   * Set when this turn is a RETRY of an earlier one: same words, new
   * commit. Every prompt is a commit, and a retry is not an exception to
   * that law — it is a new turn that knows its ancestor, which is exactly
   * what Version Marker + Restore will need.
   */
  readonly retryOf: string | null
  readonly prompt: Message
  readonly response: Message | null
}

export type RuntimeStatus = 'idle' | 'submitting' | 'streaming'

/**
 * Composer state, including the turn lock.
 *
 * The lock is single-writer: when anyone submits, the composer closes for
 * everyone until the response settles. `queued` is the affordance that keeps
 * being locked out from feeling dead. You can write your next prompt, you just
 * cannot send it yet.
 */
/**
 * Uploading is a STATE, not an instant. Most composers pretend attaching is
 * synchronous and then have nowhere to put the failure; this contract gives
 * the failure a home, which is what lets the interface be honest about it.
 */
export type AttachmentStatus = 'uploading' | 'ready' | 'failed'

export type AttachmentKind = 'image' | 'audio' | 'document' | 'other'

export interface ComposerAttachment {
  readonly id: string
  readonly name: string
  readonly fileKind: AttachmentKind
  readonly sizeBytes: number
  readonly status: AttachmentStatus
  /** Why it failed, when it did. Null otherwise. */
  readonly reason: string | null
}

export interface ComposerState {
  readonly text: string
  readonly locked: boolean
  readonly lockedBy: string | null
  readonly queued: string | null
  readonly attachments: readonly ComposerAttachment[]
}

/**
 * The model choice lives on the THREAD, not the composer: it applies to the
 * next turn and drives the projected cost, and it is the extension point the
 * Budget Meter grows out of.
 */
export interface ModelOption {
  readonly id: string
  readonly label: string
  /** One-line qualifier ("fastest", "best for long documents"). */
  readonly note: string | null
}

export interface ModelState {
  readonly selectedId: string
  readonly options: readonly ModelOption[]
}

/**
 * Why the composer cannot submit right now. Null means it can.
 *
 * A reason, not a boolean: a send button that merely greys out teaches
 * nothing, and "why can't I send this" is one of the questions AI interfaces
 * answer worst. One blocker at a time, most actionable first.
 */
export type SubmitBlocker =
  | 'locked'
  | 'service-down'
  | 'attachment-uploading'
  | 'attachment-failed'
  | 'empty'

export type ServiceStatus = 'operational' | 'degraded' | 'down'

/** Degraded and down are different problems and need different copy. */
export interface ServiceState {
  readonly status: ServiceStatus
  readonly message: string | null
  readonly dismissed: boolean
}

/**
 * Budget is money. Context is memory. Users conflate them; this type does not.
 */
export interface UsageState {
  readonly threadTokens: number
  readonly contextTokens: number
  readonly contextLimit: number
  readonly threadCostUsd: number
  /** Projected cost of the next turn on the selected model, before committing. */
  readonly projectedCostUsd: number | null
}

/**
 * A suggestion is a PROMPT MADE VISIBLE — one field on purpose. A chip whose
 * label differs from what it sends is a small lie at the exact moment trust
 * is being established; here what you click is what sends, verbatim. (The
 * agentic kind — chips that DO things — arrives with the Action Surface,
 * where the two are visually separated because flattening them trains
 * people to tap without reading.)
 */
export interface Suggestion {
  readonly id: string
  readonly prompt: string
  /**
   * What kind of way in this is. `ask` sends a question — turn by turn,
   * words back. `do` sends a COMMISSION — the agent goes and works.
   * Both are still only words sent verbatim (the chip itself never
   * touches a system), but flattening the two trains people to tap
   * without reading, so the type carries the split and the component
   * draws it. Omitted, the chip renders in a single unlabelled list.
   */
  readonly kind?: 'ask' | 'do'
}

export interface ThreadState {
  readonly id: string
  /** Host-supplied conversation starters, shown while the thread is empty. */
  readonly suggestions: readonly Suggestion[]
  readonly turns: readonly Turn[]
  readonly status: RuntimeStatus
  readonly composer: ComposerState
  readonly model: ModelState
  readonly service: ServiceState
  readonly usage: UsageState
  /** Turn id currently being viewed as a restored state, if any. */
  readonly restoredFrom: string | null
}
