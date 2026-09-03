import { budgetHold, projectNextTurn } from 'lucet-core'
import { useMenuGrammar } from '../menu-grammar.js'
import { useEffect, useRef, useCallback } from 'react'
import type { BudgetIntercept, ModelState, TurnProjection, UsageState } from 'lucet-core'

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
  /** THE HOLD (round 06): a send stopped at the month's threshold. While
      set, the panel opens itself on the reason and two explicit ways on. */
  intercept?: BudgetIntercept | null | undefined
  /** Continue on the selected model: the held words send. */
  onConfirm?: (() => void) | undefined
  /** The panel closed on the hold without a decision (Escape, a click away). */
  onDismiss?: (() => void) | undefined
  /** Use the cheaper model: it is selected and the hold releases; the host
      returns focus to Send for the person to confirm. */
  onReroute?: ((modelId: string) => void) | undefined
}

/* No budget concept: the projection still prices the turn, and nothing is ever held. */
const NO_USAGE = { contextTokens: 0, monthlyBudgetUsd: null, monthlySpentUsd: 0 }

function usd(value: number): string {
  const two = value.toFixed(2)
  return `$${two === '0.00' && value > 0 ? value.toFixed(3) : two}`
}

function tok(value: number): string {
  return value < 1000 ? String(value) : `${(value / 1000).toFixed(1)}k`
}

