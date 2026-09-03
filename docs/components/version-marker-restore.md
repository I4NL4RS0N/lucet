# Version Marker + Restore

The thread is the version history, and the history speaks in words.
Restore creates; it never deletes. The worst case of any action in this
component is zero — which is what makes it usable by people who have
never heard of a commit.

## The precedent, named honestly

The model follows Figma Make's version handling — the pattern the
design brief cites as the one to beat — extended with per-turn word
badges and attention-following affordances. Crediting the reference is
part of the rationale, not a weakness in it. The three load-bearing
properties adopted from it:

1. **Plain words, not arithmetic.** The primary UI never asks the
   reader to do version math.
2. **The affordance lives on the message.** Restore is where the
   version is, not in a panel.
3. **Nothing is ever lost.** Restoring does not delete or branch —
   every version stays reachable, in both directions.

This resolves the brief's open question §16.2 (branch or discard after
restore): **neither**. History is linear and total. Restore commits as
a copy — a new version of the restored turn lands at the end of the
thread, wearing `Restored`; every later version stays in place and
stays restorable, forward as well as back.

## The positions

- **The groundwork was the point.** `versionId` has been on every turn
  since the contract landed, `retryOf` since Feedback Controls, and
  `restoreOf` completes the pair. This component spends what the
  architecture saved — no new state shape, no parallel snapshot store.
  The thread already WAS the history.
- **The badge tells the reader what happened, in their own language.**
  Which revision of these words, and why it exists — never where the
  store is in its ledger. A number a reader must decode is a developer
  answer to a designer's problem. At rest a versioned turn wears a
  quiet word: `Retried` on a version born from Ask again, `Restored`
  on one born from Restore, `Current` on a badged newest with no
  creation word (`Edited` is reserved for future prompt editing).
  Muted foreground, no tone colour — versioning is bookkeeping, not
  status. The ordinal survives as per-turn metadata, revealed on hover
  or focus: "Version 2 of 2 · retried"; the original reads "Version 1 of
  2" (the count, then how the version came to be). The store's global
  id stays internal; Restore needs a stable address, readers don't.
  (One resolution made in implementation: the spec gives `Current` and
  the creation words a claim on the same badge slot; the creation word
  wins — it narrates the story — and "current" joins the metadata.)
- **Markers only where history is non-linear.** A plain thread stays
  plain: a single-version turn wears nothing.
