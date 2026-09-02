import { projectNextTurn } from 'lucet-core'
import { useMenuGrammar } from '../menu-grammar.js'
import type { ModelState, TurnProjection, UsageState } from 'lucet-core'

/**
 * Budget Meter: the price before you spend it. The positions:
 *
 * 1. THE PICKER IS THE METER. Choosing a model is a spending decision, so
 *    the projected price of the next turn renders on the trigger and on
 *    every model row — switching models is repricing, in place. Plenty of
 *    tools tell you what a turn cost; none price the next one.
 * 2. THE WARNING ARRIVES ATTACHED TO AN EXIT. Caution means the remaining
 *    month no longer covers the projection on the current model, and the
 *    note names the cheapest model that still fits — which is already a
 *    row in the same panel, one click away. A meter with no exit is just
 *    anxiety.
 * 3. ≈ IS LOAD-BEARING. A projection is an estimate by construction; every
 *    figure it produces wears the mark. The ledger rows (thread, month)
 *    are records, so they don't.
 * 4. BUDGET IS MONEY, CONTEXT IS MEMORY. Two meters, never conflated — but
 *    they couple, because the window re-sends with every turn. The panel
 *    says so in words instead of leaving long-thread prices a mystery.
 * 5. THE CONFIG IS THE CONTRACT. No usage: a priced picker. No rates: a
 *    plain picker. No monthly budget: no month row. Nothing renders that
 *    the host didn't claim to know.
 */

export interface BudgetMeterProps {
  model: ModelState
  onChange: (modelId: string) => void
  /** Omit when the host tracks no usage; the control is then a priced picker. */
  usage?: UsageState | undefined
  /** The draft, so the projection moves while the person types. */
  composerText?: string | undefined
  disabled?: boolean | undefined
}

const NO_USAGE = { contextTokens: 0 }

function usd(value: number): string {
  const two = value.toFixed(2)
  return `$${two === '0.00' && value > 0 ? value.toFixed(3) : two}`
}

function tok(value: number): string {
  return value < 1000 ? String(value) : `${(value / 1000).toFixed(1)}k`
}

