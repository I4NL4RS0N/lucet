/**
 * Reasoning disclosure.
 *
 * Collapsed by default and quiet when open. Two decisions worth stating:
 *
 * 1. It is NOT in the response body. Reasoning is working, not answer, and
 *    mixing them teaches people to read the thinking as conclusions.
 * 2. While streaming, the summary line reports that it is thinking rather than
 *    animating a spinner. A spinner says "wait"; this says what is happening.
 */

export interface ReasoningProps {
  text: string
  streaming?: boolean
  defaultOpen?: boolean
}

export function Reasoning({ text, streaming = false, defaultOpen = false }: ReasoningProps) {
  return (
    <details className="lucet-reasoning" open={defaultOpen}>
      <summary className="lucet-reasoning__summary">
        {streaming ? 'Thinking' : 'Thought about this'}
      </summary>
      <div className="lucet-reasoning__body">{text}</div>
    </details>
  )
}
