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
  is just anxiety. Both threshold states are triggers in the States
  rail's COST group — a designed state nobody can trigger is
  indistinguishable from an undesigned one, and these two went
  unreviewed for exactly that reason until they joined the rail.
- **Tone marks state relative to a limit, never raw magnitude.** A
  price is an attribute; crossing a budget is a state. Colouring cheap
  green and capable red would impose a value judgment the system cannot
  know, make choosing a stronger model feel like an error, and dilute
  what danger means everywhere else. The figures stay ink; the
  threshold wears the tone — glyph and words with it, never colour
  alone. The states audit pins this: no tone colour on any figure, row,
  or model option by magnitude, in either theme, at rest or in
  caution.
- **A bar needs a denominator.** The month ledger was three figures the
  reader had to compute into a proportion — the one place in the
  component where a graphic carries what text cannot. The month row
  wears a thin proportion bar: track in the inset grammar, record fill
  at neutral ink strength, and the projection as a LIGHTER extension —
  the ≈ semantics drawn, an estimate never solid. Caution ink arrives
  only via the same booleans that set the chip's state, so the bar
  cannot disagree with the trigger. The figures stay beside it in full
  (1.4.1: the bar never carries the information alone). The thread row
  has no limit, so it has no proportion to draw, so it has no bar.
- **The panel states; the rationale teaches.** "The window re-sends
  each turn" is a good sentence that was rendered on every open. The
  projection line keeps the token count; the coupling explanation
  lives in the row's title and here: the context window re-sends with
  every turn, which is why long threads cost more per turn — budget
  and context are two meters that couple without conflating.
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

## Floating surface — stacking decision (2026-09-01)

In-tree by design. The panel anchors inside the composer's own
stacking context and always wins within the component; nothing the
library renders can occlude it. What CAN occlude it is a host whose
own chrome floats above the composer at a higher layer — that is the
host's z-ladder to manage, and the honest fix on the host side is
the top layer, not a bigger number. The docs site's chrome popovers
use the native Popover API for exactly this reason. An opt-in
top-layer mode for this surface (Popover API, keeping the current
anchoring as fallback) is filed for 0.2. The states audit probes
this surface open, in all four theme-and-expression cells, and fails
on any occlusion.

## The hold (2026-09-02)

The caution note said what a turn would cost and what remains; the send
button did not know. Now the first Send that would cost more than the
month has left does not send. The runtime holds it (`composer.intercept`,
one derived rule shared with the meter's own caution, so the two can
never disagree) and this panel opens on the reason — the context that
makes the turn expensive — with two explicit ways across:

- **Use Fast · ≈$0.03** — the cheapest model whose next turn still fits.
  Selecting it releases the hold and hands focus back to Send; the person
  confirms with a second press, now within the month.
- **Continue on Auto · ≈$0.14** — sends at once. The expensive choice is
  the person's, made in words with its price beside it.

Escape, or a click away, closes the panel without sending; the draft
stays and focus returns to Send. A model change releases the hold on its
own. A queued prompt that would cross the month is handed back to the
field under the same hold rather than sending behind anyone's back. No
modal: the panel is the meter's own, anchored in the composer, so the
context explanation and the priced rows stay in view. The states audit
walks the hold with mouse and keyboard on the full page and on the phone,
where the panel must be entirely visible and reachable by Tab.

## Component audit 03 (2026-09-03)

The cost decision as one family — trigger, picker, ledger, hold —
measured in four cells at 1440 and 320. Two rulings and four repairs.

- **A running turn is never aborted for cost.** The projection was on
  the trigger before the send, so a turn in flight was already consented
  to at its price. When the ledger crosses the month mid-turn nothing
  about that turn changes: the ledger updates, the response lands, and
  the NEXT send meets the wall (`submitBlocker` → `'budget'`) or the
  hold. The runtime test for the crossing month asserts the response
  completes and the log carries no stop.
- **The estimate has a slot, the trigger has no fixed width.** The
  price span reserves 4.1em — seven glyphs at this size, "≈$0.003" or
  "≈$10.00" — so a draft crossing the cent no longer moves the chip by
  the width of a digit (the 8px jitter). The model label still sizes
  the trigger, because a hard-coded trigger width fails the first
  translation; the states audit asserts that attach and Send do not
  move through model and price changes.
- **Figures in a column align, or they are not a column.** The check
  that marked the selected row pushed that row's price 21px out of the
  column. Every row now reserves the 13px slot; the mark fills it on
  the selected row. The trailing-check grammar is unchanged.
