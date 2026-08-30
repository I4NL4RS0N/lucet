import { useEffect, useRef, useState } from 'react'

/**
 * A code block, with copy. Two positions:
 *
 * 1. COPY WAITS FOR THE FENCE TO CLOSE. Offering to copy a half-arrived
 *    snippet is a footgun — you paste broken code. While the block is still
 *    streaming the bar says "writing…" instead; the button appears when the
 *    code is whole. (A stream that was STOPPED mid-block settles with the
 *    fence unclosed: the button appears then too, because what arrived is
 *    kept and belongs to you.)
 * 2. NO SYNTAX COLOURING, deliberately. A highlighter is a rendering opinion
 *    a host can layer on; the library's job is the chrome — the surface,
 *    the language label, the copy affordance, keyboard-reachable overflow —
 *    done properly. One quiet block also holds up across every theme and
 *    accent without a parallel colour system to audit.
 *
 * The copy result is reported honestly: "Copied", or "Didn't copy" when the
 * clipboard is unavailable — never a success it cannot vouch for.
 */

export interface CodeBlockProps {
  code: string
  language?: string | null | undefined
  /** True while the fence is still streaming: no copy yet. */
  open?: boolean | undefined
  /** Rendered at the live edge of the code while streaming. */
  caret?: React.ReactNode
}

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_WORDS: Record<CopyState, string> = {
  idle: 'Copy',
  copied: 'Copied',
  failed: 'Didn’t copy',
}

function CopyButton({ code }: { code: string }) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const settle = (next: CopyState) => {
    setState(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 1800)
  }

  return (
    <button
      type="button"
      className="lucet-codeblock__copy"
      data-state={state}
      onClick={() => {
        navigator.clipboard
          .writeText(code)
          .then(() => settle('copied'))
          .catch(() => settle('failed'))
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        {state === 'copied' ? (
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        ) : (
          <>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V6a2 2 0 0 1 2-2h9" />
          </>
        )}
      </svg>
      <span aria-live="polite">{COPY_WORDS[state]}</span>
    </button>
  )
}

export function CodeBlock({ code, language, open, caret }: CodeBlockProps) {
  return (
    <figure className="lucet-codeblock" data-open={open || undefined}>
      <figcaption className="lucet-codeblock__bar">
        <span className="lucet-codeblock__lang">{language ?? 'text'}</span>
        {open ? (
          <span className="lucet-codeblock__writing">writing…</span>
        ) : (
          <CopyButton code={code} />
        )}
      </figcaption>
      {/*
       * tabIndex: a block wider than its container scrolls, and a scrollable
       * region must be reachable and drivable from the keyboard (2.1.1).
       * The label gives the focus stop a name worth landing on.
       */}
      <pre
        className="lucet-codeblock__pre"
        tabIndex={0}
        role="region"
        aria-label={language ? `Code, ${language}` : 'Code'}
      >
        <code>
          {code}
          {caret}
        </code>
      </pre>
    </figure>
  )
}
