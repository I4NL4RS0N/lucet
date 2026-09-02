# Tool Call

The machine did something in the world; this is the receipt.

## The positions

- **Legible at the top, exact underneath.** The row speaks words: the
  tool's name and the outcome (`detail`). The raw exchange — *what it was
  asked* and *what came back* (`args`/`result` in the contract, serialized
  however the host chooses) — waits behind the disclosure for whoever needs
  the receipt. This is the same progressive-disclosure split as the event
  inspector, and the shallow end of the Audit Trail pattern this grows
  into: claim → source → transformation.
- **Name tools in words, not identifiers.** The row is a sentence for
  readers — "Searched the documents", not `search_documents`. The component
  renders what it is given, so the naming judgment sits with the host; the
  built-in scenarios model the good practice, and identifiers stay exact in
  the payload where they belong.
- **Nothing to show, nothing to open.** The chevron exists only when the
  host shared a payload. A disclosure over an empty body is the dead
  "expand" this thread shipped once in a placeholder; the state audit now
  fails if any tool disclosure is empty *or* any payload-less row grows a
  chevron. A chevron is a promise.
- **Partial is an outcome, not a footnote.** `partial` exists in this
  contract and almost nowhere else in the category, because
  succeeded-or-failed is the lie that lets a product answer confidently
  from two thirds of the data. It wears the caution ink and says so in
  words — and the well-written response repeats it in prose, because the
  reader who never glances at the chip still deserves the warning.
- **The chip does not wear a banner.** Like the thread's endings (where
  *Declined* deliberately refuses red), the unhappy settlements put their
  ink on the **word and the silhouette** — "Failed", "Partly done" — and
  the surface stays calm. A tinted band inside someone's answer shouts;
  a strong word reads.
- **Weight only where the reader must act.** Running is a progress report:
  the orb and the tool's name, nothing louder — expandable mid-run to see
  what was asked. Success is a silhouette plus its outcome words (with a
  screen-reader-only "Done"). Only failed, partial, and waiting carry a
  visible status word.

## What is deliberately not here yet

- **Duration and cost** — "took 1.4s" belongs with the same contract timing
  work the reasoning row is waiting on; cost belongs to the Budget Meter.
- **Copy on the receipt.** The payload blocks are for inspection in place;
  copy stays with the CodeBlock, whose contents are meant to be taken away.
  Revisit if real use disagrees.
- **Announcements.** The response announcer speaks the answer's text only.
  A partial failure reaches a screen reader through the response's own
  words — which is a copy standard, not a rendering guarantee; whether the
  row itself should announce its settlement is an open question recorded
  here on purpose.
- **Approval gates** ("this tool wants to run — allow?") — that is the
  human-approval unhappy state, and it arrives with the Action Surface's
  agentic half, not this receipt.

## Staged groups (2026-09-02)

A request that changes several things in the world runs several tools,
and the honest receipt for that is not three chips appearing one after
another already finished. In a staged group (the runtime's `tools` step)
every receipt enters together as **pending** — the work still to come is
visible from the first frame — and then each runs and settles in order,
roughly half a second apart, with the answer waiting for the last. A
frame frozen in the first second shows agent work under way and what is
queued behind it; no receipt ever enters complete.

Every state has a static label, so the frame reads without motion:
"Waiting to run", "Running" beside the live counter, the outcome words on
settle, and "Failed" or "Partly done" in ink for the unhappy ends. The
mark — orb while running, silhouette otherwise — lives in one fixed 16px
slot, so the name beside it never moves. When the mark changes while the
receipt is on screen it fades into place over the last one (the switch:
no travel, no scale, no bounce); a receipt that mounts already settled
paints still, because motion is evidence and nothing happened here.
Reduced motion keeps the sequence and the labels and drops the fade.
Reset mid-run cancels what remains.
