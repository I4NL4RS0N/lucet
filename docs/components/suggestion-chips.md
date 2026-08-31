# Suggestion Chips

Prompts made visible, on the cold start.

## The positions

- **The chip is the prompt.** The contract stays this small on purpose:
  `Suggestion { id, prompt, kind? }`. What you click is what sends, verbatim, and
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
- **Ask and Do, apart.** Two kinds, drawn apart: `ask` is turn-by-turn —
  a question, words back, cheap. `do` is a commission — the agent goes and
  works. Both still only send their words (the chip itself never touches a
  system; the agent does the doing), but flattening the two trains people
  to tap without reading, so each kind gets its own labelled group — the label carrying a short
  descriptor ("Answers, in the thread" / "Work handed off and run"),
  because two bare words let the split blur — and its
  own glyph: a speech square asks, the little agent does — shape alone,
  one ink for both (an accent on `do` was tried and cut: two colours in
  one list read as inconsistency, not meaning). An earlier draft of
  this position banished `do` to a future Action Surface entirely; the
  revision is that the *split* was the law, not the banishment — chips
  that merely commission work belong here, and controls that execute
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
  its job. One trailing distinction returned by request: do-rows end in
  the rail's run-triangle rather than the way-in chevron, because "the
  agent takes this and goes" deserved a mark — and the descriptors name
  it outright ("Run by the agent").
- **The lock reaches the chips.** While it is another person's turn, a way
  in that would fail is not offered as live: chips disable under the same
  single-writer rule as the composer.

## The cold start it serves

"Empty & cold start" sits on the unhappy-states list because nobody
designs it. The Configurator's arrival is now that state, designed: an
atmosphere of the accent's own light (silk ribbons and grain, drawn
entirely from tokens), a greeting that asks the genre's honest question
("How can I help?"), one line that names the split ("Ask a question, or
hand a task off."), and the chips beneath as the two labelled ways in. An
auto-fired scenario held the arrival slot for one afternoon; it skipped
the very state a first visit should demonstrate.

## What is deliberately not here yet

- **Direct-execution controls** (labels apart from prompts, duration and
  stop affordances, effects without a turn) — still the Action Surface.
  The `kind` split landed here first and is the seam it will build on.
- **Follow-up suggestions after a response** — same pattern, different
  moment; needs its own visibility rule and restraint.
- **Host-side dynamic suggestions** (varying by page or scope) — the
  contract is static per thread today; Scope Control will pressure this.
