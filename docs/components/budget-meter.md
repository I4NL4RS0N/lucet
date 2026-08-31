# Budget Meter

The price before you spend it: the model picker grown into the meter.

## The positions

- **The picker is the meter.** Choosing a model is a spending decision,
  so the two are one control. The trigger carries the selected model and
  the projected price of the next turn; the panel prices every model row
  in place (`projectNextTurn(state, modelId)`), then shows the ledger —
  this thread, then this month. Plenty of tools tell you what a turn
  cost. None price the next one; that gap is the whole feature, and it
  is why core reserved this seat on `ModelOption` from the start.
- **Derived, never stored.** The projection was originally a stored
  field (`projectedCostUsd`) that nothing wrote. It is now a pure
  selector over context size, draft length, and the model's rate — it
  cannot go stale against the state it is computed from, and repricing
  a different model is a parameter, not a mutation.
- **≈ is load-bearing.** The estimate is honest about being one: a flat
  allowance for host instructions and a typical reply, the context
  window (which re-sends every turn — the panel says so, because that
  coupling is why long threads cost more per turn, and budget/context
  are two meters that must couple without conflating), and the draft at
  four characters a token. One blended rate per model
  (`ModelOption.usdPerMTok`), because splitting input and output rates
  would add precision to a number that is an estimate either way.
  Records (thread and month rows) don't wear the mark; projections do.
- **The warning arrives attached to an exit.** Caution is
  consequence-based, not percentage-based: it fires when what remains
  of the month no longer covers the projection on the selected model.
  The note names the cheapest model that still fits — which is already
  a priced row in the same panel, one click away. A meter with no exit
  is just anxiety.
- **Spent is a wall with words, in caution, not danger.** When
  `monthlySpentUsd` crosses `monthlyBudgetUsd` the composer stops via a
  `'budget'` submit blocker — a limit arrived, nothing failed. The turn
  that crossed the line is allowed to finish: the block is for the next
  spend, never a punishment for the last one. The trigger changes
  silhouette (a drawn triangle), never colour alone.
- **The month outlives the thread.** `thread/reset` empties the window
  and the thread's tally and preserves the monthly ledger — a new
  conversation is not a refund. In the Konfabulator, the stage reset
  re-seeds the month instead, because that button means "fresh demo",
  not "new thread"; the two resets demonstrating different laws is the
  point.
- **The config is the contract.** No `usage`: a priced picker. A null
  rate: a plain picker row. A null `monthlyBudgetUsd`: no month row and
  no blocker, ever. Nothing renders that the host didn't claim to know
  — the same law as suggestions and scope.

## What is deliberately not here yet

- **English copy is hardcoded** — the panel strings ("Next turn on…",
  "the window re-sends each turn", the ledger rows) and the USD
  formatting. Deferred with the same reasoning as the currency field
  below.
- **Real pricing models** — split input/output rates, cache discounts,
  per-seat plans. The single blended rate is the demo's honesty about
  what a projection is; a host with a billing system supplies better
  numbers through the same two fields.
- **Currency abstraction** — the core names USD (`threadCostUsd`)
  rather than pretending a `currency` field makes it international.
  Renaming money is a breaking change worth making once, against a real
  host's requirement, not speculatively.
- **The Context Meter** — budget is money, context is memory. The
  window's own fullness (consequences, not units, with its own exits)
  is a separate surface and stays one.
