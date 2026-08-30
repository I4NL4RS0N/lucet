# Prompt input

The composer: where a person writes, attaches, picks a model, and sends. First
component built, because everything else in an AI interface is downstream of a
prompt existing.

## What it is made of

State first. The component renders `ComposerState` + `ModelState` and never
owns state of its own:

- **Text**, with the turn lock and the queue. When anyone submits, the
  composer locks for everyone until the response settles; what you type while
  locked queues, and unlocking promotes it instead of making you retype.
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
