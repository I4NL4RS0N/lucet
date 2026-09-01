# Streaming Response

Markdown, rendered while it arrives — not after. The response is a document,
and markdown is the dress documents arrive in; the whole problem is that
markdown was specified for *finished* text, and a streaming interface renders
every prefix of the document on its way to being finished. Render those
prefixes naively and the seams show on every single turn: bold flashes as
asterisks until its closer arrives, a half-open code fence dumps raw
backticks, a link leaks its URL character by character.

The component is split the way everything here is split: the judgment lives
in the core (`markdown.ts`, `announce.ts` — pure functions, zero
dependencies, fully unit-tested), and React renders the resulting block
model node by node. There is no `innerHTML` anywhere; streamed text is
untrusted by definition.

## The live-edge law

One law covers every construct:

> **At the live edge, markers are promises. At settle, they are characters.**

While text is still arriving, an unclosed construct at the very end of the
text renders as the thing it is about to be, syntax hidden:

- `**bold arriv` renders as bold-in-progress. No asterisks are ever visible.
- An open code fence is already a code block — the fence line declared its
  intent, so the surface appears at once and code streams into it.
- `[label](https://exampl` renders the label styled as a link but **not
  clickable** — you cannot click a destination that has not finished
  existing. Same for a bare URL still arriving: a truncated URL is a wrong
  destination, which is worse than a short wait.
- A bare marker with no content yet (`##`, `-`, `1.`, `**` alone at the
  end) renders as **nothing** — a promise with nothing to show beats a
  flash of raw syntax.
- A table header line becomes a table the moment its delimiter row *starts*
  (`| -` is enough), so the header never sits as pipe soup while the dashes
  stream in. Until then it is a paragraph: text you can see beats text held
  back.

Once the message settles, the grace is withdrawn: a document that truly ends
with a stray `**` contains a stray `**`, and pretending otherwise would
misquote it. One deliberate exception — a fence that never closed still
renders as code at settle, because an interrupted stream keeps what arrived,
and what arrived was code. (The Konfabulator's *Stopped inside a code block*
fixture is exactly this.)

The parser re-parses the full accumulated text on every chunk. The laws
above are what make that stable to watch: constructs upgrade in place and
never visibly decay.

## What the screen reader hears

Streaming plus screen readers is a famously unsolved mess, and mirroring is
the cause: a live region over the raw chunks announces word fragments; one
over the markdown announces its syntax ("asterisk asterisk"). So the visible
document is deliberately **not** a live region. A visually-hidden `role="log"`
inside the thread receives announcement *units* instead:

- finished **sentences** of prose — never fragments;
- structure **described rather than spelled**: a closed code block announces
  as "Code, ts, 8 lines" (the visible block is there to read at leisure); a
  table announces its header, then each row as the row completes;
- headings announce whole, once their line ends, as "Heading: …".

**Narration follows initiation.** The log narrates answers the person
is waiting on. A stream the host scripted on its own — the
Konfabulator's opening playback, any onboarding replay — is content
arriving, not an answer arriving, and narrating it unprompted is the
aural sibling of autoplay video. The escape hatch is also weaker than
it looks: interrupt-on-any-key cannot be counted on in screen-reader
browse mode, where virtual-cursor keys never reach the page. So
`Thread` takes `narration="history"` for host-scripted streams: the
log still fills — every unit present, readable at leisure — but
carries no live role until the host flips it back, and a live region
speaks only mutations, never its backlog, so going live announces
nothing retroactively. Every user-initiated stream after that point
narrates normally. (Reduced-motion users skip the playback entirely
and are live from the first frame, as is all automation.)

The unit plan is a pure core function with one tested invariant: **the plan
for a prefix is a prefix of the plan.** Units never change and never reorder
once emitted, so the renderer is a counter and a slice — no timers, no
diffing, no debounce heuristics. The invariant is enforced by replaying a
document that exercises every construct chunk-by-chunk at several chunk
sizes.

Two boundary behaviours worth naming: a response that was already settled
when first rendered announces nothing (history is not news — mounting an old
thread must not read a page of answers at you), and a stream joined midway
announces from the top (you just arrived; the recent context is the point).

## The rest of the positions

- **Headings demote.** A response lives inside a page that already has an
  outline, so the response's `#` must not outrank the host's own headings.
  `headingBase` (default 3) is where a response-level-1 heading lands. The
  *visual* scale follows the markdown level — the author's intent — not the
  demoted tag.
- **Links earn the click.** Every destination passes an allowlist (`http`,
  `https`, `mailto`, relative); anything else — `javascript:` above all —
  renders as plain words, never as a dead control. Links are always
  underlined, because in the monochrome accent colour alone is no signal at
  all (1.4.1). Absolute links open in a new tab with `rel="noopener"` and
  wear a small leaving-glyph; walking a running thread away to follow a
  reference is rarely what anyone meant.
- **Copy waits for the fence to close.** Offering to copy half a snippet
  hands someone broken code. While the block streams, the bar says
  *writing…*; the button appears at close — or at settle, even if the fence
  never closed, because what arrived is kept and belongs to you. The copy
  result is reported honestly: *Copied*, or *Didn't copy* when the clipboard
  refuses — never a success it cannot vouch for.
- **No syntax colouring, deliberately.** A highlighter is a rendering
  opinion a host can layer on; the library's job is the chrome — surface,
  language label, honest copy, keyboard-reachable overflow — done properly.
  One quiet block also holds up across every theme and accent without a
  parallel colour system to audit.
- **Prompts stay verbatim.** Markdown rendering applies to the assistant's
  document only. What you typed renders as what you typed — dressing up a
  quotation would misquote you.
- **Wide things scroll themselves.** Tables and code overflow inside their
  own containers, keyboard-reachable (`tabIndex`, labelled), and the
  document never scrolls sideways because one table is wide.
- **The caret rides the deepest live edge** — inside the last list item,
  inside the open fence, inside the newest table cell — so the eye keeps
  tracking one thing.

## The subset

Deliberately the markdown assistants actually emit: paragraphs, headings,
ordered/unordered lists with nesting, fenced code, blockquotes, GFM tables,
thematic breaks; strong, emphasis, inline code, links, autolinks, escapes.
Underscore emphasis only at word boundaries (`snake_case` is words). Images
render as links to the image — a thread is not the place to hot-load remote
resources; the reader chooses. Not parsed: setext headings, footnotes,
strikethrough, raw HTML (never parsed, never rendered — text stays text).

## What is deliberately not here yet

- **Syntax highlighting** — see above; revisit only with a token-driven,
  audit-able scheme.
- **Message actions** (copy the whole response, retry) — Feedback Controls.
- **Reasoning and tool renderings** are quiet asides in the thread today;
  each is next in the ledger and takes over its own display.