export function BudgetMeter({ model, onChange, usage, composerText, disabled }: BudgetMeterProps) {
  const menuRef = useMenuGrammar()
  const selected = model.options.find((o) => o.id === model.selectedId) ?? model.options[0]
  if (!selected) return null
  const slice = { model, usage: usage ?? NO_USAGE, composer: { text: composerText ?? '' } }
  const projection = projectNextTurn(slice)
  const remaining =
    usage && usage.monthlyBudgetUsd !== null
      ? Number((usage.monthlyBudgetUsd - usage.monthlySpentUsd).toFixed(4))
      : null
  const spent = remaining !== null && remaining <= 0
  const caution = remaining !== null && !spent && projection !== null && projection.costUsd > remaining
  /* The exit: the cheapest model whose next turn still fits the month. */
  const fits = caution
    ? (model.options
        .map((o) => projectNextTurn(slice, o.id))
        .filter((p): p is TurnProjection => p !== null && p.costUsd <= remaining)
        .sort((a, b) => a.costUsd - b.costUsd)[0] ?? null)
    : null

  const label = [
    `Model: ${selected.label}`,
    projection ? `next turn about ${usd(projection.costUsd)}` : null,
    spent ? 'monthly budget spent' : caution ? 'more than remains this month' : null,
  ]
    .filter(Boolean)
    .join(' — ')

  return (
    <details className="lucet-budget" ref={menuRef}>
      <summary
        className="lucet-budget__button"
        aria-label={label}
        data-state={spent ? 'spent' : caution ? 'caution' : undefined}
        data-disabled={disabled || undefined}
      >
        {spent || caution ? (
          /* The state changes the silhouette, never the colour alone. */
          <svg className="lucet-budget__mark" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 4.5L2.8 20h18.4L12 4.5zM12 10.5v4M12 17.5v.5" />
          </svg>
        ) : null}
        {selected.label}
        {projection ? <span className="lucet-budget__price">≈{usd(projection.costUsd)}</span> : null}
        <span className="lucet-budget__chev" aria-hidden />
      </summary>
      <div className="lucet-budget__panel">
        {projection ? (
          <div
            className="lucet-budget__next"
            /* The teaching lives here and in the rationale, not on every
               open: the panel states, the title explains on demand. */
            title="The context window re-sends with every turn, which is why long threads cost more per turn"
          >
            <span className="lucet-budget__next-head">
              <span>Next turn on {selected.label}</span>
              <span className="lucet-budget__fig">≈{usd(projection.costUsd)}</span>
            </span>
            <span className="lucet-budget__why">≈{tok(projection.tokens)} tokens</span>
          </div>
        ) : null}
        {caution && remaining !== null && projection ? (
          /* THE DECISION POINT, BEFORE THE SPEND (audit round 05): one line
             of cause — what makes this turn expensive — and the two named
             exits, in the calm register of informed consent. The rows
             below are the exits themselves. */
          <p className="lucet-budget__note" role="status">
            More than the {usd(remaining)} left this month.{' '}
            {usage && usage.contextTokens > projection.tokens * 0.6
              ? `The thread's context is ≈${tok(usage.contextTokens)} tokens, re-sent each turn.`
              : selected.id === 'deep'
                ? 'Deep reasoning prices every turn higher.'
                : 'The draft itself is long.'}
            {fits && fits.model.id !== selected.id
              ? ` Use ${fits.model.label} (≈${usd(fits.costUsd)}) or continue on ${selected.label} (≈${usd(projection.costUsd)}).`
              : ''}
          </p>
        ) : null}
        {model.options.map((option) => {
          const p = projectNextTurn(slice, option.id)
          return (
            <button
              key={option.id}
              type="button"
              className="lucet-budget__row"
              aria-pressed={option.id === selected.id}
              onClick={(e) => {
                onChange(option.id)
                e.currentTarget.closest('details')?.removeAttribute('open')
              }}
            >
              <span className="lucet-budget__row-head">
                <span className="lucet-budget__row-label">{option.label}</span>
                <span className="lucet-budget__fig">{p ? `≈${usd(p.costUsd)}` : '—'}</span>
                {/* Check TRAILING — the site's one menu grammar (the
                    drawer menu and the scope ladder both end the row
                    with the mark; a third order would be an invention). */}
                {option.id === selected.id ? (
                  <svg className="lucet-budget__check" viewBox="0 0 24 24" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : null}
              </span>
              {option.note ? <span className="lucet-budget__row-note">{option.note}</span> : null}
            </button>
          )
        })}
        {usage ? (
          <div className="lucet-budget__ledger">
            <span className="lucet-budget__ledger-row">
              <span>This thread</span>
              <span className="lucet-budget__fig">
                {usd(usage.threadCostUsd)} · {tok(usage.threadTokens)} tokens
              </span>
            </span>
            {usage.monthlyBudgetUsd !== null && remaining !== null ? (
              <>
                <span className="lucet-budget__ledger-row">
                  <span>This month</span>
                  <span className="lucet-budget__fig">
                    {usd(usage.monthlySpentUsd)} of {usd(usage.monthlyBudgetUsd)}
                    {spent ? ' — spent' : ` · ${usd(remaining)} left`}
                  </span>
                </span>
                {/* THE METER: the one place a graphic carries what text
                    cannot — three figures as one proportion. The bar is
                    aria-hidden and the figures stay beside it in full
                    (1.4.1: never the bar alone). The month row has a
                    denominator, so it gets a bar; the thread row has
                    none, so it never does. Caution rides the SAME
                    booleans as the chip — one source of truth. */}
                <span
                  className="lucet-budget__bar"
                  data-state={spent ? 'spent' : caution ? 'caution' : undefined}
                  aria-hidden
                >
                  {projection ? (
                    <i
                      className="lucet-budget__bar-proj"
                      style={{
                        inlineSize: `${Math.min(100, ((usage.monthlySpentUsd + projection.costUsd) / usage.monthlyBudgetUsd) * 100).toFixed(2)}%`,
                      }}
                    />
                  ) : null}
                  <i
                    className="lucet-budget__bar-fill"
                    style={{
                      inlineSize: `${Math.min(100, (usage.monthlySpentUsd / usage.monthlyBudgetUsd) * 100).toFixed(2)}%`,
                    }}
                  />
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  )
}
