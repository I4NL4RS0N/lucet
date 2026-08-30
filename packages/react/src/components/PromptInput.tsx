import { useId } from 'react'
import type {
  ComposerAttachment,
  ComposerState,
  ModelState,
  ServiceState,
} from 'lucet'
import { describeSubmitBlocker, submitBlocker } from 'lucet'

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
  /** The host owns file picking; the library never touches file IO. */
  onAttach?: (() => void) | undefined
  /** A response is streaming: swap send for stop. */
  streaming?: boolean
  onStop?: (() => void) | undefined
  placeholder?: string
}

function AttachmentChip({
  att,
  onRemove,
}: {
  att: ComposerAttachment
  onRemove: (id: string) => void
}) {
  return (
    <span className="lucet-prompt__att" data-status={att.status}>
      {att.status === 'uploading' ? (
        <span className="lucet-prompt__att-spin" aria-hidden />
      ) : (
        <svg className="lucet-prompt__att-icon" viewBox="0 0 24 24" aria-hidden>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
      )}
      <span className="lucet-prompt__att-name">{att.name}</span>
      {att.status === 'failed' ? (
        <span className="lucet-prompt__att-reason">{att.reason ?? 'Failed'}</span>
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
  onAttach,
  streaming = false,
  onStop,
  placeholder = 'Ask anything',
}: PromptInputProps) {
  const id = useId()
  const blocker = submitBlocker({ composer, service })
  const queued = composer.queued !== null
  const canQueue = blocker === 'locked' && onQueue !== undefined && !queued

  const trySend = () => {
    if (blocker === null) onSubmit()
    else if (canQueue && composer.text.trim()) onQueue(composer.text)
  }

  return (
    <form
      className="lucet-prompt"
      data-blocked={blocker ?? undefined}
      onSubmit={(event) => {
        event.preventDefault()
        trySend()
      }}
    >
      {composer.attachments.length > 0 ? (
        <div className="lucet-prompt__atts">
          {composer.attachments.map((att) => (
            <AttachmentChip key={att.id} att={att} onRemove={onRemoveAttachment} />
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

        {/*
         * The words, for every blocker except `empty`. An empty composer with
         * a quiet disabled button explains itself; the other four do not.
         * aria-live so the reason is announced when it appears.
         */}
        <p className="lucet-prompt__why" role="status">
          {queued
            ? 'Queued — sends when the current response finishes'
            : blocker !== null && blocker !== 'empty'
              ? describeSubmitBlocker(blocker)
              : ''}
        </p>

        {streaming && onStop ? (
          <button type="button" className="lucet-button" data-variant="secondary" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="lucet-button"
            data-variant={canQueue || queued ? 'secondary' : 'primary'}
            disabled={blocker !== null && !canQueue}
          >
            {canQueue ? 'Queue' : queued ? 'Queued' : 'Send'}
          </button>
        )}
      </div>
    </form>
  )
}
