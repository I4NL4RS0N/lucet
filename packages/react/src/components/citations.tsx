import { createContext } from 'react'

/**
 * Inline [n] markers and the bibliography they point at (component audit
 * 07). A message with a sources part provides the count and the row anchors;
 * markers within the count become links that move focus to their row, and
 * Escape on the row returns it. Absent a provider, markers stay plain text.
 */
export interface Citations {
  readonly count: number
  idFor(n: number): string
}

export const CitationsContext = createContext<Citations | null>(null)

/* The marker that sent focus into the list, so Escape can send it back.
   One at a time: a second activation replaces the first. */
let invoker: HTMLElement | null = null
export function rememberInvoker(el: HTMLElement): void {
  invoker = el
}
export function takeInvoker(): HTMLElement | null {
  const el = invoker
  invoker = null
  return el && el.isConnected ? el : null
}
