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
- **People have faces; the machine has output.** The group-chat grammar:
  your own turns sit right with no avatar (you know who you are), other
  people's turns sit left with a prominent avatar and their name —
  multiplayer is the differentiator, so the humans get the faces. The
  assistant gets no avatar and no header at all: the document is its
  presence, the no-bubble position taken to its conclusion.
- **A response is never simply "loading" or "done".** Streaming shows a caret
  riding the live edge of the text. The three unhappy endings are designed
  states with words: *Stopped early* (what arrived is kept), *Failed* (what
  went wrong, what it cost), and *Declined* — which deliberately does not
  wear red, because a refusal is a considered answer, not an error.
- **What you sent stays visible.** Attachments travel onto the prompt as
  parts and render as read-only chips — the composer's chips minus the
  verbs, same CSS, second name. The event log records exactly which went;
  the chips are that record made visible.
- **Every prompt is still a commit — but the marker waits for its pattern.**
  A raw `v_6` beside a name read as jargon, so turns separate with a quiet
  hairline instead, and the version id stays in the contract. The marker
  returns with Version Marker + Restore, where a restore affordance gives it
  meaning beyond a label.

## Streamed text is announced — by the announcer, not the document

The visible thread is a named region for *finding*; a visually-hidden
`role="log"` inside it is the live log for *hearing*. They are deliberately
not the same element: a live region over the visible document would announce
every raw chunk and every piece of markdown syntax. The hidden log receives
sentence-level units from the core's announcement plan — the refinement this
section once promised to the streaming-response component, delivered there.
See [streaming-response.md](streaming-response.md).

## Arrival

Things enter the thread; they do not pop into it. Each new arrival — a
prompt, the response, an aside, an ending — makes one quiet rise (220 ms,
a few pixels) and is still. One motion, one duration, applied at the mount:
without it every appearance is instant and the eye cannot follow what
changed. Streaming text needs none of this — the caret's crawl is its own
continuity — and all of it yields to `prefers-reduced-motion`.

## What is deliberately not here yet

- **Message actions** (copy the whole response, retry, feedback) — the
  Feedback Controls item.
- **The empty thread** — owned by the Configurator home, where it is the
  first thing every visitor sees.

(The asides are all real now: [reasoning.md](reasoning.md) and
[tool-call.md](tool-call.md) own their rows; the thread only decides where
they sit and when they are live.)
- **Message actions** (copy, retry, feedback) — the Feedback Controls item.
- **The empty thread.** What an app shows before the first turn is a real
  design question, owned by the Configurator home where it is the first
  thing every visitor sees.
