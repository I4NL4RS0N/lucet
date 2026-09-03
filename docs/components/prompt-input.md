# Prompt input

The composer: where a person writes, attaches, picks a model, and sends. First
component built, because everything else in an AI interface is downstream of a
prompt existing.

## What it is made of

State first. The component renders `ComposerState` + `ModelState` and never
owns state of its own:

- **Text**, with the turn lock and the queue. When anyone submits, the
  composer locks for everyone until the response settles. Queuing **lodges**
  your prompt and clears the field — and "yours sends next" is kept by the
  runtime, which actually submits the queued prompt the moment the turn
  frees. Stopping a response is different: Stop means *I am taking control*,
  so an unsent queued prompt is handed back to the field instead of firing
  behind your back. Both behaviours are contract-tested.
- **Attachments**, where *uploading is a state, not an instant*. Every
  attachment is `uploading → ready | failed`, and a failure carries its
  reason. Most composers pretend attaching is synchronous, which leaves the
  failure nowhere to live except a toast.
- **Model choice**, on the thread rather than the composer: it applies to the
  next turn, drives projected cost, and is the extension point the Budget
  Meter grows out of. Options are capability-named (`Auto`, `Fast`,
  `Deep reasoning`) — a library that ships one vendor's model names reads as
  built for that vendor — and the default is **Auto**, which describes what
  happens to your prompt (the system fits the model to it) rather than
  describing a tier of machine.

## The position: a send button that says why

`submitBlocker(state)` returns one reason or null — `locked`,
`service-down`, `attachment-uploading`, `attachment-failed`, `empty` — ordered
by actionability, with default copy in `describeSubmitBlocker`. "Why can't I
send this" is one of the questions AI interfaces answer worst; a greyed-out
button teaches nothing.

Two of these encode deliberate calls:

- **A failed attachment blocks sending, and offers a way back.** Submitting
  around it would silently send less than the person thinks they sent. The
  chip carries *try again* and *remove* — because the person still has the
  file, "remove it" was never the only honest answer.
- **Degraded does not block; down does.** They are different problems and get
  different treatment throughout the library.

On submit, ready attachments go with the turn (the event log records exactly
which); anything still uploading or failed stays behind, visible.

## Multiplayer, said plainly

A Lucet thread is **shared and single-writer**. When anyone submits, the
composer locks for everyone until the response settles; prompts written in
the meantime queue and send when the turn frees. Most AI tools cannot say
that sentence — they have no concept of another person in the thread — so
the component goes out of its way to make the context unmistakable: a lock
held by another participant shows **their avatar** and copy that names the
shared thread, while your own running turn shows the working orb. The full
Presence & Turn Lock pattern (who is here, cursors-in-thread) builds on this
contract later; the lock ships in the baseline because retrofitting
single-writer semantics is the kind of surgery that never lands cleanly.

## Icons for conventions, words for novelties

Send renders as the arrow: every AI composer has taught that glyph, so the
words add nothing. Queue, Queued, and Stop keep their words, because they
carry semantics most tools do not have, and a differentiator explains itself
on first contact.

## Three tiers inside one composer

The send arrow is **solid** — the thing you came to press. The attachment
chips are **white and raised** — content you made, objects in the composer,
and in light mode white means exactly that. Attach and the model picker are
**ghosts with hairlines** — ambient controls that inhabit the recess rather
than sit on it: the whole composer is one inset object, and raised things do
not get stacked inside a well you type into. The hairline keeps them
pressable-looking (the same decision that gave ghost buttons theirs); hover
gives them the veil. The quiet bar is load-bearing — it is what lets the
chips read as content and the arrow land as the action.

## The bar stays small, and here is the overflow plan

The toolbar holds the send button plus, at most, attach, the model picker,
and — when it lands — the scope control. That is the ceiling. Anything
beyond collapses into an overflow menu (`⋯`) built on the menu recipe, and
the `tools` slot is where a host adds controls today, accepting that they
compete for the same ceiling. The auto-collapse ships with the scope
control, because that is the moment the bar first genuinely runs out of
room; building the machinery before the crowd exists would be speculation.

Attachment chips follow two rules worth naming: icons are by **category**
(document, table, image, video, audio, archive, code — silhouettes that
survive 13px, never vendor branding), and truncation always **preserves the
extension**, because the extension is what actually tells you the format.

## What is deliberately not here yet

