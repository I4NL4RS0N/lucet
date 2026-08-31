# Feedback Controls

What you can do with a settled response: copy it, ask again, say whether it
helped. Small buttons, large positions.

## The positions

- **Never pointer-gated.** The row is always present in quiet ink on the
  latest turn — where you would actually use it — and revealed by hover
  *or focus* on older ones. Hover-only reveal fails touch (no hover
  exists) and keyboard (nothing to hover with); this library's own stage
  motto is *"nothing hidden behind a pointer."* The reveal is opacity, not
  display, so the buttons stay in the accessibility tree and stay
  tabbable — and Tab itself reveals them. The state audit drives this with
  a real focus call, not a hover.
- **Retry is a commit.** Asking again creates a **new turn that knows its
  ancestor** — `Turn.retryOf` in the contract, `Lucet.retry(turnId)` in
  the runtime, "Turn resubmitted — same words, new commit" in the event
  log. Every prompt is a commit, and a retry is not an exception to that
  law; it is the first thread of the Version Marker + Restore pattern
  showing above the surface. Attachments do not re-send: they left the
  composer with the original turn, and the words are what travel again.
- **Feedback is visible and revocable.** The verdict lives in the contract
  (`Message.feedback: 'up' | 'down' | null`), renders as a pressed state
  with a real silhouette (a hairline container, not just an ink change —
  1.4.1), and taps off again. A rating you cannot see or take back is not
  feedback; it is surveillance. Retraction is an event like any other:
  "Feedback taken back."
- **Copy copies the source.** The response is markdown, and copy hands you
  the markdown — it pastes usefully into anything that reads it and
  degrades to plain text everywhere else. The result is reported honestly
  (*Copied* / *Didn't copy*), the same contract as the code block's button.
- **Only on settled responses.** A stream still arriving offers nothing to
  copy, judge, or retry; the row appears when the message settles — in any
  of its endings, including the unhappy ones. A failed response is
  precisely the one you retry.

## What is deliberately not here yet

- **A timestamp** — needs a ticking clock the contract does not carry;
  worth doing properly with relative-time semantics rather than casually.
- **Copy as plain text** — the markdown position covers the common case;
  revisit on demand.
- **Regenerate-with-changes** ("try again but shorter") — that is a new
  prompt, and the composer already exists.
- The old-era `Message` component's hover-only actions row is superseded by
  this component and leaves with the old-era retirement pass.
