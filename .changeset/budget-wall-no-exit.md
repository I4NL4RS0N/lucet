---
"lucet-core": minor
"lucet-react": minor
---

The spent-month wall has no exit. `PromptInput` no longer takes `onNewThread`, and the spent strip offers no action: a monthly cap outlives the thread, so a "New thread" verb promised a way out the ledger does not have. The strip reads "This month’s budget is spent. New turns are paused until it resets on Sep 5 at 01:41." While the month is spent the Budget Meter's model rows are readable but inert (`aria-disabled`). Core: `thread/reset` now preserves `monthlyResetAt` with the budget and the spend, so the wall in a new thread still says when it lifts; the budget blocker's copy is two sentences.
