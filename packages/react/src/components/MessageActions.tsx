import { useEffect, useRef, useState } from 'react'
import type { Message } from 'lucet'

/**
 * Feedback controls: what you can DO with a settled response. The positions:
 *
 * 1. NEVER POINTER-GATED. Always present in quiet ink on the latest turn —
 *    where you would actually use them — and revealed by hover OR focus on
 *    older ones. Hover-only reveal fails touch (no hover exists) and
 *    keyboard (nothing to hover with), and this library's own stage motto
 *    is "nothing hidden behind a pointer". The visibility law lives in CSS
 *    on the thread; this component is always in the tree and always
 *    reachable.
 * 2. COPY COPIES THE SOURCE. The response is markdown; copying hands you
 *    the markdown, which pastes usefully into anything that reads it and
 *    degrades to plain text everywhere else. The result is reported
 *    honestly — Copied, or Didn't copy — same contract as the code block.
 * 3. RETRY IS A COMMIT. Asking again creates a NEW turn that knows its
 *    ancestor (Turn.retryOf) — same words, new commit — because every
 *    prompt is a commit and a retry is not an exception. The affordance
 *    lives on the response (the thing that disappointed), but the act
 *    resubmits the prompt.
 * 4. FEEDBACK IS VISIBLE AND REVOCABLE. The verdict sits in the contract
 *    (Message.feedback), shows as a pressed state, and taps off again —
 *    a rating you cannot see or take back is not feedback, it is
 *    surveillance.
 *
 * Not here yet: a timestamp (needs a ticking clock the contract does not
 * carry), and "copy as plain text" (the markdown position covers the
 * common case; revisit on real demand).
 */

export interface MessageActionsProps {
  message: Message
  onRetry?: (() => void) | undefined
  onFeedback?: ((verdict: 'up' | 'down' | null) => void) | undefined
  /** Present only where restoring MEANS something: a settled, non-latest
      turn, outside an existing restored view. The thread decides; this
      component just draws what it is given. */
  onRestore?: (() => void) | undefined
}

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_WORDS: Record<CopyState, string> = {
  idle: 'Copy',
  copied: 'Copied',
  failed: 'Didn’t copy',
}

export function MessageActions({ message, onRetry, onFeedback, onRestore }: MessageActionsProps) {
  const [copy, setCopy] = useState<CopyState>('idle')
  /* The pop fires on RECORDING a verdict, never on retracting one: giving
     feedback is a small moment; taking it back is quiet housekeeping. */
  const [pop, setPop] = useState<'up' | 'down' | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const settleCopy = (next: CopyState) => {
    setCopy(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopy('idle'), 1800)
  }

  const source = message.parts
    .flatMap((p) => (p.kind === 'text' ? [p.text] : []))
    .join('\n\n')

  return (
    <div className="lucet-actions" role="group" aria-label="Response actions">
      <button
        type="button"
        className="lucet-actions__btn"
        data-state={copy}
        onClick={() => {
          navigator.clipboard
            .writeText(source)
            .then(() => settleCopy('copied'))
            .catch(() => settleCopy('failed'))
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          {copy === 'copied' ? (
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          ) : (
            <>
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V6a2 2 0 0 1 2-2h9" />
            </>
          )}
        </svg>
        <span aria-live="polite" className="lucet-visually-hidden">
          {COPY_WORDS[copy]}
        </span>
        <span aria-hidden>{COPY_WORDS[copy]}</span>
      </button>

      {onRetry ? (
        <button type="button" className="lucet-actions__btn" onClick={() => onRetry()}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 12a8 8 0 1 1 2.4 5.7M4 20v-4h4" />
          </svg>
          Ask again
        </button>
      ) : null}

      {onRestore ? (
        <button type="button" className="lucet-actions__btn" onClick={onRestore}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 8v4l2.6 1.6M20.5 12a8.5 8.5 0 1 1-2.5-6M20.5 3.5V6H18" />
          </svg>
          Restore
        </button>
      ) : null}

      {onFeedback ? (
        <>
          <button
            type="button"
            className="lucet-actions__btn lucet-actions__btn--icon"
            aria-label="Helpful"
            aria-pressed={message.feedback === 'up'}
            data-pop={pop === 'up' || undefined}
            onAnimationEnd={() => setPop(null)}
            onClick={() => {
              const next = message.feedback === 'up' ? null : 'up'
              onFeedback(next)
              if (next) setPop('up')
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M7 10v11M7 11l4.2-7.3a2 2 0 0 1 3.7 1.4L14 10h4.6a2 2 0 0 1 2 2.4l-1.4 6.5a2.5 2.5 0 0 1-2.4 2.1H7" />
            </svg>
          </button>
          <button
            type="button"
            className="lucet-actions__btn lucet-actions__btn--icon"
            aria-label="Not helpful"
            aria-pressed={message.feedback === 'down'}
            data-pop={pop === 'down' || undefined}
            onAnimationEnd={() => setPop(null)}
            onClick={() => {
              const next = message.feedback === 'down' ? null : 'down'
              onFeedback(next)
              if (next) setPop('down')
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M17 14V3M17 13l-4.2 7.3a2 2 0 0 1-3.7-1.4L10 14H5.4a2 2 0 0 1-2-2.4l1.4-6.5A2.5 2.5 0 0 1 7.2 3H17" />
            </svg>
          </button>
        </>
      ) : null}
    </div>
  )
}
