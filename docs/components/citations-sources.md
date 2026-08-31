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
- **Triple-coded condition.** Word, silhouette, and tone together:
  stale wears the caution ink and a turned-back clock; gone strikes the
  title through and wears danger. Never colour alone (1.4.1). The tone
  inks are the same audited pairs the endings use, so the AA proof is
  inherited, not re-argued.
- **Words, not URLs.** The demo cites documents in collections
  ("Plans / Quarterly"), so no row pretends to be a link.

## What is deliberately not here yet

- **Interactive inline markers** — `[n]` is plain text on purpose.
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
