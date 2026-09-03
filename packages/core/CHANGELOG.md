# lucet-core

## 0.3.1

### Patch Changes

- 659599b: Prompt composer, audit round 01: focus returns to the field after a pointer press on Queue (the button leaves with the words, and focus used to fall to the page), and the placeholder reads at 4.5:1 or better in every theme and expression instead of 2.6:1 on the dark Glass composer.
- aefcf18: Tool receipts, audit round 02: payloads are pretty-printed and wrap at their structure instead of scrolling sideways on narrow screens, with the scrollbar kept only for a single unbreakable token; a running receipt can arrive knowing its elapsed time (`ToolPart.elapsedMs`) and shows it fixed, which the lab uses so a state specimen no longer ages.

## 0.3.0

### Minor Changes

- 488c20a: Every ending gets its own exit. A settled response carries the one verb its state promised and the runtime performs it: a refusal lists the proposed deletions and deletes nothing; low confidence checks its sources without re-asking; a partial tool failure retries only the missing source; an interrupted response continues from where it stopped; a rate limit shows its exact reset time and arms a retry for that moment while the draft stays; an outage retries the connection, with the composer strip and the ending in two levels and no shared wording; a stale result refreshes; an updated source is re-checked and its flag clears; a removed source is replaced in place and never reads as openable; a spent month shows its reset date, hides the inert price and offers the one exit that will not fail again. Three new events carry it (a resumed response, a scheduled retry, a replaced source), the scenario DSL's `recovery` becomes a verb, a mode and steps, and `recover()` joins the API. Retries keep the composer's draft.
- 488c20a: The threshold has a hold, and the receipts stage. The first Send that would cost more than the month has left no longer sends: the runtime holds it (`composer.intercept`, with the `budget/intercepted` and `budget/released` events) and the meter's anchored panel opens on the reason and two explicit ways on — the cheaper model that still fits, or continuing on the chosen one, which sends. `confirmSpend()` and `dismissIntercept()` join the API, a model change releases the hold, and a queued prompt that would cross the month is handed back to the field under the hold instead of sending behind your back. Tool receipts can run as a staged group (the `tools` step and the `tool/started` event): every receipt enters pending, each runs and settles in order, the answer begins after the last, and the receipt's mark changes state in a fixed slot with a static label for every state. The Do path uses it.
- 488c20a: Language, the scope-freeze rule, metadata, severity. Rail entries read "Use the current page as context" and "Scope updates after navigation"; the settled reasoning row reads "Why this answer"; an uncertain answer carries one quiet word before it, "Unverified", in the neutral tone and never a percentage. Navigation with a draft in the field no longer swaps the scope under the words: the move is held (`scope.pending`) and the control asks — Use new page or Keep previous page, through `scope/updateAccepted` and `scope/updateDeclined` — while an empty field still follows and says so. Version metadata reads "Version 2 of 2 · retried". The severity table is applied: a rate limit ends in caution (the ending's `tone`, set by the `fail` step), the stale notice is caution, and the fallback notice's surface is one step quieter within the info tone.

## 0.2.0

### Minor Changes

- Every trigger does what it says. The runtime gains a `notice` part (an inline notice inside a response, with an optional named action), `model` and `draft` steps, pre-send scenarios that set the world up and answer the person's own send on the model they chose, instant once-per-thread scenarios, computed turn cost at the selected model's rate, and `inspect()` behind Reset. Scenarios: the Do path runs three receipts and lists the pages it created; the fallback model is told inline with Retry on Auto; another person's turn runs live and queued input sends itself; the budget caution decides before the spend; restore lands straight in its preview. The thread renders notice parts, the sources block takes a label, and the meter states the cause and the two exits.

## 0.1.3

### Patch Changes

- A control labelled Restore must restore. The older version's action is now **Preview version**, with a tip that says nothing changes until you restore; the preview banner pairs a ghost **Return to latest** with a primary **Restore version** that commits in one click. The pair wears the library's own button grammar, so the hierarchy is a fill against none rather than hue; labels never wrap, and at drawer width the pair takes its own row. The announce layer says "Previewing an earlier version" for the first stage. The attachment chip's 28×28 hit regions are settled by hit test in the states audit.

## 0.1.2

## 0.1.1

## 0.1.0

### Minor Changes

- First real release. The core: an event-sourced store with a pure
  reducer, the scripted mock runtime, streaming, aborts, the tool
  lifecycle, versioning and restore-as-copy, scope, usage and budget
  projection, and the announcement plan for screen readers. The React
  package: the twelve baseline components with every state reachable,
  the token set with light/dark themes and the Paper/Glass material
  axis at identical geometry.