export function BudgetMeter({
  model,
  onChange,
  usage,
  composerText,
  disabled,
  intercept,
  onConfirm,
  onDismiss,
  onReroute,
}: BudgetMeterProps) {
  const menuRef = useMenuGrammar()
  const details = useRef<HTMLDetailsElement | null>(null)
  /* ANCHORED TO ITS TRIGGER (component audit 07, rider B): the panel opens
     above the selector with its start edge on the selector's, and slides
     along the bar only as far as staying inside it requires. A bar narrower
     than the panel's natural width (the phone) gets the panel across its
     whole inner width instead. Measured on open and on resize, imperatively:
     no state, because a re-render on toggle re-attached the menu grammar's
     listeners mid-dispatch and its focus-on-open never ran. Never on Send's
     axis. */
  const place = useCallback(() => {
    const el = details.current
    if (!el || !el.open) return
    const panel = el.querySelector<HTMLElement>('.lucet-budget__panel')
    const bar = el.closest<HTMLElement>('.lucet-prompt__bar') ?? el.parentElement
    if (!panel || !bar) return
    const b = bar.getBoundingClientRect()
    const t = el.getBoundingClientRect()
    const inner = Math.round(b.width)
    /* A bar too narrow to hold the panel beside its trigger with room to
       slide (the phone) takes it across the whole inner width; the drawer
       keeps it on the trigger, clamped. */
    const narrow = inner < 360
    /* From here the panel is the trigger's; before, it kept the bar's end
       edge so an open measured in the same tick is still inside. */
    el.dataset.placed = ''
    el.style.setProperty('--lucet-budget-panel-cap', `${inner}px`)
    el.style.setProperty('--lucet-budget-panel-size', narrow ? `${inner}px` : 'auto')
    el.style.setProperty('--lucet-budget-shift', '0px')
    /* offsetWidth, not the rect: the panel is mid-scale in its entrance
       animation when this runs, and a scaled rect under-measures it. */
    const width = panel.offsetWidth
    let shift = 0
    if (t.left + width > b.right) shift = b.right - (t.left + width)
    if (t.left + shift < b.left) shift = b.left - t.left
    el.style.setProperty('--lucet-budget-shift', `${Math.round(shift)}px`)
  }, [])
  useEffect(() => {
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [place])
  /* One ref callback for the life of the component: a fresh arrow each
     render would detach and re-attach the grammar's listeners on every
     keystroke. */
  const attachDetails = useCallback(
    (el: HTMLDetailsElement | null) => {
      details.current = el
      return menuRef(el)
    },
    [menuRef],
  )
  /* Set by the two actions so the close they cause is not read as a
     dismissal. */
  const decided = useRef(false)
  /* The hold opens the panel and puts focus on the first way on. A new
     hold (Send pressed again) re-opens it; an already-open panel just
     moves focus. */
  useEffect(() => {
    const el = details.current
    if (!intercept || !el) return
    decided.current = false
    if (!el.open) el.open = true
    else el.querySelector<HTMLButtonElement>('.lucet-budget__decide button')?.focus()
  }, [intercept])
  /* A lock that arrives with the panel open closes it: the rows would
     otherwise stay operable behind a trigger that says it is not. */
  useEffect(() => {
    if (disabled && details.current?.open) details.current.open = false
  }, [disabled])
  const selected = model.options.find((o) => o.id === model.selectedId) ?? model.options[0]
  if (!selected) return null
  const slice = { model, usage: usage ?? NO_USAGE, composer: { text: composerText ?? '' } }
  const projection = projectNextTurn(slice)
  const remaining =
    usage && usage.monthlyBudgetUsd !== null
      ? Number((usage.monthlyBudgetUsd - usage.monthlySpentUsd).toFixed(4))
      : null
  const spent = remaining !== null && remaining <= 0
  /* One source with the runtime's hold: the meter says caution exactly
     when a send would be held (round 06). */
  const caution = !spent && budgetHold(slice) !== null
  /* The exit: the cheapest model whose next turn still fits the month. */
  const fits = caution && remaining !== null
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
    <details
      className="lucet-budget"
      data-held={intercept ? 'true' : undefined}
      ref={attachDetails}
      onToggle={(e) => {
        const el = e.currentTarget
        if (el.open) {
          place()
          return
        }
        if (intercept && !decided.current) onDismiss?.()
        decided.current = false
      }}
    >
      <summary
        className="lucet-budget__button"
        aria-label={label}
        data-state={spent ? 'spent' : caution ? 'caution' : undefined}
        data-disabled={disabled || undefined}
        /* Disabled means disabled for every input (component audit 03):
           pointer-events alone left the trigger in the Tab order, where
           Enter opened the panel and changed the model mid-turn. Out of
           the Tab order, the toggle cancelled, and aria-disabled so the
           state is heard, not just seen. */
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={(e) => {
          if (disabled) e.preventDefault()
        }}
      >
        {spent || caution ? (
          /* The state changes the silhouette, never the colour alone. */
          <svg className="lucet-budget__mark" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 4.5L2.8 20h18.4L12 4.5zM12 10.5v4M12 17.5v.5" />
          </svg>
        ) : null}
        {selected.label}
        {/* A projected price on a blocked month is a promise the send
            button cannot keep: hidden while spent (round 05, P1). */}
        {projection && !spent ? <span className="lucet-budget__price">≈{usd(projection.costUsd)}</span> : null}
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
            {!intercept && fits && fits.model.id !== selected.id
              ? ` Use ${fits.model.label} (≈${usd(fits.costUsd)}) or continue on ${selected.label} (≈${usd(projection.costUsd)}).`
              : ''}
            {/* What each way does, in words (component audit 03): the
                cheaper model reprices and hands the person back to Send;
                continuing sends now. A gate whose buttons carry only
                prices left the second press unexplained. */}
            {intercept
              ? fits && fits.model.id !== selected.id
                ? ` Use ${fits.model.label} switches the model and returns you to Send. Continue on ${selected.label} sends now.`
                : ` Continue on ${selected.label} sends now.`
              : ''}
          </p>
        ) : null}
        {intercept && caution && projection ? (
          /* THE DECISION ITSELF (round 06): the Send that would have crossed
             the month opened this panel instead, and these two are the only
             ways across. The cheaper model that fits comes first and takes
             focus; continuing on the chosen model sends at once — the
             expensive choice made explicit, never made by accident. */
          <div className="lucet-budget__decide">
            {fits && fits.model.id !== selected.id ? (
              <button
                type="button"
                className="lucet-button"
                data-variant="primary"
                data-first=""
                onClick={(e) => {
                  decided.current = true
                  e.currentTarget.closest('details')?.removeAttribute('open')
                  ;(onReroute ?? onChange)(fits.model.id)
                }}
              >
                Use {fits.model.label} · <span className="lucet-budget__fig">≈{usd(fits.costUsd)}</span>
              </button>
            ) : null}
            <button
              type="button"
              className="lucet-button"
              data-variant="secondary"
              data-first={fits && fits.model.id !== selected.id ? undefined : ''}
              onClick={(e) => {
                decided.current = true
                e.currentTarget.closest('details')?.removeAttribute('open')
                onConfirm?.()
              }}
            >
              Continue on {selected.label} · <span className="lucet-budget__fig">≈{usd(projection.costUsd)}</span>
            </button>
          </div>
        ) : null}
        {model.options.map((option) => {
          const p = projectNextTurn(slice, option.id)
          return (
            <button
              key={option.id}
              type="button"
              className="lucet-budget__row"
              aria-pressed={option.id === selected.id}
              /* THE WALL, IN THE PICKER (component audit 03, independent
                 verification): while the month is spent no model can produce
                 an allowed send, so the rows stay readable — the ledger below
                 is the explanation — but inert, and say so. */
              aria-disabled={spent || undefined}
              onClick={(e) => {
                if (spent) return
                onChange(option.id)
                e.currentTarget.closest('details')?.removeAttribute('open')
              }}
            >
              <span className="lucet-budget__row-head">
                <span className="lucet-budget__row-label">{option.label}</span>
                <span className="lucet-budget__fig">{p ? `≈${usd(p.costUsd)}` : '—'}</span>
                {/* Check TRAILING — the site's one menu grammar (the
                    drawer menu and the scope ladder both end the row
                    with the mark; a third order would be an invention).
                    The slot is reserved on EVERY row (component audit 03):
                    a mark that appears only on the selected row pushed
                    that row's price 21px out of the column. Figures in a
                    column align, or they are not a column. */}
                <span className="lucet-budget__check-slot" aria-hidden>
                  {option.id === selected.id ? (
                    <svg className="lucet-budget__check" viewBox="0 0 24 24">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  ) : null}
                </span>
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
