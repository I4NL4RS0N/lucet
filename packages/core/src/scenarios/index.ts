/**
 * The built-in scenario set.
 *
 * Deliberately weighted toward the states nobody designs. The happy path is one
 * entry here and eleven in every other library.
 *
 * Copy in these scenarios is part of the design work, not filler. What a product
 * says when it fails is most of how failing feels.
 *
 * It is also deliberately INDUSTRY-NEUTRAL. These scenarios ship inside the
 * library, so their vocabulary teaches people what it is for -- and an earlier
 * draft was written entirely in bond-market language, which read as a library
 * built for one desk. Everything here is documents, files and plans: the work
 * almost every product using this does.
 */

import { defineScenario } from '../runtime/scenario.js'
import type { Scenario } from '../runtime/scenario.js'

export const happyPath = defineScenario({
  id: 'happy-path',
  label: 'Complete response',
  group: 'Baseline',
  description: 'A response that streams and finishes. The reference point.',
  prompt: 'Summarise the three documents I shared.',
  steps: [
    { type: 'wait', ms: 400 },
    {
      type: 'say',
      text: 'All three describe the same change, but only the last one gives a date for it. The first two were written before the revision, so where they disagree with the third, the third is newer rather than wrong.',
    },
    { type: 'usage', tokens: 840, costUsd: 0.0126 },
    { type: 'complete' },
  ],
})

/*
 * The response as a DOCUMENT: heading, list, table, code, quote, all
 * streamed. Watch the live edge — bold never flashes its asterisks, the
 * table forms the moment its delimiter row starts, the code block appears
 * as a block before it closes. That behaviour is the component.
 */
export const formatted = defineScenario({
  id: 'formatted-response',
  label: 'Formatted response',
  group: 'Baseline',
  description:
    'A response with structure — headings, lists, a table, code — rendered as it streams, never after.',
  prompt: 'Turn my notes into a short plan for the release.',
  steps: [
    { type: 'wait', ms: 400 },
    {
      type: 'say',
      chunkMs: 20,
      text: [
        '## The plan',
        '',
        'Three steps, smallest risk first. The dates follow the [revised timeline](https://example.com/timeline), not the draft.',
        '',
        '1. **Freeze the template** — nothing merges after Tuesday.',
        '2. **Move the review** to Thursday, where the open items already point.',
        '3. **File the summary** — one page, written for someone who was not in the room.',
        '',
        '| Workstream | Owner | Due |',
        '| --- | --- | --- |',
        '| Template | Ada | Tuesday |',
        '| Review | Sam | Thursday |',
        '| Summary | you | Friday |',
        '',
        'The folder layout stays flat:',
        '',
        '```text',
        'plan/',
        '  brief.md',
        '  checklist.md',
        '  decisions.md',
        '```',
        '',
        'Anything still undecided lands in `decisions.md` with a date next to it.',
        '',
        '> One rule while this runs: if a step slips, say so in the thread the day it slips — not in the summary on Friday.',
      ].join('\n'),
    },
    { type: 'usage', tokens: 1460, costUsd: 0.0219 },
    { type: 'complete' },
  ],
})

export const reasoning = defineScenario({
  id: 'reasoning',
  label: 'Thinking disclosure',
  group: 'Baseline',
  description: 'Reasoning streams into a disclosure, separate from the answer.',
  prompt: 'Which of these two plans is more likely to slip?',
  steps: [
    /* Slow enough to SEE: the thinking row is a designed state, and pacing
       that makes it subliminal would un-design it. */
    { type: 'wait', ms: 500 },
    {
      type: 'think',
      text: 'Both end on the same date, so comparing end dates says nothing. The second front-loads its dependencies, which shortens the critical path but leaves no slack if any single one moves.',
      chunkMs: 26,
    },
    { type: 'wait', ms: 350 },
    {
      type: 'say',
      text: 'The second, though not for the reason the timeline suggests. It finishes sooner on paper, but every task depends on the one before it, so a single delay moves the end date by the same amount.',
    },
    { type: 'usage', tokens: 1120, costUsd: 0.0168 },
    { type: 'complete' },
  ],
})

export const toolSuccess = defineScenario({
  id: 'tool-success',
  label: 'Tool call succeeds',
  group: 'Tools',
  description: 'A tool runs and returns. Shows the call lifecycle in context.',
  prompt: 'Check the three sources I flagged.',
  steps: [
    { type: 'wait', ms: 250 },
    {
      type: 'tool',
      /* The row is for readers, so the name is words; the receipt below it
         stays exact. Identifiers belong in the payload, not the sentence. */
      name: 'Searched the documents',
      ms: 1400,
      outcome: 'succeeded',
      detail: '3 of 3 sources returned',
      args: '{ "query": "sources flagged this week", "limit": 3 }',
      result: '{ "returned": 3, "sources": ["Q3 revision", "site survey", "vendor quote"] }',
    },
    { type: 'say', text: 'All three have been updated since you flagged them, the most recent one yesterday.' },
    { type: 'complete' },
  ],
})

