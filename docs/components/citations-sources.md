# Citations & Sources

The response's bibliography, and what time does to it.

## The positions

- **Sources are part of the message.** They arrive as a `SourcesPart`
  through the same `part/added` event as everything else, live in the
  event log, and survive in history — not a tooltip's worth of
  decoration bolted on at render. Inline `[n]` markers in the text refer
  to the list's order.
- **A citation is a claim with a timestamp.** The source was true when
  cited and keeps aging afterwards, so `status` lives in the contract:
  `ok`, `stale` (updated behind the citation), `gone` (removed
  outright). The aging states are the half nobody designs — a
  bibliography that can only say "fine" is not reporting.
- **The world moves after settle.** `source/changed` is the one new
  event, and the mock runtime deliberately lets `wait` and
  `sourceChange` steps run *after* a response settles — because that is
  when sources actually rot. The event log narrates it in words: "A
  cited source is no longer available."
- **The row is the words, the trace is the receipt.** Which pages of
  the document ("Pages 4–6"), the query as it ran, what was retrieved —
  full traceability behind the tool call's own disclosure grammar, under
  the same law: no trace shared, no chevron drawn, nothing dead to
  expand. Dividers hold the rows apart now that rows open.
- **Triple-coded condition.** Word, silhouette, and tone together:
  stale wears the caution ink and a turned-back clock; gone strikes the
  title through and wears danger. Never colour alone (1.4.1). The tone
  inks are the same audited pairs the endings use, so the AA proof is
  inherited, not re-argued.
- **Words, not URLs.** The demo cites documents in collections
  ("Plans / Quarterly"), so no row pretends to be a link.

## What is deliberately not here yet

- **English copy is hardcoded** — the per-kind trace labels and status words. A labels escape hatch is
  deferred until a real host shows which strings it must own;
  freezing a copy API speculatively would freeze the wrong one.
- **Marker-to-row linking** — `[n]` is plain text on purpose.
  Linking markers to rows needs citation tokens at the parser level,
  which is the same live-edge-versus-settle question tables raised;
  it will be answered there, not improvised here.
- **Hover previews and click-through** — they belong to the host's
  document model; the contract's `location` field is where they attach.
- **Announcer sentences for aging** — a post-settle change cannot enter
  `announcementPlan` without breaking its prefix invariant, the same
  posture as tool settles. The event log describes it; a host live
  region is the extension point.

## The scenarios

`cited-response` (everything standing), `source-updated` (stale, 1.6s
after settle), `source-gone` (removed after settle) — the SOURCES group
in the rail, each self-contained, the twins honest with their prompts.

## Component audit 07 (2026-09-03)

The bibliography reviewed against the composer's files and the thread's
provenance, so the three never read as one thing: scope tells the
assistant what is in context, attachments are what you bring, sources are
what it used. The contract held — sources arrive as a part, age in place,
and a removed source stays listed and struck — and two gaps closed.

- **Markers are links.** `[n]` in the answer, within the bibliography's
  count, is now a link to row n: Enter or a click moves focus to the row
  (its receipt's summary when it has one) without leaving the reading
  position, and Escape on the row sends focus back to the marker. The
  rows carry anchors from the part's id, so the mapping is one-to-one
  by construction; a marker still arriving ("[1" without its bracket)
  stays text until it is whole. This replaces the deferral above: no
  parser change was needed — the text node is split after the parse.
- **Escape closes a receipt.** An open disclosure closes on Escape and
  focus stays on its row, as the menu grammar already promised elsewhere.
- **Rows are targets.** Every row is 40px tall, 44px under a coarse
  pointer, so the summary rows meet the site's target floor and plain rows
  keep the same rhythm.

Recorded, unchanged: a stale source's explicit path to current content is
the response's own *Re-check answer*, which re-reads the source and says
what held; a removed source's is *Replace source*, which swaps the dead
row for the archived copy on the person's action. Neither happens on its
own. That *Replace source* substitutes the row rather than keeping the
struck one beside its replacement is filed as a product question, not
changed here.
