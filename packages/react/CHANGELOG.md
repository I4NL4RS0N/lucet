# lucet-react

## 0.4.0

### Minor Changes

- 6e99f9b: Attachments, sources and file treatments, component audit 07. A queued message now owns its files: Queue moves the staged attachments into the queued item, Edit returns them, Cancel queue drops them, and the handoff sends exactly those files while a file staged since stays behind; Queue is held while a file is uploading or failed and says why. The strip names the file that blocks a send; every chip wears its state word and the library's own name-and-size tip; focus is placed before a removed chip goes, and after a retry; the thread's provenance chips share the composer's kind glyphs. Inline citation markers link to their source rows with focus in and Escape back; an open source receipt closes on Escape; source rows meet the 40px target. A long filename never widens the composer or the sent bubble past its host: the composer contains its inline size, chips carry no minimum width, and provenance chips truncate their base while keeping the extension. The budget panel anchors to its own trigger. The composer frees the moment a response settles and the queued handoff takes the lock in the same tick, removing two one-frame status transients. The demo collaborator is Jennifer Lee.
- c47fe66: The spent-month wall has no exit. `PromptInput` no longer takes `onNewThread`, and the spent strip offers no action: a monthly cap outlives the thread, so a "New thread" verb promised a way out the ledger does not have. The strip reads "This month’s budget is spent. New turns are paused until it resets on Sep 5 at 01:41." While the month is spent the Budget Meter's model rows are readable but inert (`aria-disabled`). Core: `thread/reset` now preserves `monthlyResetAt` with the budget and the spend, so the wall in a new thread still says when it lifts; the budget blocker's copy is two sentences.
- da9e623: Multiplayer ownership, component audit 06. While another person's turn runs the composer offers Queue, disabled until there are words and named for what it does, never Stop; the strip says who asked and what you can do ("Responding to Ada — you can queue a message", "Queued after Ada — yours sends next", "Responding to you"); the queued item shows its words with Edit and Cancel queue (`PromptInput` gains `onDequeue`); the handoff is spoken once; your own prompt carries a hidden "You" in a shared thread. Core: a stop during another person's run is a terminal state and the queue sends; a stop of your own run still returns the words to the field.

  Edit and Cancel queue keep their compact silhouette and offer 40px targets (44px under a coarse pointer); a press on a disabled seat or the group's dead space keeps focus in the field; the status strip announces an accepted queue once, from its own live region.

- 75f022a: Scope Control, component audit 04. Rungs may carry a `name` (the referent behind a deictic label) and a `scope/moved` event may carry the destination's `pageName`; the draft-protection decision names both pages — "Keep Reports review" (primary) and "Use Vendor call" — with the message on its own row and the two ways together. The trigger names the held scope while a move is pending, leaves the Tab order and says `aria-disabled` while a turn runs, and the picker's counts form a right-aligned column. The reducer holds a move only when the selected boundary actually changes, says "Scope remains on …" when the previous page is kept, and applies a held move once a fresh send empties the field. The composer returns focus and caret to the field after either decision. One derived model, `scopeDisplay`, produces the chip, its accessible name and the picker rows: while the scope stays on another page's ladder (`ScopeState.onScreen`), "This page" is offered first for the page on screen, the kept page is named and marked as previously selected, and choosing the page on screen (`scope/rebound`, `onScopeRebind`) brings its ladder into force in one step.
- ef1fbff: Version marker and restore, component audit 05. The newest version alone wears Current and its version line is legible at rest, carrying "restored from version n"; entering a preview focuses the banner, restoring focuses the new current version's row, returning focuses the previewed turn; a live region speaks each act once; the banner names the version and its commit reads "Restore this version"; `MessageActions` gains `busy`, disabling Ask again, Preview version and recovery verbs while a new version is being written.

### Patch Changes

- fe0dbe7: Component audit 07 closeout. Upload completion is announced once — "quarterly-summary.pdf is ready.", or "2 attachments are ready." for files that complete together — never at mount, never on a re-render, and the sentence leaves the live region when the staging row empties. Under a coarse pointer the chip's Remove and Retry present 44px hit zones that nothing clips and no other zone overlaps; the desktop keeps its 28px dense targets. The suggestion chips' column minimum yields to a host narrower than 230px, so a content-sized column never grows past its frame at a phone width.
- 13a63a4: Budget Meter, component audit 03. Prices in the picker align in one column (every row reserves the check slot); the trigger's estimate keeps a stable slot so a draft crossing the cent no longer moves the chip; the month bar's track is visible against the panel and the record fill is ink; the hold's two buttons carry their price in the button's own colour and size; the locked trigger leaves the Tab order, cancels its toggle and exposes `aria-disabled`; the hold's note says what each way does. Core: a runtime test records the rule that a running turn is never stopped for cost.
- Updated dependencies [fe0dbe7]
- Updated dependencies [6e99f9b]
- Updated dependencies [13a63a4]
- Updated dependencies [c47fe66]
- Updated dependencies [da9e623]
- Updated dependencies [75f022a]
- Updated dependencies [ef1fbff]
  - lucet-core@0.4.0

## 0.3.1

### Patch Changes

- 659599b: Prompt composer, audit round 01: focus returns to the field after a pointer press on Queue (the button leaves with the words, and focus used to fall to the page), and the placeholder reads at 4.5:1 or better in every theme and expression instead of 2.6:1 on the dark Glass composer.
- aefcf18: Tool receipts, audit round 02: payloads are pretty-printed and wrap at their structure instead of scrolling sideways on narrow screens, with the scrollbar kept only for a single unbreakable token; a running receipt can arrive knowing its elapsed time (`ToolPart.elapsedMs`) and shows it fixed, which the lab uses so a state specimen no longer ages.
- Updated dependencies [659599b]
- Updated dependencies [aefcf18]
  - lucet-core@0.3.1