- **A control labelled Restore must restore.** Two stages, two names
  (audit round 04; the first cut called both "Restore this version",
  and the label was false on the first click). On an older version's
  actions, **Preview version** shows the thread as of that version and
  changes nothing — its tip says so: "Look at this version — nothing
  changes until you restore." Later turns dim for the eyes, go `inert`
  for pointer and tab order, and `aria-hidden` for the reader, so all
  three agree about what "earlier" means. The banner at the seam states
  it plainly ("Previewing an earlier version — N later turns are set
  aside, not deleted") and offers both ways out as a pair with a
  hierarchy: **Return to latest**, a ghost, and **Restore version**,
  the primary, which commits in one click. The pair is the library's
  own button grammar, so fill against no fill carries the difference
  without hue; the labels never wrap, and at drawer width the pair
  takes a row of its own. After the commit the preview chrome is gone
  at once, the restored copy wears `Restored`, and the new current
  turn offers no restore control. Commit is an ordinary event through
  the reducer, covered by a runtime test that walks backward and
  forward through the same history and asserts the store only ever
  grows.
- **The past does not take new prompts.** While previewing, the
  composer is blocked with words, above even the lock: "Previewing an
  earlier version — return to latest to continue." The announce layer
  narrates all three moves in the banner's own language: "Previewing
  an earlier version — nothing changes until you restore", "Returned
  to latest", "Restored an earlier version — the thread continues from
  it".
- **Affordances follow attention.** History keeps its rights — any
  version can still be retried or restored — but the newest version
  earns the resting-state microphone. A turn with a newer version
  recedes at rest: text one step of muted ink, actions at ghost
  weight, badge legible; hover or focus returns full strength.
  Quieting is not hiding; nothing here is ever hidden. The recede is
  a state, not an animation — screen-reader order and affordance
  availability are identical at rest and under the pointer.
- **Restore appears only where it means something.** A settled,
  non-current version, outside an existing preview. The Thread
  decides; MessageActions just draws what it is given, with the
  pre-click answer in its tooltip: "Go back to this version — nothing
  is deleted."

## What is deliberately not here yet

- **Prompt editing** — `Edited` is reserved in the badge vocabulary;
  the mechanics wait for the composer's edit story.
- **A version picker** — jumping between versions from the badge. The
  badges are inert labels until the picker pattern earns its keyboard
  story. (Branching is not deferred; it is resolved as never — see
  §16.2 above.)

## Refusal, adjacent

Boundaries don't take the accent. A refusal is a state, not an alarm,
and never inherits the host's brand colour — the "Declined." lead is
plain foreground in both themes, and the glyph takes its one step of
distance-legibility from stroke, never from colour or size. The
refusal notice surface keeps its info tint; that earlier decision
stands. If the glyph ever needs a second step to read at thumbnail,
the answer is to stop and document the ceiling — a refusal that
shouts at distance contradicts the calm-boundary position.

## The scenarios

`version-history` (asking again makes a new version; the earlier one
recedes instead of vanishing) and `restore-version` (preview an
earlier version, see later turns set aside, return — or restore,
which only ever adds) — the VERSIONS group on the Features tab.

## How far aside

The set-aside turns dim to 0.48 opacity, in every theme and expression.
The rule: active text meets 4.5:1; inert, aria-hidden content meets the
inactive floor of 3:1. A set-aside turn is inert and hidden from
assistive technology, so the floor applies, and 0.48 is the smallest
value that clears it everywhere while carrying the dark cells past 4.5:1
as well, measured against the plane each turn sits on:

| Cell | Body text at 0.35 | Body text at 0.48 |
| --- | --- | --- |
| Dark Glass | 2.91:1 | 4.62:1 |
| Dark Paper | 2.97:1 | 4.67:1 |
| Light Glass | 2.19:1 | 3.14:1 |
| Light Paper | 2.22:1 | 3.22:1 |

The earlier 0.35 read as gone rather than as the past, and fell under
the floor in every cell. Taking light to 4.5:1 would need about 0.72,
which no longer reads as set aside; the marker's word carries the state
alongside the dimming, so the floor is the right bar for it.

## Component audit 05 (2026-09-03)

Ask again, preview, return and restore reviewed as one system, in four
cells at 1440 and 320, inside the Konfabulator. Gate 0 first: the
restore had "felt broken" and seemed to need two clicks. Measured, it
commits from one activation everywhere — pointer, Enter, Space — in
under 40 ms, and a double click makes one version. What produced the
feeling was the silence after the act: the banner vanished, focus fell
to body, the thread scrolled to its end, nothing was spoken, and the
only visible confirmation was a 10.5px *Restored* badge. In the lab the
specimen's buttons are inert by design, so a restore tried there did
nothing at all. The two-stage model stays — a preview, then a commit —
because the preview is where the choice is made; what changes is that
every act is now seen and heard.

- **Exactly one version is Current.** The newest wears the word, and its
  version line stays legible at rest: *Version 2 of 2 · retried*,
  *Version 3 of 3 · restored from version 1*. Older versions wear how
  they came to be — *Retried*, *Restored* — with their line on hover or
  focus, as before. The store's ids stay internal.
- **Focus follows the act.** Entering a preview lands focus on the banner
  that explains it. Restoring lands on the new current version's row,
  which reads its provenance and brings it into view. Returning lands on
  the row of the turn that was previewed. Nothing lands on body, and
  nothing lands on a control that is about to unmount.
- **Every act is spoken once.** A live region beside the response
  announcer says *Previewing version 1 of 2 — 1 later turn set aside,
  not deleted.*, *Returned to latest.*, *Restored version 1 as version
  3.*, *Asking again — writing version 3.* and *Version 3 is ready.* —
  on change only, never on mount.
- **The banner names the version** — *Previewing version 1 of 2 — 1
  later turn is set aside, not deleted.* — and its commit reads *Restore
  this version*, distinct from *Preview version* on the older turn.
- **The acts wait while a version is being written.** Ask again, Preview
  version and a recovery verb are disabled, present and legible, while
  the newest response streams; Copy and feedback stay live because they
  touch nothing.

The lab's specimens stay static; that their primary actions do nothing
is filed for a live specimen later. Restore has no asynchronous state
and no failure path in this runtime, so neither is drawn.
