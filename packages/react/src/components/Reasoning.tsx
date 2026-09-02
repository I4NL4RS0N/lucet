import { ActivityOrb } from './ActivityOrb.js'
import { Markdown } from './Markdown.js'

/**
 * Reasoning disclosure. The positions:
 *
 * 1. WORKING, NOT ANSWER. Reasoning never renders in the response body:
 *    mixing them teaches people to read the thinking as conclusions. It
 *    wears the quote's grammar instead — a hairline rail, muted ink —
 *    because that is what it is: the machine quoting its own working.
 * 2. COLLAPSED BY DEFAULT, AND IT NEVER OPENS ITSELF. Pushing the thinking
 *    at people is the same mistake as mixing it in. But it is expandable
 *    the whole time — including MID-STREAM, where opening it shows the
 *    reasoning arriving live, caret and all. Watching it think is opt-in.
 * 3. THE ROW IS THE LOADING STATE. While the model thinks, the summary
 *    carries the activity orb and the word "Thinking…" — the wait has a
 *    face and a name, not a mystery spinner ("an orb without its word is a
 *    mystery lamp"). When it settles the row becomes a plain label for
 *    what it holds: "Why this answer" (round 05 P2).
 * 4. A REAL CONTROL, WITH REAL STATES. Native <details>/<summary> — the
 *    browser owns the expanded/collapsed semantics — dressed with the same
 *    hover veil, press, and focus ring as every other control. (Its
 *    predecessor here was a div that SAID "expand" and did nothing; this
 *    component exists so that can never happen again.)
 * 5. NOT ANNOUNCED. The thread's announcer speaks the answer, never the
 *    working — a screen reader user opts into reasoning exactly like a
 *    sighted one, by expanding it.
 *
 * The body renders through the same streaming-safe Markdown as the
 * response: thinking is a document too, and it arrives the same way.
 */

export interface ReasoningProps {
  text: string
  /** True while the reasoning itself is still arriving. */
  streaming?: boolean | undefined
  defaultOpen?: boolean | undefined
}

export function Reasoning({ text, streaming = false, defaultOpen = false }: ReasoningProps) {
  return (
    <details className="lucet-reasoning" open={defaultOpen || undefined} data-streaming={streaming || undefined}>
      <summary className="lucet-reasoning__summary">
        {streaming ? (
          <ActivityOrb state="thinking" label="Thinking…" size="sm" />
        ) : (
          'Why this answer'
        )}
      </summary>
      <div className="lucet-reasoning__body">
        <Markdown text={text} streaming={streaming} caret={streaming} headingBase={4} />
      </div>
    </details>
  )
}
