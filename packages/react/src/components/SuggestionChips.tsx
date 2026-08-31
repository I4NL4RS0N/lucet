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
 *    group and its own glyph — shape first, the accent on `do` only as
 *    reinforcement, never colour alone.
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
  { kind: 'ask', label: 'Ask', desc: 'Answers, in the thread' },
  { kind: 'do', label: 'Do', desc: 'Work handed off and run' },
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
      {suggestion.kind === 'ask' ? (
        /* A conversation asks: the speech square, with its words. */
        <svg className="lucet-chips__glyph" viewBox="0 0 24 24" aria-hidden>
          <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9.5L4 21z" />
          <path d="M8 9.2h8M8 12.6h5" />
        </svg>
      ) : suggestion.kind === 'do' ? (
        /* An AGENT does: the little worker itself, not an abstract bolt. */
        <svg className="lucet-chips__glyph" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="3.2" r="1" />
          <path d="M12 4.6V7M4.5 13.5H3m18 0h-1.5" />
          <rect x="5.5" y="7" width="13" height="11" rx="3" />
          <circle className="lucet-chips__glyph-eye" cx="9.6" cy="12" r="1.15" />
          <circle className="lucet-chips__glyph-eye" cx="14.4" cy="12" r="1.15" />
        </svg>
      ) : null}
      <span className="lucet-chips__text">{suggestion.prompt}</span>
      <svg className="lucet-chips__chev" viewBox="0 0 24 24" aria-hidden>
        <path d="M9 6l6 6-6 6" />
      </svg>
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