export const toolPartialFailure = defineScenario({
  id: 'tool-partial-failure',
  label: 'Tool partly fails',
  group: 'Tools',
  description:
    'The hard case. Some of the data came back and some did not, so the answer is real but incomplete. Silently answering from two thirds of the data is the failure mode this state exists to prevent.',
  prompt: 'Check the three sources I flagged.',
  steps: [
    { type: 'wait', ms: 250 },
    {
      type: 'tool',
      name: 'Searched the documents',
      ms: 1600,
      outcome: 'partial',
      detail: '2 of 3 sources returned. Timed out on the third.',
      args: '{ "query": "sources flagged this week", "limit": 3 }',
      result: '{ "returned": 2, "timed_out": ["vendor quote"], "retryable": true }',
    },
    {
      type: 'say',
      text: 'Two of the three have changed since you flagged them. The third did not come back in time, so this is not the full picture. Ask again and I will retry just that one.',
    },
    { type: 'complete' },
  ],
})

export const refusal = defineScenario({
  id: 'refusal',
  label: 'Refusal',
  group: 'Boundaries',
  description:
    'A boundary, stated plainly and without apology, with the nearest thing it can actually do.',
  prompt: 'Delete the old files and start clean.',
  steps: [
    { type: 'wait', ms: 500 },
    {
      type: 'refuse',
      reason:
        'I cannot delete anything. I can show you exactly what would go, grouped by why it looks old, so you can decide what actually leaves.',
    },
  ],
})

export const lowConfidence = defineScenario({
  id: 'low-confidence',
  label: 'Low confidence',
  group: 'Boundaries',
  description:
    'The answer is offered with its uncertainty attached, rather than delivered at the same confidence as everything else.',
  prompt: 'What is the deadline on this?',
  steps: [
    { type: 'wait', ms: 400 },
    {
      type: 'say',
      text: 'Probably the 30th, which is what the summary says. I could not find it confirmed anywhere in the source documents, so this is the summary’s claim rather than the original’s. Worth checking before you rely on it.',
    },
    { type: 'complete' },
  ],
})

export const interrupted = defineScenario({
  id: 'interrupted',
  label: 'Stream interrupted',
  group: 'Failures',
  description:
    'The connection drops mid-sentence. What arrived stays on screen, because deleting it would be worse than a partial answer.',
  prompt: 'Walk me through what changed.',
  steps: [
    { type: 'wait', ms: 300 },
    { type: 'say', text: 'The change affects how the second stage is applied. Previously that step was' },
    { type: 'interrupt', reason: 'The connection dropped before the response finished.' },
  ],
})

export const rateLimit = defineScenario({
  id: 'rate-limit',
  label: 'Rate limited',
  group: 'Failures',
  description: 'A quota wall, with the one thing the user actually needs: when it lifts.',
  prompt: 'Run that across all 400 files.',
  steps: [
    { type: 'wait', ms: 600 },
    { type: 'fail', reason: 'You have hit this hour’s limit. It resets in 14 minutes. Your draft is saved.' },
  ],
})

export const degradedModel = defineScenario({
  id: 'degraded-model',
  label: 'Silent downgrade, told',
  group: 'Service',
  description:
    'The app fell back to a cheaper model during an incident. That is exactly the moment the user most deserves to be told, and exactly the moment every tool stays quiet.',
  prompt: 'Draft the summary section.',
  steps: [
    { type: 'service', status: 'degraded', message: 'The usual model is unavailable. Running on the fallback, which is faster and less careful.' },
    { type: 'wait', ms: 400 },
    { type: 'say', text: 'Here is a draft. Given what it is running on right now, read the numbers twice.' },
    { type: 'usage', tokens: 520, costUsd: 0.0021 },
    { type: 'complete' },
  ],
})

export const serviceDown = defineScenario({
  id: 'service-down',
  label: 'Provider outage',
  group: 'Service',
  description:
    'Down is not degraded. Degraded means wait or switch. Down means protect the draft and say so.',
  prompt: 'Draft the summary section.',
  steps: [
    { type: 'service', status: 'down', message: 'We can’t reach the AI service right now. Your draft is safe here in the composer.' },
    { type: 'wait', ms: 300 },
    { type: 'fail', reason: 'We couldn’t reach the AI service. Your prompt is still here — try again in a moment.' },
  ],
})

export const staleData = defineScenario({
  id: 'stale-data',
  label: 'Stale result',
  group: 'Freshness',
  description:
    'Answered from cache. Freshness is part of the answer, not metadata to bury.',
  prompt: 'What is the latest version of this?',
  steps: [
    { type: 'wait', ms: 200 },
    {
      type: 'tool',
      name: 'Fetched the index',
      ms: 500,
      outcome: 'succeeded',
      detail: 'Served from cache, 4 hours old',
      args: '{ "path": "revisions/latest" }',
      result: '{ "revision": 7, "dated": "Tuesday", "cache_age_hours": 4 }',
    },
    {
      type: 'say',
      text: 'Revision 7, dated Tuesday. This is from a cache that is four hours old, so if something was published this morning I would not have it yet.',
    },
    { type: 'complete' },
  ],
})

export const builtInScenarios: readonly Scenario[] = [
  happyPath,
  formatted,
  reasoning,
  toolSuccess,
  toolPartialFailure,
  refusal,
  lowConfidence,
  interrupted,
  rateLimit,
  degradedModel,
  serviceDown,
  staleData,
]
