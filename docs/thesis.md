# The artifact is not outside the conversation

*The argument behind Lucet. The components are the evidence.*

---

## The claim

Existing AI interface libraries model two things: a conversation, and separately,
the thing being made. A message list over here, a canvas or a document or a
codebase over there.

That split is wrong, and almost every gap in current AI product design falls out
of it. If the artifact and its context actually live inside the conversation,
then four surfaces that nobody ships are obviously necessary.

## Four things that follow

### 1. Scope is a control, not a guess

You open an assistant in a drawer. There is already content on the page behind
it. Every product in this category then guesses what you meant by "this," builds
retrieval invisibly, and hopes.

But the application already published its context hierarchy. The breadcrumb is
literally a scope ladder. Home, then section, then page, then the record you are
looking at. The navigation already answered the question.

So scope should default to the current page, be widened deliberately, show what
is actually in it (which items, how many), and visibly react when the page moves
underneath it. That last part matters most in a drawer, where the page keeps
moving while the conversation stays put.

This is a trust feature more than a control. Wrong answers are usually wrong
context, not a wrong model.

### 2. The thread is the version history

Every prompt is a commit. Some tools already understand this: you scroll back up
the conversation and restore any earlier state directly from the message that
produced it.

Most tools do not, so undoing means a branch, a pull request, and a deploy. That
is a developer's answer to a designer's problem. Restore belongs on the message,
not in a separate panel and not in an external system.

The hard parts are honest ones. What happens to the messages after the point you
restored to, branch or discard? And how does someone know they are looking at a
restored state rather than the latest one?

### 3. Multiplayer, because there is only one context anyway

A thread is a document. Documents are collaborative. Yet nearly every AI tool
puts each person in a private thread and offers sharing only as an export.

There is exactly one linear context, so the model is single writer at a time.
When either person submits, the composer locks for both until the response
finishes, then opens again for either.

The design work is not the lock. It is the waiting. Being locked out feels dead
unless you can see whose turn it is and roughly how long, and unless you can
still type the thing you want to send next while you wait.

### 4. Cost and memory should be legible before you spend them

Two different meters that users constantly conflate. Budget is money. Context is
memory.

For budget, the missing piece is the projected cost of the selected model before
you commit to it. Plenty of tools tell you what you spent. None tell you the
price first.

For context, the missing piece is consequences instead of units. "Approaching the
limit, older messages may be dropped" is usable. A percentage is not, and tokens
are a unit almost nobody can reason about. A meter with no exit is just anxiety,
so the warning has to arrive attached to an action: start a new thread, summarize
and continue, or drop attachments.

---

## The second argument: nobody does the unhappy states

Everyone ships a good-looking message bubble and a thinking indicator. The states
a real AI feature actually hits, most days, are the ones nobody designs:

refusal and boundary · low confidence · stale or cached results · an interrupted
stream · a tool that partly failed · cost and latency signaling · correcting a
wrong answer after the fact · approval and consent gates · empty and cold start ·
rate limits and quota · the quiet downgrade to a fallback model

That last one deserves special attention. When a product silently switches you to
a cheaper model during an incident, that is precisely the moment the person using
it most deserves to be told.

---

## What Lucet is

A library of AI interface components with the complete state set, and a written
rationale for each one. The bar is not component count. The bar is whether a
designer or engineer can read why something works the way it does and disagree
with it specifically.

Alongside it, a docs site that is not a component gallery. One persistent,
realistic interface with a rail of state triggers beside it, driven by a scripted
deterministic runtime. Click "tool failure" and it happens inside the running
conversation, mid task, in context. States chain, so you can trigger a failure
and then a recovery and watch the transition. Nothing resets and nothing
navigates, because states viewed in isolation teach you nothing about behavior.

## Principles

- **Headless core, zero framework imports.** All state logic lives in one
  framework-free package. React is a thin wrapper. Other wrappers are small.
- **No styling dependencies.** Plain CSS custom properties — no Tailwind, no
  CSS-in-JS, no build step — so styling never assumes a stack, and a host that
  defines nothing gets Lucet's own palette. Token names also map onto shadcn's
  CSS variable names, so a project already using it inherits its theme without
  a fight.
- **Rationale is part of the deliverable.** A component without a documented
  reason is a shape, not a decision.
- **Accessibility is load bearing.** Screen readers plus streaming text is an
  unsolved problem. Owning it properly is worth more than ten more components.

## Status

Early. The argument is further along than the code. Nothing is published yet.

MIT licensed.
