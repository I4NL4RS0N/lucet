# Suggestion Chips

Prompts made visible, on the cold start.

## The positions

- **The chip is the prompt.** The contract stays this small on purpose:
  `Suggestion { id, prompt, kind? }`. What you click is what sends, verbatim, and
  it lands in the thread as your own words. A chip whose label differs from
  what it sends is a small lie at the exact moment trust is being
  established — so the type makes the lie inexpressible. (In the
  Konfabulator the chips are built *from* the scenarios they fire, so
  honesty is by construction, not discipline.)
- **A way in, not furniture.** The core's `suggestionsVisible` owns the
  rule: chips show on an empty, idle thread — the cold start — and leave
  the moment the conversation exists. Chips that linger become decoration,
  and decoration that sends prompts is a misclick farm. Follow-up chips
  after a response are a different pattern with different stakes; they
  arrive with the Action Surface.
- **Ask and Do, apart — by weight, not by badge.** `ask` is turn-by-turn:
  a question, words back, cheap — a light divider row. `do` is a
  commission — the agent goes and works — so its row is a BOUNDED CARD
  that states its cost before the tap: what it will touch
  (`Suggestion.effect`) and how long (`Suggestion.durationHint`), in the
  host's own words. Both kinds still only send their words verbatim (the
  chip never touches a system; the agent does the doing), but two
  identical lists under different eyebrow labels was exactly the
  flattening the brief calls a safety failure — it trains people to tap
  without reading. Badges were tried on the way here and cut twice: a
  per-kind glyph, then an accent on `do` (two colours in one list read
  as inconsistency, not meaning). The surviving rule: the difference is
  structural weight and stated cost, never decoration. Once a
  commission runs, Stop on the composer is the path out. An earlier
  draft banished `do` to a future Action Surface entirely; the revision
  is that the *split* was the law, not the banishment — chips that
  merely commission work belong here, and controls that execute
  directly still do not.
- **The toggle is the config.** A group exists only while it has
  suggestions: populate ask, do, both, or neither, and the layout follows.
  No boolean props to fall out of sync with the data — and suggestions
  without a `kind` still render as one unlabelled list, so the field is an
  upgrade, not a migration.
- **The menu, not the object.** Chips wore the composer's raised
  content tier for two rounds — then the home seated the composer IN
  the page, and four raised cards above the one box that matters read
  as competition, not hierarchy. Revised: suggestions are a quiet MENU
  — text, a divider, a way-in chevron, the sources' and history's own
  grammar — and the composer stays the only box on the home. The
  per-row kind glyphs left in the same pass: once the group labels said
  the split out loud, the icons were reinforcement that had outlived
  its job. A trailing distinction (the rail's run-triangle on do-rows)
  was tried next and cut too — the second cut of the same idea, which
  makes it a position: the trailing slot is the way-in affordance, the
  way in is identical for both kinds, and the WORDS carry the kind.
  The do-card is not this cut coming back: what was cut was four raised
  cards competing with the composer for OBJECT status, and decoration
  standing in for meaning. The card returned only for commissions, only
  below the composer, and only carrying information — the cost line is
  what earns the border
  ("Run by the agent").
- **The lock reaches the chips.** While it is another person's turn, a way
  in that would fail is not offered as live: chips disable under the same
  single-writer rule as the composer.

## The cold start it serves

"Empty & cold start" sits on the unhappy-states list because nobody
designs it. The Konfabulator's arrival is now that state, designed: an
atmosphere of the accent's own light (silk ribbons and grain, drawn
entirely from tokens), a greeting that asks the genre's honest question
("How can I help?"), one line that names the split ("Ask a question, or
hand a task off."), and the chips beneath as the two labelled ways in. An
auto-fired scenario held the arrival slot for one afternoon; it skipped
the very state a first visit should demonstrate.

## What is deliberately not here yet

- **English copy is hardcoded** — the Ask/Do group labels and their descriptions. A labels escape hatch is
  deferred until a real host shows which strings it must own;
  freezing a copy API speculatively would freeze the wrong one.
- **Direct-execution controls** (labels apart from prompts, per-action
  stop, effects without a turn) — still the Action Surface. The `kind`
  split and the cost line (`effect` + `durationHint`) landed here
  first and are the seam it will build on.
- **Follow-up suggestions after a response** — same pattern, different
  moment; needs its own visibility rule and restraint.
- **Host-side dynamic suggestions** (varying by page or scope) — the
  contract is static per thread today; Scope Control will pressure this.
