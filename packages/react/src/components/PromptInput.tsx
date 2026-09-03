import { useId, useRef } from 'react'
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
type FileCategory = 'doc' | 'table' | 'image' | 'video' | 'audio' | 'archive' | 'code'

const EXT_CATEGORY: Record<string, FileCategory> = {
  pdf: 'doc', doc: 'doc', docx: 'doc', txt: 'doc', rtf: 'doc', md: 'doc', pages: 'doc',
  xls: 'table', xlsx: 'table', csv: 'table', tsv: 'table', numbers: 'table',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', heic: 'image',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', flac: 'audio',
  zip: 'archive', tar: 'archive', gz: 'archive', rar: 'archive', '7z': 'archive',
  js: 'code', ts: 'code', tsx: 'code', jsx: 'code', py: 'code', json: 'code',
  html: 'code', css: 'code', sh: 'code', yaml: 'code', yml: 'code',
}

/** base + extension, split so the extension can survive truncation. */
function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

function categoryOf(att: ComposerAttachment): FileCategory {
  const { ext } = splitName(att.name)
  const byExt = EXT_CATEGORY[ext.slice(1).toLowerCase()]
  if (byExt) return byExt
  if (att.fileKind === 'image') return 'image'
  if (att.fileKind === 'audio') return 'audio'
  return 'doc'
}

const FILE_GLYPHS: Record<FileCategory, React.ReactNode> = {
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  table: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 11h16M10 5v14" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M4 16l5-4 4 3 3-2 4 3" />
    </>
  ),
  video: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M10 9.5v5l4.5-2.5z" />
    </>
  ),
  audio: <path d="M5 10v4M9 7v10M13 5v14M17 9v6M21 11v2" />,
  archive: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M12 5v3m0 2v1m0 2v1" />
    </>
  ),
  code: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />,
}

function AttachmentChip({
  att,
  onRemove,
  onRetry,
}: {
  att: ComposerAttachment
  onRemove: (id: string) => void
  onRetry?: ((id: string) => void) | undefined
}) {
  const { base, ext } = splitName(att.name)
  return (
    <span className="lucet-prompt__att" data-status={att.status}>
      {att.status === 'uploading' ? (
        <span className="lucet-prompt__att-spin" aria-hidden />
      ) : (
        <svg className="lucet-prompt__att-icon" viewBox="0 0 24 24" aria-hidden>
          {FILE_GLYPHS[categoryOf(att)]}
        </svg>
      )}
      {/* The base truncates; the extension NEVER does. A chip that reads
          "quarterly-repo…" tells you less than one that reads "quarterl….pdf". */}
      <span className="lucet-prompt__att-name" title={att.name}>
        <span className="lucet-prompt__att-base">{base}</span>
        <span className="lucet-prompt__att-ext">{ext}</span>
      </span>
      {att.status === 'failed' ? (
        <span className="lucet-prompt__att-reason">{att.reason ?? 'Didn’t upload'}</span>
      ) : null}
      {/* The actions are one group, a spacing token apart, so each 24px
          hit target is its own. The two glyphs are drawn to the same
          optical size: an arc reads smaller than its box and a cross
          larger, so the cross is drawn a shade smaller than the arc. */}
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
          onClick={() => onRemove(att.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" />
          </svg>
        </button>
      </span>
    </span>
  )
}

export function PromptInput({
  restoredFrom,
  scope,
  onScopeChange,
  onScopeUpdate,
  composer,
  model,
  service,
  usage,
  onChange,
  onSubmit,
  onQueue,
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
            tone: 'info' as const,
            orb: 'queued' as const,
            text: 'Queued — yours sends next',
          }
        : lockedByOther
          ? {
              tone: 'neutral' as const,
              who: composer.lockedBy!,
              text: `${composer.lockedBy} is taking a turn — yours sends next`,
            }
          : streaming
            ? {
                // Plain words only: "Stop keeps what has already arrived"
                // read as a riddle. That stopping preserves the partial
                // response is a convention every AI tool has taught, and
                // conventions do not need explaining -- novelties do.
                tone: 'neutral' as const,
                orb: 'composing' as const,
                text: 'Writing a response…',
              }
            : composer.locked
              ? {
                  tone: 'neutral' as const,
                  orb: 'thinking' as const,
                  text: 'Sending…',
                }
              : blocker === 'attachment-failed'
                ? {
                    // Caution, not danger: the chip already wears the red for
                    // the OBJECT that failed; the strip is the instruction,
                    // and it sits directly above the chip it points at.
                    tone: 'caution' as const,
                    icon: 'failed' as const,
                    text: describeSubmitBlocker('attachment-failed'),
                  }
                : blocker === 'attachment-uploading'
                  ? {
                      tone: 'neutral' as const,
                      spin: true,
                      text: describeSubmitBlocker('attachment-uploading'),
                    }
                  : null

  const trySend = () => {
    if (blocker === null) onSubmit()
    else if (canQueue && composer.text.trim()) {
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
          ) : (
            <ActivityOrb state={strip.orb} label={strip.text} />
          )}
        </div>
      ) : null}

      {composer.attachments.length > 0 ? (
        <div className="lucet-prompt__atts">
          {composer.attachments.map((att) => (
            <AttachmentChip key={att.id} att={att} onRemove={onRemoveAttachment} onRetry={onRetryAttachment} />
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
          <button
            type="button"
            className="lucet-prompt__tool"
            aria-label="Attach a file"
            onClick={onAttach}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M21 12.5l-8.2 8.2a5.5 5.5 0 0 1-7.8-7.8L13.5 4.4a3.67 3.67 0 0 1 5.2 5.2L10.5 17.8a1.83 1.83 0 0 1-2.6-2.6l7.8-7.8" />
            </svg>
          </button>
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
        <span className="lucet-prompt__actions">
          {/* While a response streams, a typed draft gets its Queue button
              BESIDE Stop. Without it the keyboard could queue and the pointer
              could not -- an affordance for a novel semantic has to be
              visible, not implied. */}
          {streaming && canQueue && composer.text.trim() ? (
            <button type="submit" className="lucet-button" data-variant="secondary">
              Queue
            </button>
          ) : null}
          {streaming && onStop ? (
            <span className="lucet-tipwrap" data-tip-align="end">
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
              disabled={!canQueue}
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
    </form>
  )
}
