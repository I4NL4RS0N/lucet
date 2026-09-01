import { useEffect, useRef, useState } from 'react'
import type { ToolStatus } from 'lucet-core'
import { ActivityOrb } from './ActivityOrb.js'
import { StateIcon } from './StateIcon.js'
import type { IconName } from './StateIcon.js'

/**
 * Tool call display: the machine did something in the world, and this is
 * the receipt. The positions:
 *
 * 1. LEGIBLE AT THE TOP, EXACT UNDERNEATH. The row speaks words — the
 *    tool's name (name tools in words, not identifiers; the sentence is
 *    for readers) and the outcome in `detail`. The raw exchange — what it
 *    was asked, what came back — waits behind the disclosure for whoever
 *    needs the receipt. The same split as the event inspector and the
 *    Audit Trail this grows into.
 * 2. NOTHING TO SHOW, NOTHING TO OPEN. The chevron exists only when the
 *    host shared a payload. A disclosure over an empty body is the dead
 *    "expand" this thread has already shipped once; never again, and the
 *    state audit enforces it.
 * 3. PARTIAL IS AN OUTCOME, NOT A FOOTNOTE. `partial` exists here and
 *    almost nowhere else in this category: succeeded-or-failed is the lie
 *    that lets a product answer confidently from two thirds of the data.
 *    It wears the caution ink and says so in words.
 * 4. WEIGHT ONLY WHERE THE READER MUST ACT. A running tool is a progress
 *    report — the orb and the tool's name, nothing louder. Success is a
 *    silhouette and the words of its outcome. Only the unhappy settlements
 *    (failed, partial) carry a status word in ink.
 */

export interface ToolCallProps {
  name: string
  status: ToolStatus
  detail?: string | null | undefined
  /** Raw input, as the host serialized it. */
  args?: string | null | undefined
  /** Raw output once settled. */
  result?: string | null | undefined
  defaultOpen?: boolean | undefined
}

const ICON: Record<Exclude<ToolStatus, 'running'>, IconName> = {
  pending: 'scheduled',
  succeeded: 'operational',
  partial: 'partial',
  failed: 'failed',
}

/** Spoken status, where the silhouette alone is not words enough. */
const WORD: Partial<Record<ToolStatus, string>> = {
  pending: 'Waiting to run',
  failed: 'Failed',
  partial: 'Partly done',
}

/* The elapsed readout while the tool genuinely runs: it times the real
   event as it actually elapses (the mock scheduler sleeps real time),
   and on settle the runtime's own receipt (`detail`) replaces it — the
   counter stops at the truth, never at a fake. The readout rule holds:
   this tracks, it does not animate. */
function LiveElapsed() {
  const [tenths, setTenths] = useState(0)
  useEffect(() => {
    const born = performance.now()
    const t = setInterval(() => setTenths(Math.floor((performance.now() - born) / 100)), 100)
    return () => clearInterval(t)
  }, [])
  /* Mono + tabular: a ticking counter in proportional digits wobbles in
     width every tenth, and the eye reads the jitter as activity it isn't. */
  return <span className="lucet-tool__detail lucet-tool__elapsed">{(tenths / 10).toFixed(1)}s</span>
}

function Receipt({ label, text }: { label: string; text: string }) {
  return (
    <div className="lucet-tool__io">
      <span className="lucet-tool__io-label">{label}</span>
      <pre className="lucet-tool__io-pre" tabIndex={0} role="region" aria-label={label}>
        <code>{text}</code>
      </pre>
    </div>
  )
}

export function ToolCall({ name, status, detail, args, result, defaultOpen }: ToolCallProps) {
  /* Settling is an EVENT only when this instance actually watched the
     run: a chip that mounts already settled (the boot seed, a restored
     copy) arrives still — motion is evidence, and nothing happened
     here. The flag gates the check-mark's enter; the elevate rides the
     status change itself (a transition fires only on change, so a
     settled mount never animates). */
  const watchedRunning = useRef(false)
  if (status === 'running') watchedRunning.current = true
  const arrived = watchedRunning.current && status !== 'running'
  /*
   * Two lines, one register each: the first says WHO (mark, name, and the
   * status word when it must be spoken); the second says WHAT CAME OF IT,
   * quietly. One crowded line carried five elements at three sizes — the
   * make-interfaces-feel-better failure mode in miniature.
   */
  const head = (
    <>
      <span className="lucet-tool__head">
        {status === 'running' ? (
          <ActivityOrb state="searching" label={name} size="sm" />
        ) : (
          <>
            <StateIcon name={ICON[status]} />
            <span className="lucet-tool__name">{name}</span>
            {WORD[status] ? <strong className="lucet-tool__word">{WORD[status]}</strong> : null}
            {status === 'succeeded' ? <span className="lucet-visually-hidden">Done.</span> : null}
          </>
        )}
      </span>
      {status === 'running' ? (
        <LiveElapsed />
      ) : detail ? (
        <span className="lucet-tool__detail">{detail}</span>
      ) : null}
    </>
  )

  const receipt = (
    <>
      {args ? <Receipt label="What it was asked" text={args} /> : null}
      {result ? <Receipt label="What came back" text={result} /> : null}
    </>
  )

  // No payload, no disclosure: a plain row that promises nothing.
  if (!args && !result) {
    return (
      <div className="lucet-tool" data-status={status} data-arrived={arrived || undefined}>
        <div className="lucet-tool__row">{head}</div>
      </div>
    )
  }

  return (
    <details
      className="lucet-tool"
      data-status={status}
      data-arrived={arrived || undefined}
      open={defaultOpen || undefined}
    >
      <summary className="lucet-tool__row lucet-tool__row--summary">{head}</summary>
      <div className="lucet-tool__body">{receipt}</div>
    </details>
  )
}