- **The track is the denominator.** In the muted surface the month
  bar's track measured 1.0–1.2:1 against the panel in every cell — the
  fill read as a loose line, not a portion of a whole. The track is now
  a 55% mix of the muted foreground into the card (2.3–2.8:1 against
  the panel), the record fill is ink, and the projection extension is
  the same ink at 35%. Stronger was measured and refused: at 70% the
  caution fill falls to 2.5:1 against the track in the light cells, and
  fill-against-track is the audit's 3:1 rule. The figures beside the
  bar remain the information; the bar remains the proportion.
- **The hold's buttons carry their price in their own ink.** The price
  inside "Use Fast · ≈$0.03" kept the row's subtle colour and small
  size: 2.3:1 on the primary in light Paper, 3.2:1 on the secondary in
  dark Glass. It now inherits the button's colour and size.
- **Disabled is disabled for every input.** While a turn is in flight
  the trigger cancelled pointer events but stayed in the Tab order, where
  Enter and Space opened the panel and could change the model mid-turn,
  and nothing told a screen reader. It now leaves the Tab order, cancels
  its toggle, carries `aria-disabled`, and a panel that is open when the
  lock arrives closes. The composer's strip already says why.
- **The hold says what each way does.** The buttons carried prices, and
  the second press after "Use Fast" went unexplained. The note now ends:
  *Use Fast switches the model and returns you to Send. Continue on Auto
  sends now.*

Considered and kept: one panel for model rows and the ledger (at 320 the
panel is 236px wide, inside the viewport, every row on one line, only
the month row wraps to two — scannable, so no split); no new progress
bar (the month bar is the one graphic, and it stays supplementary to the
figures); the picker closes on the same frame the selection registers
on the trigger, because a delay before closing would be motion theatre.
Filed low for a later pass of this component: sub-cent prices show three
decimals beside two-decimal neighbours; the projection extension is a
sub-pixel sliver at realistic magnitudes; the projection row's `title`
is hover-only; the month ledger row wraps at 320.

## The wall has no exit (2026-09-03, independent verification)

An independent pass on the deployed round found the one contradiction
the matrix had not: the spent strip offered **New thread**, and in the
Konfabulator that verb re-seeded the month — the demo's Reset wearing
product clothes. A cap that a new conversation can leave is a thread
limit labelled as a month. The product rule is the reducer's own law,
now carried all the way to the surface:

- **A spent month is an account state.** It outlives the thread, so no
  verb on the composer offers a way out of it. The strip states the wall
  and exactly when it lifts — *This month's budget is spent. New turns
  are paused until it resets on Sep 5 at 01:41.* — and nothing else. The
  `onNewThread` prop is gone with the exit; a host with a real budget
  destination adds its own verb, and no fictional one stands in.
- **Every new-thread path keeps the month.** The sidebar's, the drawer's
  and the phone's New thread all run `thread/reset`, which empties the
  window and the thread's tally and preserves the budget, the spend, and
  — from this pass — the reset time, so the wall in the next thread
  still says when it lifts. The runtime test pins it; the states audit
  starts a new thread from the sidebar with the month spent and asserts
  the state, the strip, the blocked Send, the trigger's name and the
  inert rows all survive it.
- **Readable, not actionable.** While the month is spent the trigger and
  its panel still open — the ledger is the explanation — but the model
  rows are inert and say so (`aria-disabled`), because no model can
  produce an allowed send. The price stays hidden on the trigger, as
  before.
- **The demo's escape hatch stays the demo's.** The Konfabulator's Reset
  re-seeds the month, because that button means "fresh demo". It is the
  only thing that does, and the audit asserts it restores the seed.
- **The 320 measure.** With no verb reserving room beside it, the status
  sentence takes the strip's full width at the phone width instead of
  stacking into a narrow column.

## Component audit 07 rider (2026-09-03): the panel's anchor

The panel used to open at the bar's end edge, above Send, which read as a
send setting. It now opens above its own trigger with its start edge on
the selector's — a 6px gap, no pointer arrow — and slides along the bar
only as far as staying inside it requires. A bar narrower than the panel's
natural width (the phone) gets the panel across its whole inner width
instead. The component measures on open and on resize, imperatively —
a first cut kept "open" in React state, and the re-render on toggle
re-attached the menu grammar's listeners in the middle of the toggle
dispatch, so its focus-on-open never ran; the state audit caught it.
Until the measurement lands (the toggle event is a task after the open)
the panel keeps its round 03 geometry at the bar's end edge, so an open
inspected in the same tick is still inside the viewport. The menu's
rows, keyboard behaviour, focus return and materials are untouched.