## 0.3.0

### Minor Changes

- 488c20a: Every ending gets its own exit. A settled response carries the one verb its state promised and the runtime performs it: a refusal lists the proposed deletions and deletes nothing; low confidence checks its sources without re-asking; a partial tool failure retries only the missing source; an interrupted response continues from where it stopped; a rate limit shows its exact reset time and arms a retry for that moment while the draft stays; an outage retries the connection, with the composer strip and the ending in two levels and no shared wording; a stale result refreshes; an updated source is re-checked and its flag clears; a removed source is replaced in place and never reads as openable; a spent month shows its reset date, hides the inert price and offers the one exit that will not fail again. Three new events carry it (a resumed response, a scheduled retry, a replaced source), the scenario DSL's `recovery` becomes a verb, a mode and steps, and `recover()` joins the API. Retries keep the composer's draft.
- 488c20a: The threshold has a hold, and the receipts stage. The first Send that would cost more than the month has left no longer sends: the runtime holds it (`composer.intercept`, with the `budget/intercepted` and `budget/released` events) and the meter's anchored panel opens on the reason and two explicit ways on — the cheaper model that still fits, or continuing on the chosen one, which sends. `confirmSpend()` and `dismissIntercept()` join the API, a model change releases the hold, and a queued prompt that would cross the month is handed back to the field under the hold instead of sending behind your back. Tool receipts can run as a staged group (the `tools` step and the `tool/started` event): every receipt enters pending, each runs and settles in order, the answer begins after the last, and the receipt's mark changes state in a fixed slot with a static label for every state. The Do path uses it.
- 488c20a: Language, the scope-freeze rule, metadata, severity. Rail entries read "Use the current page as context" and "Scope updates after navigation"; the settled reasoning row reads "Why this answer"; an uncertain answer carries one quiet word before it, "Unverified", in the neutral tone and never a percentage. Navigation with a draft in the field no longer swaps the scope under the words: the move is held (`scope.pending`) and the control asks — Use new page or Keep previous page, through `scope/updateAccepted` and `scope/updateDeclined` — while an empty field still follows and says so. Version metadata reads "Version 2 of 2 · retried". The severity table is applied: a rate limit ends in caution (the ending's `tone`, set by the `fail` step), the stale notice is caution, and the fallback notice's surface is one step quieter within the info tone.

### Patch Changes

- Updated dependencies [488c20a]
- Updated dependencies [488c20a]
- Updated dependencies [488c20a]
  - lucet-core@0.3.0

## 0.2.0

### Minor Changes

- Every trigger does what it says. The runtime gains a `notice` part (an inline notice inside a response, with an optional named action), `model` and `draft` steps, pre-send scenarios that set the world up and answer the person's own send on the model they chose, instant once-per-thread scenarios, computed turn cost at the selected model's rate, and `inspect()` behind Reset. Scenarios: the Do path runs three receipts and lists the pages it created; the fallback model is told inline with Retry on Auto; another person's turn runs live and queued input sends itself; the budget caution decides before the spend; restore lands straight in its preview. The thread renders notice parts, the sources block takes a label, and the meter states the cause and the two exits.

### Patch Changes

- Updated dependencies
  - lucet-core@0.2.0

## 0.1.3

### Patch Changes

- A control labelled Restore must restore. The older version's action is now **Preview version**, with a tip that says nothing changes until you restore; the preview banner pairs a ghost **Return to latest** with a primary **Restore version** that commits in one click. The pair wears the library's own button grammar, so the hierarchy is a fill against none rather than hue; labels never wrap, and at drawer width the pair takes its own row. The announce layer says "Previewing an earlier version" for the first stage. The attachment chip's 28×28 hit regions are settled by hit test in the states audit.
- Updated dependencies
  - lucet-core@0.1.3

## 0.1.2

### Patch Changes

- Raise the attachment chip's Retry and Remove hit regions to 28×28 with the two regions 4px apart, widen their focus ring offset to 2px, and dim the set-aside turn to 0.48 opacity — the smallest value at which its body text keeps 4.5:1 against the dark planes.
  - lucet-core@0.1.2
- Remove two orphaned lines left behind when the orb's breathe animation was taken out — the tail of a deleted `@keyframes` block that the CSS minifier warned about.
- Let narrow columns win over fixed minimums: the sources block caps its grid tracks at the column and lets the freshness note wrap once it has its own line, the code block's 16rem floor yields to a narrower column, attachment chips cap at their row, and the scope panel yields to the viewport. A phone-width thread no longer scrolls sideways.

## 0.1.1

### Patch Changes

- Five fixes from the first component audit. In a shared thread your own turns stay on the right with no avatar; only other people gain a face and a name, as the thread's own caption says. A code-only answer gets a width floor of 16rem, so a block measures the same while it streams and after it settles. The failed-attachment chip keeps Retry and Remove a spacing token apart with independent hit targets, draws the two glyphs to one optical size, and sets the reason as quiet metadata. Every dynamic figure — projected prices, token counts, elapsed time, source locations and freshness, scope counts — sets in tabular numerals through the one shared rule. The restore banner's commit action no longer asks for a 550 weight no loaded face ships.
  - lucet-core@0.1.1

## 0.1.0

### Minor Changes

- First real release. The core: an event-sourced store with a pure
  reducer, the scripted mock runtime, streaming, aborts, the tool
  lifecycle, versioning and restore-as-copy, scope, usage and budget
  projection, and the announcement plan for screen readers. The React
  package: the twelve baseline components with every state reachable,
  the token set with light/dark themes and the Paper/Glass material
  axis at identical geometry.

### Patch Changes

- Updated dependencies
  - lucet-core@0.1.0
