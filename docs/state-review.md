# First look at the triggered states — findings

2026-09-01. Refusal and Tool partly fails, screenshotted in full page ×
both themes × both expressions, reviewed at the same severity as the
default view. The failure→recovery chain was driven live (partial tool
failure → Ask again → complete response) and recorded to
`docs/media/state-recovery.webm`. Findings are FILED here, not fixed
inline — first sight of the states is supposed to produce a work list,
and absorbing it silently would hide the scope.

## What holds

- **Refusal** reads as its own silhouette: minus-circle glyph plus a
  bolded "Declined." lead, then the explanation and the nearest thing
  it can actually do. No tone-colour panic; Ask again present. 1.4.1
  holds — glyph and word, never colour alone.
- **Tool partly fails** is the strongest single screen in the project:
  "Partly done" in caution ink with the half-filled glyph, "2 of 3
  sources returned. Timed out on the third.", and an answer that names
  the gap instead of papering over it.
- **The chain reads as a story.** Failure receipt (half-circle, amber)
  → "v4 · same words, new commit" over the re-sent prompt → success
  receipt ("Retried the vendor quote — 1 source returned") → complete
  answer. Each state is a distinct silhouette in sequence. The retry
  recovery is the runtime keeping the promise the failure text makes
  ("Ask again and I will retry just that one") — added for this chain,
  covered by a runtime test.
- Both states inherit the mid-thread opener above them, so the thread
  reads continuous, not staged.

## The work list

1. **Version numbering reads wrong in the story.** The re-sent prompt
   wears "v4" on its first retry. The badge is honest about the store
   (versions count globally), but a reader sees the second version of
   these words and expects v2. Decide: per-turn version counters, or a
   badge that says "retry" rather than a number.
2. **A superseded turn keeps its full affordance row.** After the
   recovery lands, the FAILED turn above still offers Ask again at
   equal weight. Retrying a superseded version is legitimate (the
   versioning law), but the affordance should probably quieten once a
   newer version exists.
3. **Refusal's glyph is quiet at distance.** At full size the
   minus-circle plus "Declined." reads; at thumbnail the row is nearly
   a plain answer. Consider one step more optical weight on the glyph
   — not colour, weight. Calibration question, not a defect.
4. **Restore appears mid-chain without introduction.** It arrived next
   to Ask again on the failed turn (correct — the turn became a
   restore point), but nothing in the frame says what it does. The
   feature exists in the rail's Features tab; the first-contact story
   may deserve a tooltip pass.
5. **Recording tooling.** No ffmpeg on this machine, so the capture is
   webm-only (~1.5MB, ~25s). Fine for the repo; a gif or mp4 variant
   for the README embed needs either ffmpeg or a drag-upload to
   GitHub's CDN when the README section is written.

## Verdict

The differentiator thesis survives its first sighting: the unhappy
states are designed, distinct, and the recovery chain demonstrates
state → affordance → state legibly. The work list above is real but
none of it blocks showing the states.
