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
  or focus: "2nd version of this prompt · retried". The store's global
  id stays internal; Restore needs a stable address, readers don't.
  (One resolution made in implementation: the spec gives `Current` and
  the creation words a claim on the same badge slot; the creation word
  wins — it narrates the story — and "current" joins the metadata.)
- **Markers only where history is non-linear.** A plain thread stays
  plain: a single-version turn wears nothing.
- **Restore is safe to press because pressing it first shows you, and
  committing it only adds.** First activation previews: the thread
  renders as of that version — later turns dimmed for the eyes,
  `inert` for pointer and tab order, `aria-hidden` for the reader, so
  all three agree about what "earlier" means. The banner at the seam
  states it plainly ("Viewing an earlier version — N later turns are
  set aside, not deleted") and offers both ways out: **Return to
  latest**, and **Restore this version**, the commit. The banner is
  the feature's own explanation — a control that appears with its
  consequences stated needs no tutorial. Commit is an ordinary event
  through the reducer, covered by a runtime test that walks backward
  and forward through the same history and asserts the store only
  ever grows.
- **The past does not take new prompts.** While previewing, the
  composer is blocked with words, above even the lock: "Viewing an
  earlier version — return to latest to continue." The announce layer
  narrates all three moves in the banner's own language: "Viewing an
  earlier version", "Returned to latest", "Restored an earlier
  version — the thread continues from it".
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
