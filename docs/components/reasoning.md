# Reasoning

The thinking disclosure: what the model worked through on the way to the
answer, present but never presumptuous.

## The positions

- **Working, not answer.** Reasoning never renders in the response body —
  mixing them teaches people to read the thinking as conclusions. It wears
  the *quote's* grammar instead: a hairline rail and muted ink, because
  that is literally what it is — the machine quoting its own working.
- **Collapsed by default, and it never opens itself.** Pushing the thinking
  at people is the same mistake as mixing it in. But the row is expandable
  the whole time, *including mid-stream*: open it while the model thinks
  and the working arrives live, caret riding, through the same
  streaming-safe markdown as the response. Watching it think is opt-in.
- **The row is the loading state.** While the model thinks, the summary
  carries the activity orb and its word — "Thinking…" — so the wait has a
  face and a name instead of a mystery spinner. At settle it becomes a
  plain fact: "Thought about it."
- **A real control, with real states.** Native `<details>`/`<summary>` — the
  browser owns expanded/collapsed and announces it — dressed with the same
  hover veil, press, and focus ring as every other control, on a ≥24px row.
  Its predecessor in the thread was a div that *said* "expand" and did
  nothing; the state audit now clicks the row on every run so that class of
  dishonesty cannot ship again.
- **Not announced.** The thread's announcer speaks the answer, never the
  working. A screen reader user opts into reasoning exactly the way a
  sighted one does: by expanding it.

## Arrival, while we are here

The same session landed the thread's arrival choreography: a prompt, a
response, an aside, an ending each make **one quiet rise** (220 ms, a few
pixels, then stillness) instead of popping into place. When every
appearance is instant the eye cannot follow what changed; one motion at the
mount is choreography, not decoration. Streaming text needs none of it —
the caret's crawl is its own continuity. All of it yields to
`prefers-reduced-motion`.

## What is deliberately not here yet

- **Duration** ("Thought for 12 seconds") — needs timing on the reasoning
  part in the contract; worth adding when a real transport supplies it
  honestly rather than the mock inventing it.
- **Cost of thinking** — extended reasoning is billed thought; surfacing it
  belongs to the Budget Meter pairing, not this row.
- **Summarized reasoning** — some providers ship a redacted précis rather
  than the raw stream; the contract's single `text` field carries either,
  and the row does not currently distinguish them.
