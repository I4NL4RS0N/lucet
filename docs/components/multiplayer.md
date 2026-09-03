# Multiplayer — the turn lock and the collaborative grammar

One thread, several people, a single writer at a time.

## The positions

- **Shared is derived, never flagged.** A thread is collaborative the
  moment its turns carry a second human author:
  `new Set(turns.map(t => t.prompt.authorId)).size > 1`. No
  `multiplayer` prop, no mode switch a host could forget to set — the
  grammar changes because the facts did. A flag can lie about the
  thread; the author set cannot.
- **A second voice changes the grammar for everyone.** Solo, your
  prompts sit right-aligned and faceless — there is only one "you," and
  a face on every bubble is noise. Shared, every prompt moves to the
  left, wears its author's face, and reads as an utterance in a room.
  Consistency beats ego placement: the moment someone else is present,
  *yours* stops being special, because the thread's job is now to say
  who said what.
- **The bubble points at its speaker.** The speech tail survives as one
  anchored corner — the bubble's corner nearest the speaker squares off
  (4px against the full radius) while the other three stay round. The
  avatar sits outside the bubble, bottom-aligned, exactly where the
  squared corner points, so the face and the tail meet (the Figma Make
  composition). A drawn tail would be chrome; a corner is grammar.
- **The design work is not the lock — it is the waiting.** While
  another person's turn is in flight the composer locks for everyone,
  and being locked out feels dead unless you can see whose turn it is
  and still act. So the blocker strip wears the *locker's* face (a
  person is the clearest possible statement that this is multiplayer,
  and the copy names the shared thread outright), and the field stays
  writable: **Queue** lodges your draft and it sends itself the moment
  the thread frees — a promise the runtime keeps, not just copy. Locked
  by your own run shows the working orb instead; machine work gets a
  machine mark.
- **Presence is a read.** The core is an event log, so authorship,
  the lock, and the queue are reductions of recorded events — history,
  versions, provenance and presence come from the same place, and none
  of them is a feature glued on top.

## What is deliberately not here yet

- **Live cursors and typing indicators** — presence beyond the lock is
  transport-dependent; the contract stops at what the event log can
  claim.
- **Simultaneous drafts / CRDT composing** — the single-writer lock is
  a position, not a limitation: AI threads are turn-based because the
  model's answer depends on the thread state it was asked against.
- **Author colours** — identity is carried by face and name; adding a
  colour channel per person would spend the palette's meaning budget
  (tones carry state) on decoration.

## Component audit 06 (2026-09-03)

Ownership, drafting, Queue and the handoff, measured in the Full page,
the Drawer and the phone, four cells each. Gate 0 first: Jennifer authors the
prompt and the response belongs to her turn; the composer is held by her.
Three things did not describe that model. The person here was offered a
plain **Stop** that interrupted her response. The strip said *yours sends
next* before anything was queued. And a stop during her run handed the
queued words back to the field, as if the person here had taken control.

- **Only the owner stops their run.** While another person's turn runs
  the seat holds **Queue** — disabled until there are words, named
  *Queue — sends after Jennifer's response* — and never Stop. Your own run
  keeps Stop, with Queue beside it when a draft is typed. Nothing in an
  ordinary composer ends someone else's work.
- **The strip says who asked and what you can do.** *Responding to Jennifer —
  you can queue a message* with an empty field; *Responding to Jennifer — Queue
  sends after this response* once you type; *Queued after Jennifer — yours
  sends next* once you queue; *Sending your queued message* at the
  handoff, where the runtime dwells; *Responding to you* for your own
  run. Nothing claims a queue before there is one.
- **The queued item shows the words and two ways back.** Under the
  status line, the queued message itself, clamped to two lines, with
  **Edit** and **Cancel queue**. Edit returns the exact words to the
  field — before the queue lets go, and ahead of any newer draft — with
  the caret after them. Cancel drops only the queued words. Both say so
  once, and neither touches Jennifer's run.
- **The handoff is one turn, said once.** When her response settles the
  queued words become a turn of yours, the strip reads *Responding to
  you*, and one sentence is spoken: *Your queued message was sent —
  responding to you.* In a shared thread your prompt carries a hidden
  *You* for the reader, since position says it only to the eye.
- **A stop during her run is terminal.** Only the owner may stop, so a
  stop while her turn runs is hers, and the queue keeps its promise and
  sends. A stop of your own run still hands the words back: you took
  control.
- **A control that mounts under a resting pointer shows no tip.** The
  Stop that appears at the handoff arms its tooltip only once the pointer
  moves over it.
- **Focus stays with the words.** A disabled seat passes the pointer
  through, and a press on the group's dead space keeps the field, so the
  second click of a double click on Queue — which lands where *Queued* now
  sits — moves nothing. Spoken sentences empty once nothing is locked or
  queued; a reset leaves no stale announcement behind.
- **The queued item is heard once, from the strip itself.** The status
  strip is a `role=status` live region, so an accepted queue is announced
  by the strip's own change — the sentence, the words that wait, and the
  two actions — exactly once, by pointer, Enter or Space. Typing into the
  field while queued and a theme change say nothing more. Edit and Cancel
  queue keep their quiet 28px silhouette and offer 40px targets, 44px
  under a coarse pointer, extended invisibly above and below so the two
  never overlap.

Considered and kept: your own prompts stay right-aligned and faceless in
a shared thread (the 2026-09-02 ruling), now with the hidden *You*. Not
reproducible live: Jennifer's response failing — the demo scripts her turn to
succeed; the interruption path stands in for the terminal-state rule.

## Component audit 07 riders (2026-09-03)

- **Jennifer Lee.** The other person in the thread is Jennifer Lee, JL on
  the disc. The compact ownership copy uses her first name — *Responding
  to Jennifer — you can queue a message*, *Queued after Jennifer — yours
  sends next* — while the thread's author label carries the full name.
  The first name is the first word of the author's name; a host with
  other naming conventions passes the name it wants spoken.
- **No frame between turns.** Two one-frame states filed in round 06 are
  gone at the source. The composer now frees the moment the response
  settles, in the same synchronous breath — not at the end of the run,
  after the post-settle steps — so *Sending…* never shows over a finished
  answer. And the queue promise runs from the runtime's hook inside that
  same breath, so the handoff takes the lock before anything renders: the
  strip goes from *Queued after Jennifer — yours sends next* straight to
  *Responding to you*, with no *Queued — sends after this response* between.
  The runtime test asserts the order — settled, unlocked, dequeued,
  submitted, locked — and that no microtask can observe the unlocked
  queue.
