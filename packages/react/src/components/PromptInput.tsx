import { useId, useRef, useEffect, useState } from 'react'
import { FILE_GLYPHS, categoryOf, formatBytes, splitName } from './attachment-glyphs.js'
import type {
  ComposerAttachment,
  ComposerState,
  ModelState,
  ServiceState,
  UsageState,
} from 'lucet-core'
import { describeSubmitBlocker, submitBlocker } from 'lucet-core'
import type { ScopeState } from 'lucet-core'
import { ScopeControl } from './ScopeControl.js'
import { BudgetMeter } from './BudgetMeter.js'
import { ActivityOrb } from './ActivityOrb.js'
import { Avatar } from './Avatar.js'
import { StateIcon } from './StateIcon.js'

/**
 * The prompt input, rendered FROM the contract.
 *
 * This component owns no state: it draws ComposerState + ModelState and
 * reports intent. Everything that makes it interesting -- the turn lock, the
 * queue, attachment failure, the submit blockers -- lives in `lucet` core and
 * is tested there without a DOM. See docs/components/prompt-input.md.
 *
 * Three renderings this gets right that most composers skip:
 *
 * 1. The DISABLED SEND SAYS WHY. submitBlocker() gives one reason at a time;
 *    the words render beside the button for every blocker except `empty`,
 *    which is self-evident and would otherwise nag every blank composer.
 * 2. LOCKED IS NOT DEAD. While a response is in flight the field stays
 *    writable and the send button becomes QUEUE -- your prompt goes as soon
 *    as the turn frees. Queued is shown as a settled fact, not a spinner.
 * 3. UPLOADING IS A STATE. Chips render uploading, ready, and failed
 *    distinctly, a failed chip carries its reason, and a failed chip blocks
 *    sending until removed rather than being silently dropped.
 */

export interface PromptInputProps {
  /** The restored-view flag: while set, submitting is blocked with words
      that say why (the past does not take new commits). */
  restoredFrom?: string | null | undefined
  /** The scope ladder, when the host has one. Renders nothing without
      levels — the toggle is the config. */
  scope?: ScopeState | undefined
  onScopeChange?: ((levelId: string) => void) | undefined
  /** The held page change (round 05 P2): Use new page (true) or Keep previous page (false). */
  onScopeUpdate?: ((useNewPage: boolean) => void) | undefined
  /** The page on screen chosen from the scope picker while the scope was pinned elsewhere. */
  onScopeRebind?: ((levelId: string) => void) | undefined
  composer: ComposerState
  model: ModelState
  service: ServiceState
  /** Prices the picker and arms the budget blocker. Omit it and the model
      control is a plain priced picker with no ledger. */
  usage?: UsageState | undefined
  onChange: (text: string) => void
  onSubmit: () => void
  /** Called instead of onSubmit while locked. Omit it and locking simply disables send. */
  onQueue?: ((text: string) => void) | undefined
  /** Take the queued message back (component audit 06): Cancel queue drops
      it; Edit returns its words to the field first, then drops it. */
  onDequeue?: (() => void) | undefined
  /** Cancel queue (component audit 07): drops the queued words AND their
      files. Absent, Cancel falls back to onDequeue and the files return to
      the staging row. */
  onCancelQueue?: (() => void) | undefined
  /** THE HOLD (round 06): Send at the month's threshold opened the meter's
      panel; Continue there sends the held words. */
  onConfirmSpend?: (() => void) | undefined
  /** The panel closed on the hold without a decision. */
  onDismissIntercept?: (() => void) | undefined
  onModelChange: (modelId: string) => void
  onRemoveAttachment: (id: string) => void
  /** Try a failed upload again. The person still has the file; "remove it"
      was never the only honest answer. */
  onRetryAttachment?: ((id: string) => void) | undefined
  /** The host owns file picking; the library never touches file IO. */
  onAttach?: (() => void) | undefined
  /**
   * Extra controls after the model picker (a scope selector, a mic). The bar
   * deliberately holds few things; when scope control lands, anything beyond
   * attach + model + scope collapses into an overflow menu built on the menu
   * recipe -- see the rationale doc.
   */
  tools?: React.ReactNode
  /**
   * Who is at THIS keyboard, matched against composer.lockedBy. In a
   * multiplayer thread the lock is usually someone else's turn, and the strip
   * shows the person; without selfId every lock reads as anonymous machinery.
   */
  selfId?: string | undefined
  /** A response is streaming: swap send for stop. */
  streaming?: boolean
  onStop?: (() => void) | undefined
  placeholder?: string
}

