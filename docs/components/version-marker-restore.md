# Version Marker + Restore

Every prompt is a commit; the thread is the version history.

## The positions

- **The groundwork was the point.** `versionId` has been on every turn
  since the contract landed, `retryOf` since Feedback Controls, and the
  `restore/entered` / `restore/exited` events sat in the union waiting.
  This component spends what the architecture saved — no new state
  shape, no parallel snapshot store. The thread already WAS the history.
- **Markers only where history is non-linear.** A plain thread stays
  plain. The `v{n}` chip appears on a superseded prompt ("superseded by
  v2") and on the retry that superseded it ("same words, new commit" —
  the log's own language). Version numbers are the turn's position:
  commits, counted.
- **Restore is a VIEW, not a deletion.** `restore/entered` walks the
  view back to a commit: later turns are set aside — dimmed for the
  eyes, `inert` for pointer and tab order, `aria-hidden` for the reader,
  so all three agree about what "as of v1" means. Nothing is destroyed;
  `restore/exited` returns to latest. The banner sits at the seam where
  history diverges, counts what it set aside, and offers the one way
  forward (`role="status"`, so the mode change is announced without
  stealing focus).
- **The past does not take new commits.** While restored, the composer
  is blocked with words — a new `restored` blocker above even the lock:
  "Viewing a restored state — return to latest to continue."
- **Restore appears only where it means something.** A settled,
  non-latest turn, outside an existing restored view. The Thread
  decides; MessageActions just draws what it is given.

## What is deliberately not here yet

- **Branching from a restored view** — submitting from the past as a
  new branch commit. The seam is named: it is `retryOf` generalised
  from "same words" to "new words from an old point," and the blocker
  copy is where the affordance will replace the refusal.
- **A version picker** — jumping between commits from the marker chip.
  The chips are inert labels until the picker pattern earns its
  keyboard story.

## The scenarios

`version-history` (a retry supersedes v1, both marked) and
`restore-version` (walk back to v1, two turns set aside, Return to
latest live) — the VERSIONS group on the Features tab, both running
their second commit through the same post-settle door the sources
scenarios opened.
