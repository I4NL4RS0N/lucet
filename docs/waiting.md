# Waiting

Five named ways to wait. Waiting is not one state, so it is not one
loader: a spinner says "briefly busy", and held for thirty seconds it
says "broken". An agent interface spends most of its time in exactly that
long, unknown window, which is the one case a single spinner cannot
cover. Each of the five means something different, and the difference is
the point.

Two rules hold across all of them. Motion is never the only channel:
every wait ships with its words, and under reduced motion each one
collapses to a static cue rather than to nothing. And a readout tracks,
it does not animate: a number that changes is set in tabular digits so
its width holds still, and it stops at the truth, never at a fake.

## Long and unknown

A slow breath, on purpose. Fast motion reads as urgency, and there is
nothing urgent about waiting. Use it when the end is unknown and may be
long — the model thinking, a service that has not answered yet — and pair
it with a word that says what is happening. In the library this is the
activity orb's working states and the composer's strip while a response
is being written.

## Staggered

Three dots, out of phase. The stagger is what stops it reading as one
blinking blob; it reads as progress. Use it for a short wait that sits
inside a line of text or a compact control, where a sentence-sized
indicator would be too much. It promises little, so it should not be
asked to hold a long wait.

## Named activity, with elapsed time

The label is the important half. "Searching documents" tells you what is
happening, where a bare spinner does not, and the timer is what makes a
long wait legible instead of worrying. The time is a readout: it tracks
the real clock and stops when the work settles, replaced by the outcome's
own words. In the library this is the tool receipt while it runs —
"Running", the mark, the seconds — and the orb with a time beside it.

## Text still arriving

The caret. Streaming text needs no other motion; the caret's crawl is its
own continuity. Markdown renders while it arrives, not after, so an
unclosed construct at the very end renders as in progress rather than as
raw syntax. Use it whenever the thing arriving is words, and only then: a
caret on anything that is not text is a costume.

## Staged work, known sequence

When the steps are known, show all of them from the start. Every step
enters pending, then runs and settles in order — pending, running,
complete — so a frame frozen at any moment shows what is done, what is
under way and what remains, and no step ever enters already complete. Use
it for work whose shape is known before it begins: the Do path's three
receipts, a plan being carried out. In the library this is the staged
tool group.

## Which one

Pick by what you know. Known end: a meter. Known shape: a skeleton. Known
sequence: the steps. Words arriving: the caret. Nothing known but that
the machine is busy: a named activity with its elapsed time, and the slow
breath while it is short. When the machine is not working at all —
blocked on you, queued behind others, degraded to a fallback, down — the
wait is still named, but nothing rotates. A spinning mark beside "waiting
for your answer" says the machine is busy when the person is the
bottleneck. The activity orb's second half exists for exactly these
states, and its label always carries the meaning; the colour is
enhancement, never the channel.

The reasoning above is collected from the primitives page's loader
section and the components that grew out of it — the activity orb, the
tool receipt, the streaming response — not invented here. The loaders
themselves are unchanged.
