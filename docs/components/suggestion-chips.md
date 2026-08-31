# Suggestion Chips

Prompts made visible, on the cold start.

## The positions

- **The chip is the prompt.** The contract has one field on purpose:
  `Suggestion { id, prompt }`. What you click is what sends, verbatim, and
  it lands in the thread as your own words. A chip whose label differs from
  what it sends is a small lie at the exact moment trust is being
  established — so the type makes the lie inexpressible. (In the
  Configurator the chips are built *from* the scenarios they fire, so
  honesty is by construction, not discipline.)
- **A way in, not furniture.** The core's `suggestionsVisible` owns the
  rule: chips show on an empty, idle thread — the cold start — and leave
  the moment the conversation exists. Chips that linger become decoration,
  and decoration that sends prompts is a misclick farm. Follow-up chips
  after a response are a different pattern with different stakes; they
  arrive with the Action Surface.
- **Conversational only.** Everything here is turn-by-turn, cheap,
  reversible: you get text back. Chips that *do* things — commit, spend,
  touch real systems — are the Action Surface's agentic half, kept
  visually apart, because flattening the two trains people to tap without
  reading. This component is the shallow half of that pattern, built with
  the extension point in mind rather than rebuilt later.
- **The content tier.** Chips wear the composer's white raised chip — the
  same dress as an attachment — because a suggestion is content in
  waiting: not an ambient tool (hairline ghost), not the primary action
  (solid). The three-tier grammar decides; the component obeys.
- **The lock reaches the chips.** While it is another person's turn, a way
  in that would fail is not offered as live: chips disable under the same
  single-writer rule as the composer.

## The cold start it serves

"Empty & cold start" sits on the unhappy-states list because nobody
designs it. The Configurator's arrival is now that state, designed: the
activity orb at rest (`ready` — full quiet ring, slow-breathing core, the
accent, because the welcome is a brand-forward moment), a greeting that is
the orb's own label ("Ready when you are."), and the chips as ways in. An
auto-fired scenario held the arrival slot for one afternoon; it skipped
the very state a first visit should demonstrate.

## What is deliberately not here yet

- **Agentic chips** (kind, labels apart from prompts, duration and stop
  affordances) — the Action Surface.
- **Follow-up suggestions after a response** — same pattern, different
  moment; needs its own visibility rule and restraint.
- **Host-side dynamic suggestions** (varying by page or scope) — the
  contract is static per thread today; Scope Control will pressure this.
