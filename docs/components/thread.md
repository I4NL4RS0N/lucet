# Thread

Turns, rendered from the contract: every prompt paired with what came back,
including the ways it came back wrong.

## The positions

- **The response is a document, not a bubble.** The assistant's output is the
  artefact the interface exists to produce, so it reads at full measure with
  no container. The *prompt* keeps a raised surface — it is an utterance,
  something you said, and you need to find it again while scrolling. In light
  mode this is the figure-ground law working: the prompt is white and
  forward, the document sits directly on the page.
- **Authors are people, plainly.** A Lucet thread is shared, so turns carry
  an avatar and a name instead of aligning by self — alignment stops meaning
  anything with three people in the room. Your own turns just say *You*. The
  assistant's avatar is **solid**, so it wears the accent when one is chosen:
  the same call the working orbs made, and under monochrome it stays neutral
  by construction.
- **A response is never simply "loading" or "done".** Streaming shows a caret
  riding the live edge of the text. The three unhappy endings are designed
  states with words: *Stopped early* (what arrived is kept), *Failed* (what
  went wrong, what it cost), and *Declined* — which deliberately does not
  wear red, because a refusal is a considered answer, not an error.
- **What you sent stays visible.** Attachments travel onto the prompt as
  parts and render as read-only chips — the composer's chips minus the
  verbs, same CSS, second name. The event log records exactly which went;
  the chips are that record made visible.
- **Every prompt is a commit.** Each turn shows its version id as a quiet
  mono marker — the seed the Version Marker + Restore pattern grows from.
  Quiet through type, never through opacity: the old era faded it to ~3.2:1
  with `opacity`, a failure no contrast audit can see. It stays at full
  muted-foreground and lets the mono face and size do the hushing.

## Streamed text is announced

The thread is `role="log"`, so arriving text reaches people who are not
looking at it. A production host may want to throttle announcements to
sentence boundaries rather than raw chunks; that refinement belongs to the
streaming-response component when it lands.

## What is deliberately not here yet

- **Markdown.** Text parts render as plain text; rich rendering is the
  Streaming Response component's whole job, next in the ledger.
- **Reasoning and tool displays.** Both render as quiet single-row asides
  here; each is its own baseline component and will take over.
- **Message actions** (copy, retry, feedback) — the Feedback Controls item.
- **The empty thread.** What an app shows before the first turn is a real
  design question, owned by the Configurator home where it is the first
  thing every visitor sees.
