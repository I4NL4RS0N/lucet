import type { ScopeLevel, ScopeState } from 'lucet-core'
import { scopeDisplay } from 'lucet-core'
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
 *    moving underneath. When navigation changes the selected boundary,
 *    the selection follows and the moved note renders beside the control
 *    until the person acts on scope — silent following is guessing.
 *    With a draft in the field the move is HELD instead (the reducer's
 *    scope-freeze rule, round 05 P2) and the control asks, naming both
 *    pages (component audit 04): Keep Reports review, or Use Vendor call.
 * 4. "THIS PAGE" IS THE PAGE ON SCREEN, AND NOTHING ELSE (component audit
 *    04). While the scope stays on another page's ladder the chip and the
 *    picker name that page, and the page on screen is offered as the first
 *    row — one derived model (`scopeDisplay`) for the visible and the
 *    spoken, so they cannot drift apart.
 * 5. THE TOGGLE IS THE CONFIG. No levels, no control. Hosts without a
 *    scope feature render nothing.
 * 6. Keyboard grammar via the shared disclosure-menu hook: roving
 *    arrows, Home/End, Escape-to-trigger, outside click closes.
 *    Deferred, recorded: typeahead; multi-select scopes; live
 *    re-counting while open.
 */

export interface ScopeControlProps {
  scope: ScopeState
  onChange: (levelId: string) => void
  /** The held page change: true takes the new page, false keeps the previous one. */
  onUpdate?: ((useNewPage: boolean) => void) | undefined
  /** The page on screen, chosen from the picker while the scope was pinned
      elsewhere: the host's ladder for it comes into force at this rung. */
  onRebind?: ((levelId: string) => void) | undefined
  disabled?: boolean | undefined
}

/** The rung's own name where it has one: "Reports review" behind "This page". */
const nameOf = (level: ScopeLevel) => level.name ?? level.label

export function ScopeControl({ scope, onChange, onUpdate, onRebind, disabled }: ScopeControlProps) {
  const menuRef = useMenuGrammar()
  const display = scopeDisplay(scope)
  if (!display) return null
  const selected = scope.levels.find((l) => l.id === scope.selectedId) ?? scope.levels[0]!
  const pendingTarget = scope.pending
    ? (scope.pending.levels.find((l) => l.id === scope.pending!.selectedId) ?? scope.pending.levels[0])
    : undefined
  return (
    <span className="lucet-scope">
      <details className="lucet-scope__menu" ref={menuRef}>
        <summary
          className="lucet-scope__button"
          aria-label={display.name}
          data-disabled={disabled || undefined}
          data-divergent={display.divergent || undefined}
          /* Disabled means disabled for every input (component audit 04,
             the same repair the budget trigger took): out of the Tab
             order, the toggle cancelled, and aria-disabled so the state
             is heard. */
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          onClick={(e) => {
            if (disabled) e.preventDefault()
          }}
        >
          <svg className="lucet-scope__glyph" viewBox="0 0 24 24" aria-hidden>
            <path d="M3.5 9V5.5a2 2 0 0 1 2-2H9M15 3.5h3.5a2 2 0 0 1 2 2V9M20.5 15v3.5a2 2 0 0 1-2 2H15M9 20.5H5.5a2 2 0 0 1-2-2V15" />
            <circle cx="12" cy="12" r="2.4" />
          </svg>
          {display.label}
          <span className="lucet-scope__chev" aria-hidden />
        </summary>
        <div className="lucet-scope__panel">
          {display.rows.map((row) => (
            <button
              key={row.key}
              type="button"
              className="lucet-scope__row"
              aria-pressed={row.selected}
              data-on-screen={row.onScreen || undefined}
              onClick={(e) => {
                /* Focus goes to the trigger BEFORE the choice lands: a row that
                   rebinds the ladder unmounts on the next render, and focus
                   left on it would fall to body before the panel's close could
                   hand it back (independent verification, audit 04). */
                const details = e.currentTarget.closest('details')
                details?.querySelector<HTMLElement>('summary')?.focus()
                if (row.onScreen) (onRebind ?? onChange)(row.levelId)
                else onChange(row.levelId)
                details?.removeAttribute('open')
              }}
            >
              <span className="lucet-scope__row-head">
                <span className="lucet-scope__row-label">{row.label}</span>
                {/* The counts form a column (component audit 04): trailing,
                    right-aligned, tabular, with the check in a slot reserved
                    on every row — the budget rows' grammar. */}
                <span className="lucet-scope__count">{row.count}</span>
                <span className="lucet-scope__check-slot" aria-hidden>
                  {row.selected ? (
                    <svg className="lucet-scope__check" viewBox="0 0 24 24">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  ) : null}
                </span>
              </span>
              <span className="lucet-scope__summary">{row.secondary}</span>
            </button>
          ))}
        </div>
      </details>
      {scope.pending && pendingTarget ? (
        /* THE FREEZE, ASKED IN WORDS THAT NAME THE PAGES (round 05 P2;
           component audit 04): a draft is in the field and the page moved.
           The scope holds until the person says which page the words are
           for. Keeping the drafted context is the safe choice — the draft is
           evidence the previous context was meant — so it is primary; the
           new page is secondary. Message on its own row, the two actions
           together on the next, the question read out as status. */
        <span className="lucet-scope__pending" role="status">
          <span className="lucet-scope__pending-text">
            Page changed{scope.pending.pageName ? ` to ${scope.pending.pageName}` : ''}. Update scope?
          </span>
          <span className="lucet-scope__actions">
            <button
              type="button"
              className="lucet-button lucet-scope__decide"
              data-variant="primary"
              onClick={() => onUpdate?.(false)}
            >
              Keep {nameOf(selected)}
            </button>
            <button
              type="button"
              className="lucet-button lucet-scope__decide"
              data-variant="secondary"
              onClick={() => onUpdate?.(true)}
            >
              Use {nameOf(pendingTarget)}
            </button>
          </span>
        </span>
      ) : scope.movedNote ? (
        /* role=status: the ground moved and the reader hears it too. */
        <span className="lucet-scope__moved" role="status">
          {scope.movedNote}
        </span>
      ) : null}
    </span>
  )
}
