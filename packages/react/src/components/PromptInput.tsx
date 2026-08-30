import { useId } from 'react'
import type {
  ComposerAttachment,
  ComposerState,
  ModelState,
  ServiceState,
} from 'lucet'
import { describeSubmitBlocker, submitBlocker } from 'lucet'
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
  composer: ComposerState
  model: ModelState
  service: ServiceState
  onChange: (text: string) => void
  onSubmit: () => void
  /** Called instead of onSubmit while locked. Omit it and locking simply disables send. */
  onQueue?: ((text: string) => void) | undefined
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
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </span>
  )
}

export function PromptInput({
  composer,
  model,
  service,
  onChange,
  onSubmit,
  onQueue,
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
  const blocker = submitBlocker({ composer, service })
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
    service.status === 'down'
      ? {
          tone: 'danger' as const,
          orb: 'down' as const,
          text: service.message ?? describeSubmitBlocker('service-down'),
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
              text: `${composer.lockedBy} is taking a turn in this shared thread — yours sends next`,
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
    else if (canQueue && composer.text.trim()) onQueue(composer.text)
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
              <span className="lucet-orb-row__label">{strip.text}</span>
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

        <label className="lucet-prompt__model">
          <select
            value={model.selectedId}
            onChange={(event) => onModelChange(event.target.value)}
            aria-label="Model"
          >
            {model.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {tools}

        {/*
         * Send is the arrow -- a convention every AI composer has taught.
         * Queue, Queued, and Stop KEEP THEIR WORDS: those carry semantics no
         * other tool has, and a differentiator explains itself on first
         * contact. Icons for conventions, words for novelties.
         */}
        {streaming && onStop ? (
          <span className="lucet-tipwrap">
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
      </div>
    </form>
  )
}