- **English copy is hardcoded** — the submit-blocker strings (core's describeSubmitBlocker; the strip reads it directly, with no per-string override prop yet). A labels escape hatch is
  deferred until a real host shows which strings it must own;
  freezing a copy API speculatively would freeze the wrong one.
- Attachment parts on the submitted *message* — that representation belongs
  to the Message component and will be added with it.
- Token estimation for the draft — the context meter reads real usage; a
  projection belongs to the Budget Meter extension.
- Voice input — its own baseline component.

## Overlap, named

Vercel's AI Elements ships a `PromptInput` with attachments and a model
select. The overlap is real and worth naming. The difference is the layer
underneath: Lucet's composer is a framework-free state contract — the lock,
the queue, attachment failure states, and submit blockers with reasons are
all in `lucet` core, testable without a DOM, and every transition is an
event in a log. The component is a rendering of that contract, not the
place where the behaviour lives.

## Floating surface — stacking decision (2026-09-01)

In-tree by design. The panel anchors inside the composer's own
stacking context and always wins within the component; nothing the
library renders can occlude it. What CAN occlude it is a host whose
own chrome floats above the composer at a higher layer — that is the
host's z-ladder to manage, and the honest fix on the host side is
the top layer, not a bigger number. The docs site's chrome popovers
use the native Popover API for exactly this reason. An opt-in
top-layer mode for this surface (Popover API, keeping the current
anchoring as fallback) is filed for 0.2. The states audit probes
this surface open, in all four theme-and-expression cells, and fails
on any occlusion.

## Send at the month's threshold (2026-09-02)

Send has one more state it can refuse from, and it refuses by opening
the decision rather than by going grey: when the projected turn would
cost more than the month has left, the first press opens the Budget
Meter's panel with the reason and the two ways across, and nothing sends
until one is chosen. See the Budget Meter's rationale for the hold.

## Composer audit, round 01 (2026-09-03)

Every state was captured in the four cells at desktop and phone widths and
measured. Geometry held everywhere: the swap from Send to Queue to Stop
moves nothing but the action group's own width. Two defects were fixed.
Pressing Queue with a pointer dropped focus to the page, because the button
leaves with the words; focus now returns to the field. The placeholder,
mixed against the Paper composer's surface token, fell to 2.6:1 on the Glass
composer; it now mixes toward transparent and reads at 4.5:1 or better in
every cell. Low-severity observations were filed for a later sweep.

## Component audit 07 (2026-09-03): attachments

The composer's files reviewed as one system with the thread's provenance
and the bibliography, in four cells at 1440 and 320. The contract was
proved before anything moved: uploads are scripted and indeterminate (a
ring and a word, never an invented percentage); a file becomes immutable
when its turn is submitted; the thread shows what went, read-only. Two
contradictions were found and closed.

- **A queued message owns its files.** Queue used to take the words and
  leave the files in the staging row, where they could be removed, or
  still be uploading when the handoff came — and a file not ready at that
  moment dropped silently. Now Queue moves the staged files into the
  queued item, read-only, beside the words. Edit brings both back; Cancel
  queue drops both; the handoff sends exactly those files, one copy each,
  and a file staged since stays behind for the next message. Queue is
  held while a file is uploading or failed, and the seat and the strip
  say why — *Queue sends once your upload finishes*, *recording.mp4
  didn’t upload; try again or remove it to queue*.
- **The strip names the file.** *Uploading site-photograph.jpg…*,
  *Uploading 3 attachments…*, *walkthrough-recording.mp4 didn’t upload —
  try again or remove it*: exactly which file blocks the send and what to
  do, not "an attachment".
- **Focus is placed before a chip goes.** Remove lands on the next file's
  action, else the previous file's, else Attach; Retry lands on the chip's
  Remove, which every state keeps. Each act is spoken once — *Removed
  quarterly-summary.pdf.*, *Trying walkthrough-recording.mp4 again.* The
  draft and its selection are untouched throughout.
- **Every chip wears its word.** An uploading chip says *Uploading…* beside
  its ring, so a still ring under reduced motion still reads. The full
  name and the size live in the library's own tip, tabular, not the
  browser's title tooltip. Sizes in the demo host are the files' sizes.
- **A failed chip says why on its own line.** The reason is a sentence —
  *Too large — the limit is 25 MB* — and on one line it left the name no
  room. Name and actions keep the first line; the reason sits under the
  name, indented past the glyph, wrapping if it must. Only the failed chip
  grows; the row grows with it rather than the text shrinking.
- **One face per file, everywhere.** The staged chip, the queued item's
  chip and the thread's provenance chip draw the same kind glyph from one
  shared module; the thread no longer shows a document icon for a
  photograph.
- **Attach says what it does** in a tip as well as its name, and offers a
  40px target, 44px under a coarse pointer, inside the same 28px control.
  The tip shows for hover and keyboard focus, not for the focus a pointer
  click leaves behind — a tip hanging over the field after every attach
  was noise.
- **A long name widens nothing.** At a phone width a 260px chip's minimum
  content made the composer wider than its host column, and the host's
  frame clipped Send. The composer now contains its inline size — its
  width is the host's decision alone — chips carry no minimum, and the
  thread's provenance chip splits base and extension the way the composer
  does, inside a bubble that may shrink to its 88% cap. Filed as HIGH,
  fixed: a long filename at 320 keeps Send, Remove and the extension in
  view in both places.

Chosen, and why: type-aware compact rows (the brief's Option A) minus
thumbnails — the contract carries no bytes or preview URL, and a demo host
that drew a preview for a file that does not exist would be fabricating
one; icons by kind carry recognition honestly (Option C recorded as the
limitation). Local failure on the affected file, never a composer-wide
tint (Option A): the strip instructs, the chip wears the reason, the rest
of the draft stays usable. The demo host's files are believable files —
a quarterly summary, a site photograph, a recording too large to send —
and the third one fails on purpose so the failure path stays one click
away.

Deferred: a `previewUrl` on the attachment contract for hosts that can
render safe local image previews; picker cancellation cannot be exercised
in a host that fakes file IO, so "no focus stolen after a cancelled
selection" is recorded as not verifiable here.