/*
 * File-type icons, by CATEGORY, not by brand. At 13px, pdf-vs-docx can only
 * be told apart with vendor colours, which would be the loudest thing in the
 * composer; the category gives a readable silhouette and the EXTENSION gives
 * the precise format -- which is why truncation below always preserves it.
 */
function AttachmentChip({
  att,
  onRemove,
  onRetry,
  readOnly = false,
}: {
  att: ComposerAttachment
  onRemove?: ((id: string) => void) | undefined
  onRetry?: ((id: string) => void) | undefined
  /** The queued item's chips (component audit 07): the same face, no
      trailing actions — a queued file changes only through Edit. */
  readOnly?: boolean
}) {
  const { base, ext } = splitName(att.name)
  return (
    <span className="lucet-prompt__att" data-status={att.status} data-id={att.id} data-readonly={readOnly || undefined}>
      {att.status === 'uploading' ? (
        <span className="lucet-prompt__att-spin" aria-hidden />
      ) : (
        <svg className="lucet-prompt__att-icon" viewBox="0 0 24 24" aria-hidden>
          {FILE_GLYPHS[categoryOf(att.name, att.fileKind)]}
        </svg>
      )}
      {/* The base truncates; the extension NEVER does. A chip that reads
          "quarterly-repo…" tells you less than one that reads "quarterl….pdf".
          The whole name and the size live in the library's own tip, not the
          browser's (component audit 07). */}
      <span className="lucet-tipwrap lucet-prompt__att-namewrap">
        <span className="lucet-prompt__att-name">
          <span className="lucet-prompt__att-base">{base}</span>
          <span className="lucet-prompt__att-ext">{ext}</span>
        </span>
        <span className="lucet-tip" aria-hidden>
          {att.name} · {formatBytes(att.sizeBytes)}
        </span>
      </span>
      {/* The state in a word, so the ring alone never has to carry it: a
          still ring under reduced motion still says "Uploading…". */}
      {att.status === 'uploading' ? <span className="lucet-prompt__att-reason">Uploading…</span> : null}
      {att.status === 'failed' ? (
        <span className="lucet-prompt__att-reason">{att.reason ?? 'Didn’t upload'}</span>
      ) : null}
      {readOnly ? null : (
        /* The actions are one group, a spacing token apart, so each hit
           target is its own. The two glyphs are drawn to the same optical
           size: an arc reads smaller than its box and a cross larger, so
           the cross is drawn a shade smaller than the arc. */
        <span className="lucet-prompt__att-actions">
          {att.status === 'failed' && onRetry ? (
            <button
              type="button"
              className="lucet-prompt__att-remove"
              aria-label={`Try uploading ${att.name} again`}
              onClick={() => onRetry(att.id)}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            className="lucet-prompt__att-remove"
            aria-label={`Remove ${att.name}`}
            onClick={() => onRemove?.(att.id)}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" />
            </svg>
          </button>
        </span>
      )}
    </span>
  )
}

export function PromptInput({
  restoredFrom,
  scope,
  onScopeChange,
  onScopeUpdate,
  onScopeRebind,
  composer,
  model,
  service,
  usage,
  onChange,
  onSubmit,
  onQueue,
  onDequeue,
  onCancelQueue,
  onConfirmSpend,
  onDismissIntercept,
  onModelChange,
  onRemoveAttachment,
  onRetryAttachment,
  onAttach,
  tools,
  selfId,
  streaming = false,
  onStop,
  placeholder = 'Ask anything',
}: PromptInputProps) {
  const id = useId()
  const sendRef = useRef<HTMLButtonElement | null>(null)
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)
  const blocker = submitBlocker({ composer, service, restoredFrom, usage })
  /* OWNERSHIP, SAID ONCE (component audit 06). A queued message that leaves
     the queue for the thread is spoken as one sentence at the handoff; Edit
     and Cancel queue confirm themselves the same way. The strip is a status
     region too, so its copy changes are heard as they happen. */
  const [said, setSaid] = useState('')
  const wasQueued = useRef(false)
  useEffect(() => {
    if (composer.queued !== null) wasQueued.current = true
  }, [composer.queued])
  const ownRun = composer.locked && composer.lockedBy !== null && composer.lockedBy === (selfId ?? null)
  useEffect(() => {
    if (wasQueued.current && composer.queued === null && ownRun) {
      setSaid('Your queued message was sent — responding to you.')
      wasQueued.current = false
    }
  }, [composer.queued, ownRun])
  /* Spoken sentences do not outlive the state they described: once nothing
     is locked or queued the region empties, so a reset leaves no stale
     announcement behind (clearing announces nothing). */
  useEffect(() => {
    if (!composer.locked && composer.queued === null) setSaid('')
  }, [composer.locked, composer.queued])
  /* The Stop tooltip arms only after the pointer MOVES over it: a pointer
     resting where Queued sat must not raise a tip on the Stop that mounts
     there at the handoff (component audit 06). */
  const [stopArmed, setStopArmed] = useState(false)
  useEffect(() => {
    setStopArmed(false)
  }, [streaming])
  /* THE WALL HAS NO EXIT (component audit 03, independent verification).
     A spent month is an account state: it outlives the thread and no model
     can produce an allowed send, so a "New thread" verb here promised a
     way out that the ledger does not have — and the Konfabulator wired it
     to the demo's re-seed, which made the cap look thread-scoped. The
     strip states the wall and exactly when it lifts; the picker stays
     readable so the ledger explains it; nothing offers to spend. */
  const queued = composer.queued !== null
  const canQueue = blocker === 'locked' && onQueue !== undefined && !queued

  /*
   * The strip: locked, queued, and down get the top of the surface, a tone,
   * and a MARK -- as a grey line beside the button these were honestly
   * invisible. One strip at a time, most severe first. Attachment blockers
   * stay by the button, where the chips are.
   *
   * The mark is chosen for what the wait actually is. Locked by ANOTHER
   * PERSON shows their avatar, because multiplayer is the part nobody
   * expects from an AI composer and a face is the clearest possible
   * statement of it; the copy names the shared thread outright. Locked by
   * you (your own response running) is machine work, so it gets the working
   * orb. Queued and down keep their orbs from the not-working set.
   */
  const lockedByOther =
    composer.locked && composer.lockedBy !== null && composer.lockedBy !== (selfId ?? null)
  /* Compact ownership copy names the person by first name (component audit
     07, rider A); the avatar and the thread carry the full name. */
  const ownerFirst = composer.lockedBy?.split(/\s+/)[0] ?? composer.lockedBy
  /* A file still uploading or failed holds Queue exactly as it holds Send
     (component audit 07): nothing queues that could drop silently at the
     handoff. The chip says which file; the strip and the seat say why. */
  const uploadingFiles = composer.attachments.filter((a) => a.status === 'uploading')
  const failedFiles = composer.attachments.filter((a) => a.status === 'failed')
  const queueBlock = uploadingFiles.length > 0 ? ('uploading' as const) : failedFiles.length > 0 ? ('failed' as const) : null
  const attachRef = useRef<HTMLButtonElement | null>(null)
  /* The Attach tip arms like Stop's (round 06): it shows once the pointer
     has MOVED over the control, and a click disarms it, so the tip never
     lingers over the field after the file picker closes. Keyboard focus
     shows it as always. */
  const [attachArmed, setAttachArmed] = useState(false)
  const strip =
    blocker === 'restored'
      ? {
          /* Above even the outage in the chain, matching the selector's
             precedence: you are looking at the PAST, and no amount of
             service health changes what that means for the send button. */
          tone: 'info' as const,
          icon: 'operational' as const,
          text: describeSubmitBlocker('restored'),
        }
      : service.status === 'down'
      ? {
          /* THE CURRENT CONDITION, QUIETLY (round 05, P1): the strip is the
             system's state, tinted caution; the turn's ending keeps danger
             as the record of what happened to that request. Two levels,
             no repeated wording. */
          tone: 'caution' as const,
          orb: 'down' as const,
          text: service.message ?? describeSubmitBlocker('service-down'),
        }
      : blocker === 'budget'
      ? {
          /* Caution, not danger: nothing failed. A limit arrived, the way
             limits do -- mid-conversation -- and the strip says what it
             means for the send button, exactly when it lifts, and the one
             exit that will not fail again (round 05, P1). */
          tone: 'caution' as const,
          icon: 'rate-limited' as const,
          text: describeSubmitBlocker('budget'),
          resetAt: usage?.monthlyResetAt ?? null,
        }
      : queued
        ? {
            /* THE QUEUED ITEM (component audit 06): whose turn it follows,
               the words themselves, and two ways to take them back. */
            tone: 'info' as const,
            orb: 'queued' as const,
            text: lockedByOther ? `Queued after ${ownerFirst} — yours sends next` : 'Queued — sends after this response',
            queuedText: composer.queued!,
          }
        : lockedByOther
          ? {
              /* STATE-SPECIFIC OWNERSHIP COPY (component audit 06): who asked,
                 what the assistant is doing, and what the person here can do
                 — never "yours sends next" before anything is queued. */
              tone: 'neutral' as const,
              who: composer.lockedBy!,
              text:
                queueBlock === 'uploading'
                  ? `Responding to ${ownerFirst} — Queue sends once your upload finishes`
                  : queueBlock === 'failed'
                    ? `Responding to ${ownerFirst} — ${failedFiles[0]!.name} didn’t upload; try again or remove it to queue`
                    : composer.text.trim()
                      ? `Responding to ${ownerFirst} — Queue sends after this response`
                      : `Responding to ${ownerFirst} — you can queue a message`,
            }
          : streaming
            ? {
                // Plain words only: "Stop keeps what has already arrived"
                // read as a riddle. That stopping preserves the partial
                // response is a convention every AI tool has taught, and
                // conventions do not need explaining -- novelties do. The
                // owner is named (component audit 06): in a shared thread
                // "Writing a response…" said nothing about whose.
                tone: 'neutral' as const,
                orb: 'composing' as const,
                text: 'Responding to you',
              }
            : composer.locked
              ? {
                  tone: 'neutral' as const,
                  orb: 'thinking' as const,
                  text: wasQueued.current ? 'Sending your queued message' : 'Sending…',
                }
              : blocker === 'attachment-failed'
                ? {
                    // Caution, not danger: the chip already wears the red for
                    // the OBJECT that failed; the strip is the instruction,
                    // and it sits directly above the chip it points at.
                    tone: 'caution' as const,
                    icon: 'failed' as const,
                    /* Exactly which file blocks the send, and what to do
                       (component audit 07). */
                    text:
                      failedFiles.length === 1
                        ? `${failedFiles[0]!.name} didn’t upload — try again or remove it`
                        : `${failedFiles.length} attachments didn’t upload — try again or remove them`,
                  }
                : blocker === 'attachment-uploading'
                  ? {
                      tone: 'neutral' as const,
                      spin: true,
                      text:
                        uploadingFiles.length === 1
                          ? `Uploading ${uploadingFiles[0]!.name}…`
                          : `Uploading ${uploadingFiles.length} attachments…`,
                    }
                  : null

  /* Edit returns the queued words to the field BEFORE the queue lets go
     (component audit 06): nothing is ever un-lodged into thin air. A newer
     draft already in the field keeps its place after them. */
  const editQueued = () => {
    const words = composer.queued
    if (words === null) return
    const draft = composer.text
    onChange(draft.trim() ? `${words}\n\n${draft}` : words)
    onDequeue?.()
    setSaid(
      composer.queuedAttachments.length > 0
        ? 'Queued message and its files returned to the field.'
        : 'Queued message returned to the field.',
    )
    requestAnimationFrame(() => {
      const field = fieldRef.current
      if (!field) return
      field.focus()
      field.setSelectionRange(words.length, words.length)
    })
  }
  const cancelQueued = () => {
    const files = composer.queuedAttachments.length
    ;(onCancelQueue ?? onDequeue)?.()
    setSaid(files > 0 && onCancelQueue ? 'Queued message and its files cancelled.' : 'Queued message cancelled.')
    requestAnimationFrame(() => fieldRef.current?.focus())
  }
  /* Removing a chip unmounts its buttons, so focus is placed before the file
     goes (component audit 07): the next file's action, else the previous
     file's, else Attach. The draft and its selection are untouched. Retry
     swaps the retry glyph for the ring, so focus moves to the chip's Remove,
     which every state keeps. Each act is spoken once. */
  const chipsOf = () => [...(fieldRef.current?.closest('.lucet-prompt')?.querySelectorAll<HTMLElement>('.lucet-prompt__atts .lucet-prompt__att') ?? [])]
  const removeAttachment = (id: string) => {
    const chips = chipsOf()
    const at = chips.findIndex((c) => c.dataset.id === id)
    const next =
      chips[at + 1]?.querySelector<HTMLButtonElement>('button') ??
      [...(chips[at - 1]?.querySelectorAll<HTMLButtonElement>('button') ?? [])].at(-1) ??
      attachRef.current ??
      fieldRef.current
    const name = composer.attachments.find((a) => a.id === id)?.name
    onRemoveAttachment(id)
    setSaid(name ? `Removed ${name}.` : 'Attachment removed.')
    requestAnimationFrame(() => next?.focus())
  }
  const retryAttachment = onRetryAttachment
    ? (id: string) => {
        const chip = chipsOf().find((c) => c.dataset.id === id)
        const name = composer.attachments.find((a) => a.id === id)?.name
        onRetryAttachment(id)
        setSaid(name ? `Trying ${name} again.` : 'Trying the upload again.')
        requestAnimationFrame(() => chip?.querySelector<HTMLButtonElement>('button[aria-label^="Remove"]')?.focus())
      }
    : undefined
  const trySend = () => {
    if (blocker === null) onSubmit()
    else if (canQueue && composer.text.trim() && queueBlock === null) {
      onQueue(composer.text)
      /* Queueing empties the field and the Queue button leaves with the
         words, so a pointer press on it would drop focus to the page.
         The field is where the next words go (composer audit, round 01). */
      fieldRef.current?.focus()
    }
  }

  return (
    <form
      className="lucet-prompt"
      data-blocked={blocker ?? undefined}
      aria-busy={streaming || undefined}
      onSubmit={(event) => {
        event.preventDefault()
        trySend()
      }}
    >
      {strip ? (
        <div className="lucet-prompt__status" data-tone={strip.tone} role="status">
          {'who' in strip ? (
            <span className="lucet-orb-row">
              {/* Solid, because the default avatar is drawn in the strip's own
                  background colour -- an invisible chip, the border==input
                  collapse in miniature. The person holding the floor IS the
                  emphasis of this strip. */}
              <Avatar name={strip.who} size="sm" solid />
              <span className="lucet-orb-row__label">{strip.text}</span>
            </span>
          ) : 'icon' in strip ? (
            <span className="lucet-orb-row">
              <StateIcon name={strip.icon} />
              <span className="lucet-orb-row__label">
                {strip.text}
                {'resetAt' in strip && strip.resetAt !== null ? (
                  /* The sentence already says "until it resets"; the clock
                     time completes it: "…until it resets on Sep 5 at 01:41." */
                  <>
                    {' on '}
                    <time className="lucet-prompt__at" dateTime={new Date(strip.resetAt).toISOString()}>
                      {`${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(strip.resetAt))} at ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(strip.resetAt))}`}
                    </time>
                    .
                  </>
                ) : null}
              </span>
            </span>
          ) : 'spin' in strip ? (
            <span className="lucet-orb-row">
              <span className="lucet-prompt__att-spin" aria-hidden />
              <span className="lucet-orb-row__label">{strip.text}</span>
            </span>
          ) : 'queuedText' in strip ? (
            /* THE QUEUED ITEM (component audit 06): the status line, then the
               words that wait, then Edit and Cancel queue — one stack. */
            <span className="lucet-prompt__queued-stack">
              <ActivityOrb state={strip.orb} label={strip.text} />
              <span className="lucet-prompt__queued">
                <span className="lucet-prompt__queued-text">{strip.queuedText}</span>
                {composer.queuedAttachments.length > 0 ? (
                  /* The files travel with the words (component audit 07): shown
                     inside the queued item, read-only — Edit brings them back. */
                  <span className="lucet-prompt__queued-atts">
                    {composer.queuedAttachments.map((att) => (
                      <AttachmentChip key={att.id} att={att} readOnly />
                    ))}
                  </span>
                ) : null}
                <span className="lucet-prompt__queued-actions">
                  <button type="button" className="lucet-button" data-variant="ghost" onClick={editQueued}>
                    Edit
                  </button>
                  <button type="button" className="lucet-button" data-variant="ghost" onClick={cancelQueued}>
                    Cancel queue
                  </button>
                </span>
              </span>
            </span>
          ) : (
            <ActivityOrb state={strip.orb} label={strip.text} />
          )}
        </div>
      ) : null}

      {composer.attachments.length > 0 ? (
        <div className="lucet-prompt__atts">
          {composer.attachments.map((att) => (
            <AttachmentChip key={att.id} att={att} onRemove={removeAttachment} onRetry={retryAttachment} />
          ))}
        </div>
      ) : null}

      <label className="lucet-visually-hidden" htmlFor={id}>
        Prompt
      </label>
      <textarea
        id={id}
        ref={fieldRef}
        className="lucet-prompt__field"
        rows={1}
        value={composer.text}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            trySend()
          }
        }}
      />

      <div className="lucet-prompt__bar">
        {onAttach ? (
          /* The paperclip says what it does in a tip as well as its name
             (component audit 07); the tip is visual only — the name already
             says it to the reader. */
          <span
            className="lucet-tipwrap lucet-tipwrap--keyboard"
            data-arm=""
            data-armed={attachArmed || undefined}
            onPointerMove={() => setAttachArmed(true)}
            onPointerLeave={() => setAttachArmed(false)}
          >
            <button
              ref={attachRef}
              type="button"
              className="lucet-prompt__tool"
              aria-label="Attach a file"
              onClick={() => {
                setAttachArmed(false)
                onAttach()
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M21 12.5l-8.2 8.2a5.5 5.5 0 0 1-7.8-7.8L13.5 4.4a3.67 3.67 0 0 1 5.2 5.2L10.5 17.8a1.83 1.83 0 0 1-2.6-2.6l7.8-7.8" />
              </svg>
            </button>
            <span className="lucet-tip" aria-hidden>
              Attach a file
            </span>
          </span>
        ) : null}

        {scope && onScopeChange ? (
          <ScopeControl
            scope={scope}
            onChange={onScopeChange}
            /* After either decision the controls unmount; focus goes back to
               the field with its selection intact (component audit 04) —
               the draft is what the decision was about. */
            onUpdate={
              onScopeUpdate
                ? (useNewPage) => {
                    const el = fieldRef.current
                    const range: [number, number] | null = el ? [el.selectionStart ?? 0, el.selectionEnd ?? 0] : null
                    onScopeUpdate(useNewPage)
                    requestAnimationFrame(() => {
                      const field = fieldRef.current
                      if (!field) return
                      field.focus()
                      if (range) field.setSelectionRange(range[0], range[1])
                    })
                  }
                : undefined
            }
            onRebind={onScopeRebind}
            disabled={composer.locked}
          />
        ) : null}

        {/* The picker grew into the meter (the extension point core reserved):
            one control owns the spending decision — model, projected price,
            and the month it lands in. */}
        <BudgetMeter
          model={model}
          onChange={onModelChange}
          usage={usage}
          composerText={composer.text}
          disabled={composer.locked}
          intercept={composer.intercept}
          /* Focus goes back where the decision leaves the person: to Send
             after the cheaper model (they confirm) or a dismissal (nothing
             happened); to the field after Continue (the words went). */
          onReroute={(modelId) => {
            onModelChange(modelId)
            requestAnimationFrame(() => sendRef.current?.focus())
          }}
          onDismiss={() => {
            onDismissIntercept?.()
            requestAnimationFrame(() => sendRef.current?.focus())
          }}
          onConfirm={() => {
            onConfirmSpend?.()
            requestAnimationFrame(() => fieldRef.current?.focus())
          }}
        />

        {tools}

        {/*
         * Send is the arrow -- a convention every AI composer has taught.
         * Queue, Queued, and Stop KEEP THEIR WORDS: those carry semantics no
         * other tool has, and a differentiator explains itself on first
         * contact. Icons for conventions, words for novelties.
         */}
        <span
          className="lucet-prompt__actions"
          /* A press that lands anywhere but a live button — the group itself,
             a tip wrapper, or the spot where a disabled seat sits (disabled
             seats pass the pointer through, so the second click of a double
             click on Queue arrives here once Queue has become Queued) — must
             not pull focus out of the field (component audit 06). */
          onMouseDown={(e) => {
            const target = e.target as HTMLElement
            if (!(target instanceof HTMLButtonElement) || target.disabled) e.preventDefault()
          }}
        >
          {/* While a response streams, a typed draft gets its Queue button
              BESIDE Stop. Without it the keyboard could queue and the pointer
              could not -- an affordance for a novel semantic has to be
              visible, not implied. */}
          {/* ONLY THE OWNER STOPS THEIR RUN (component audit 06): while
              another person's turn runs, the seat holds Queue — disabled
              until there are words — never a Stop that would end their
              work. Your own run keeps Stop, with Queue beside it when a
              draft is typed. */}
          {streaming && ownRun && canQueue && composer.text.trim() && queueBlock === null ? (
            <button type="submit" className="lucet-button" data-variant="secondary">
              Queue
            </button>
          ) : null}
          {streaming && ownRun && onStop ? (
            <span
              className="lucet-tipwrap"
              data-tip-align="end"
              data-arm=""
              data-armed={stopArmed || undefined}
              onPointerMove={() => setStopArmed(true)}
              onPointerLeave={() => setStopArmed(false)}
            >
              <button
                type="button"
                className="lucet-button"
                data-variant="secondary"
                aria-describedby={`${id}-stop-tip`}
                onClick={onStop}
              >
                Stop
              </button>
              <span className="lucet-tip" role="tooltip" id={`${id}-stop-tip`}>
                Stops the response. What’s written so far stays.
              </span>
            </span>
          ) : canQueue || queued ? (
            <button
              type="submit"
              className="lucet-button"
              data-variant="secondary"
              disabled={!canQueue || !composer.text.trim() || queueBlock !== null}
              aria-label={
                canQueue
                  ? queueBlock === 'uploading'
                    ? 'Queue — waits for your upload to finish'
                    : queueBlock === 'failed'
                      ? 'Queue — try the failed upload again or remove it first'
                      : lockedByOther
                        ? `Queue — sends after ${ownerFirst}’s response`
                        : 'Queue — sends after this response'
                  : 'Queued'
              }
            >
              {canQueue ? 'Queue' : 'Queued'}
            </button>
          ) : (
            <button
              ref={sendRef}
              type="submit"
              className="lucet-button"
              data-variant="primary"
              data-icon="true"
              aria-label="Send"
              disabled={blocker !== null}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
          )}
        </span>
      </div>
      {/* Edit, Cancel queue and the handoff, spoken once each (component audit 06). */}
      <span className="lucet-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {said}
      </span>
    </form>
  )
}
