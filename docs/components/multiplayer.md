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
