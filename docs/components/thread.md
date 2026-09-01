# Thread

Turns, rendered from the contract: every prompt paired with what came back,
including the ways it came back wrong.

## The three registers

Three registers. The document (the assistant's answer) has no
container — the thread is its surface. The utterance (a person's
prompt) is a surface — separated by tint, findable while scrolling,
never elevated. The object (the tool receipt) is the one thing above
the plane — raised, operable, and alone at that height, which is what
makes its elevation mean something.

If every message rose, nothing would float. Elevation is spent on
exactly one register so the reader can trust what height means.

Material never encodes identity: another person's bubble is the same
utterance surface as yours — position, avatar, and the tail corner
carry whose it is. The utterance tint derives from the plane itself
(five percent of ink mixed into the card), so it steps truly in all
four theme-and-expression cells; it once borrowed the secondary
CONTROL token, whose pure-white light value assumes a ring and cast
the bubble doesn't wear, and the light-cell utterance was invisible.

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
  states, each triple-coded — silhouette, colour, word — with the colour
  mapped to a universal meaning: *Failed* wears danger red (it broke),
  *Stopped early* wears caution amber (cut short, nothing broken), and
  *Declined* wears info blue — still deliberately not red, because a
  refusal is a considered answer, but no longer neutral either: an earlier
  round left it uncoloured on principle, and in practice it read as
  unstyled rather than calm. A boundary is information, and dresses as it.
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

## Nothing is deliberately missing any more

Every part of a turn now renders through its own component with its own
rationale: [streaming-response.md](streaming-response.md),
[reasoning.md](reasoning.md), [tool-call.md](tool-call.md),
[feedback-controls.md](feedback-controls.md), and the cold start via
[suggestion-chips.md](suggestion-chips.md). The thread decides where things
sit and when they are live; the components decide everything else.

(The asides are all real now: [reasoning.md](reasoning.md) and
[tool-call.md](tool-call.md) own their rows; the thread only decides where
they sit and when they are live.)
- **Message actions** (copy, retry, feedback) — the Feedback Controls item.
- **The empty thread.** What an app shows before the first turn is a real
  design question, owned by the Konfabulator home where it is the first
  thing every visitor sees.
