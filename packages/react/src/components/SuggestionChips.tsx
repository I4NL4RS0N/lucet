import type { Suggestion } from 'lucet'

/**
 * Suggestion chips: prompts made visible. The positions:
 *
 * 1. THE CHIP IS THE PROMPT. One field in the contract, on purpose — what
 *    you click is what sends, verbatim, and it lands in the thread as your
 *    own words. A chip whose label differs from what it sends is a small
 *    lie at the exact moment trust is being established.
 * 2. A WAY IN, NOT FURNITURE. They show on the cold start — empty, idle
 *    thread (the core's `suggestionsVisible` owns the rule) — and leave the
 *    moment the conversation exists. Chips that linger become decoration,
 *    and decoration that sends prompts is a misclick farm.
 * 3. CONVERSATIONAL ONLY. Everything here is turn-by-turn, cheap,
 *    reversible: you get text back. Chips that DO things — commit, spend,
 *    touch real systems — are the Action Surface's agentic half, kept
 *    visually apart, because flattening the two trains people to tap
 *    without reading.
 *
 * The chips wear the composer's CONTENT tier — the white raised chip, same
 * as an attachment — because a suggestion is content in waiting, not an
 * ambient tool and not the primary action.
 */

export interface SuggestionChipsProps {
  suggestions: readonly Suggestion[]
  onPick: (suggestion: Suggestion) => void
  disabled?: boolean | undefined
}

export function SuggestionChips({ suggestions, onPick, disabled }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null
  return (
    <div className="lucet-chips" role="group" aria-label="Suggestions">
      {suggestions.map((s) => (
        <button
          key={s.id}
          type="button"
          className="lucet-chips__chip"
          disabled={disabled || undefined}
          onClick={() => onPick(s)}
        >
          {s.prompt}
        </button>
      ))}
    </div>
  )
}
