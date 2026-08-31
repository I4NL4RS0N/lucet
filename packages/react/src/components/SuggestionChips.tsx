import type { Suggestion } from 'lucet'

/**
 * Suggestion chips: prompts made visible. The positions:
 *
 * 1. THE CHIP IS THE PROMPT. What you click is what sends, verbatim, and
 *    it lands in the thread as your own words. A chip whose label differs
 *    from what it sends is a small lie at the exact moment trust is being
 *    established.
 * 2. A WAY IN, NOT FURNITURE. They show on the cold start — empty, idle
 *    thread (the core's `suggestionsVisible` owns the rule) — and leave the
 *    moment the conversation exists. Chips that linger become decoration,
 *    and decoration that sends prompts is a misclick farm.
 * 3. ASK AND DO, APART. Two kinds, drawn apart: `ask` is turn-by-turn —
 *    a question, words back, cheap. `do` is a commission — the agent goes
 *    and works. BOTH only send their words (the chip never touches a
 *    system itself; the agent does the doing), but flattening them trains
 *    people to tap without reading, so each kind gets its own labelled
 *    labelled, DESCRIBED group. Per-row kind glyphs were tried and cut:
 *    once the labels said the difference out loud, the icons were
 *    reinforcement that had outlived its job.
 * 4. THE TOGGLE IS THE CONFIG. A group exists only while it has
 *    suggestions: populate ask, do, both, or neither, and the layout
 *    follows. No boolean props to desynchronise from the data. Kindless
 *    suggestions still render as one unlabelled list, so the field is an
 *    upgrade, not a migration.
 */

export interface SuggestionChipsProps {
  suggestions: readonly Suggestion[]
  onPick: (suggestion: Suggestion) => void
  disabled?: boolean | undefined
}

/* The split, said out loud: the labels alone were two short words doing
   heavy lifting, and the example prompts had drifted similar (Ian). The
   descriptor under each label carries the real difference. */
const GROUPS = [
  { kind: 'ask', label: 'Ask', desc: 'Answered in the thread' },
  { kind: 'do', label: 'Do', desc: 'Run by the agent' },
] as const

function Chip({
  suggestion,
  onPick,
  disabled,
}: {
  suggestion: Suggestion
  onPick: (suggestion: Suggestion) => void
  disabled?: boolean | undefined
}) {
  return (
    <button
      type="button"
      className="lucet-chips__chip"
      data-kind={suggestion.kind}
      disabled={disabled || undefined}
      onClick={() => onPick(suggestion)}
    >
      <span className="lucet-chips__text">{suggestion.prompt}</span>
      {suggestion.kind === 'do' ? (
        /* A do-row RUNS: it wears the rail's own run-triangle instead of
           the way-in chevron, so "the agent takes this and goes" rhymes
           with the page's controls that run things. */
        <svg className="lucet-chips__chev" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M9 6.8v10.4c0 .55.6.9 1.08.6l8.2-5.2a.72.72 0 0 0 0-1.2l-8.2-5.2A.72.72 0 0 0 9 6.8z"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      ) : (
        <svg className="lucet-chips__chev" viewBox="0 0 24 24" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </button>
  )
}

export function SuggestionChips({ suggestions, onPick, disabled }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null
  const kinded = suggestions.some((s) => s.kind)
  return (
    <div className="lucet-chips" role="group" aria-label="Suggestions">
      {kinded ? (
        <>
          {GROUPS.map(({ kind, label, desc }) => {
            const set = suggestions.filter((s) => s.kind === kind)
            if (set.length === 0) return null
            return (
              <div
                key={kind}
                className="lucet-chips__set"
                role="group"
                aria-label={`${label} suggestions`}
              >
                <span className="lucet-chips__head" aria-hidden>
                  <span className="lucet-chips__label">{label}</span>
                  <span className="lucet-chips__desc">{desc}</span>
                </span>
                {set.map((s) => (
                  <Chip key={s.id} suggestion={s} onPick={onPick} disabled={disabled} />
                ))}
              </div>
            )
          })}
          {suggestions.some((s) => !s.kind) ? (
            <div className="lucet-chips__set">
              {suggestions
                .filter((s) => !s.kind)
                .map((s) => (
                  <Chip key={s.id} suggestion={s} onPick={onPick} disabled={disabled} />
                ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="lucet-chips__set">
          {suggestions.map((s) => (
            <Chip key={s.id} suggestion={s} onPick={onPick} disabled={disabled} />
          ))}
        </div>
      )}
    </div>
  )
}
