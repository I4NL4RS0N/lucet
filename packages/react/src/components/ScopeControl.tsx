import type { ScopeState } from '@lucet/core'
import { useMenuGrammar } from '../menu-grammar.js'

/**
 * Scope Control: user-controlled context. The positions:
 *
 * 1. THE BREADCRUMB IS THE LADDER. The host's information architecture
 *    already contains the context hierarchy; this control renders the
 *    host's own rungs instead of guessing retrieval invisibly. Wrong
 *    answers are usually wrong context, not a wrong model.
 * 2. SHOW WHAT IS IN SCOPE. Every rung carries its contents in words
 *    and a count. A picker without contents is a guess wearing a
 *    control — the summary is the trust half, not decoration.
 * 3. THE PAGE MOVES, THE SCOPE SAYS SO. In a drawer the page keeps
 *    moving underneath. When navigation reconfigures the ladder, the
 *    selection follows and the moved note renders beside the control
 *    until the person acts on scope — silent following is guessing.
 * 4. THE TOGGLE IS THE CONFIG. No levels, no control. Hosts without a
 *    scope feature render nothing.
 * 5. Keyboard grammar via the shared disclosure-menu hook: roving
 *    arrows, Home/End, Escape-to-trigger, outside click closes.
 *    Deferred, recorded: typeahead; multi-select scopes; live
 *    re-counting while open.
 */

export interface ScopeControlProps {
  scope: ScopeState
  onChange: (levelId: string) => void
  disabled?: boolean | undefined
}

export function ScopeControl({ scope, onChange, disabled }: ScopeControlProps) {
  const menuRef = useMenuGrammar()
  if (scope.levels.length === 0) return null
  const selected = scope.levels.find((l) => l.id === scope.selectedId) ?? scope.levels[0]!
  return (
    <span className="lucet-scope">
      <details className="lucet-scope__menu" ref={menuRef}>
        <summary
          className="lucet-scope__button"
          aria-label={`Scope: ${selected.label} — ${selected.summary}`}
          data-disabled={disabled || undefined}
        >
          <svg className="lucet-scope__glyph" viewBox="0 0 24 24" aria-hidden>
            <path d="M3.5 9V5.5a2 2 0 0 1 2-2H9M15 3.5h3.5a2 2 0 0 1 2 2V9M20.5 15v3.5a2 2 0 0 1-2 2H15M9 20.5H5.5a2 2 0 0 1-2-2V15" />
            <circle cx="12" cy="12" r="2.4" />
          </svg>
          {selected.label}
          <span className="lucet-scope__chev" aria-hidden />
        </summary>
        <div className="lucet-scope__panel">
          {scope.levels.map((level) => (
            <button
              key={level.id}
              type="button"
              className="lucet-scope__row"
              aria-pressed={level.id === selected.id}
              onClick={(e) => {
                onChange(level.id)
                e.currentTarget.closest('details')?.removeAttribute('open')
              }}
            >
              <span className="lucet-scope__row-head">
                <span className="lucet-scope__row-label">{level.label}</span>
                <span className="lucet-scope__count">{level.itemCount}</span>
                {level.id === selected.id ? (
                  <svg className="lucet-scope__check" viewBox="0 0 24 24" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : null}
              </span>
              <span className="lucet-scope__summary">{level.summary}</span>
            </button>
          ))}
        </div>
      </details>
      {scope.movedNote ? (
        /* role=status: the ground moved and the reader hears it too. */
        <span className="lucet-scope__moved" role="status">
          {scope.movedNote}
        </span>
      ) : null}
    </span>
  )
}
