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
  prompt: 'Draft the release plan and set up the folder structure.',
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
  prompt: 'Check that the sources I flagged are still current.',
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
      result: '{ "returned": 3, "sources": ["Q3 revision", "site survey", "carrier quote"] }',
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
  prompt: 'Check that the sources I flagged are still current.',
  steps: [
    { type: 'wait', ms: 250 },
    {
      type: 'tool',
      name: 'Searched the documents',
      ms: 1600,
      outcome: 'partial',
      detail: '2 of 3 sources returned. Timed out on the third.',
      args: '{ "query": "sources flagged this week", "limit": 3 }',
      result: '{ "returned": 2, "timed_out": ["carrier quote"], "retryable": true }',
    },
    {
      type: 'say',
      text: 'Two of the three have changed since you flagged them. The third did not come back in time, so this is not the full picture. Ask again and I will retry just that one.',
    },
    { type: 'complete' },
  ],
  /* The promise in the text above, kept: the retry re-runs only the
     timed-out source and completes the picture. */
  recovery: [
    { type: 'wait', ms: 250 },
    {
      type: 'tool',
      name: 'Retried the carrier quote',
      ms: 1100,
      outcome: 'succeeded',
      detail: '1 source returned',
      args: '{ "query": "carrier quote", "limit": 1 }',
      result: '{ "returned": 1, "timed_out": [] }',
    },
    {
      type: 'say',
      text: 'The carrier quote came back this time, and it has changed too — its totals moved with the revised delivery table. All three of your flagged sources are now confirmed current as of this check; you are looking at the full picture.',
    },
    { type: 'usage', tokens: 410, costUsd: 0.0061 },
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

/*
 * SOURCES: a citation is a claim with a timestamp. One happy scenario,
 * and two where the bibliography AGES — the sourceChange steps run after
 * the response settles, because that is when sources actually rot.
 */

export const citedResponse = defineScenario({
  id: 'cited-response',
  label: 'Cited response',
  group: 'Sources',
  description:
    'Claims carry [n] markers and the response carries its bibliography — sources are part of the message, not decoration.',
  prompt: 'Where do the revised dates come from?',
  steps: [
    { type: 'wait', ms: 300 },
    {
      type: 'say',
      text: 'The dates come from three places, and they agree with each other. The freeze lands Tuesday per the Q3 revision [1], the room survey confirms capacity for the review [2], and the vendor quote fixes the print deadline [3].',
    },
    {
      type: 'sources',
      sources: [
        {
          id: 'src-q3',
          title: 'Q3 revision',
          location: 'Plans / Quarterly',
          sourceKind: 'document',
          detail: 'Pages 4\u20136',
          trace: '{ "pages": [4, 5, 6], "passage": "Freeze lands Tuesday; nothing merges after." }',
        },
        {
          id: 'src-survey',
          title: 'Site survey',
          location: 'Facilities / Reviews',
          sourceKind: 'document',
          detail: 'Page 2',
          trace: '{ "pages": [2], "passage": "Room 4 holds the full review group." }',
        },
        {
          id: 'src-quote',
          title: 'Vendor quote',
          location: 'Suppliers / Print',
          sourceKind: 'data',
          detail: 'Query, 3 rows',
          trace: '{ "query": "deadline FROM quotes WHERE vendor = \'print\'", "returned": 3 }',
        },
      ],
    },
    { type: 'complete' },
  ],
})

export const sourceUpdated = defineScenario({
  id: 'source-updated',
  label: 'Source updated since',
  group: 'Sources',
  description:
    'A cited source changes AFTER the answer settles. The bibliography says so instead of silently aging.',
  prompt: 'Where do the revised dates come from?',
  steps: [
    { type: 'wait', ms: 300 },
    {
      type: 'say',
      text: 'The dates come from three places, and they agree with each other. The freeze lands Tuesday per the Q3 revision [1], the room survey confirms capacity for the review [2], and the vendor quote fixes the print deadline [3].',
    },
    {
      type: 'sources',
      sources: [
        {
          id: 'src-q3',
          title: 'Q3 revision',
          location: 'Plans / Quarterly',
          sourceKind: 'document',
          detail: 'Pages 4\u20136',
          trace: '{ "pages": [4, 5, 6], "passage": "Freeze lands Tuesday; nothing merges after." }',
        },
        {
          id: 'src-survey',
          title: 'Site survey',
          location: 'Facilities / Reviews',
          sourceKind: 'document',
          detail: 'Page 2',
          trace: '{ "pages": [2], "passage": "Room 4 holds the full review group." }',
        },
        {
          id: 'src-quote',
          title: 'Vendor quote',
          location: 'Suppliers / Print',
          sourceKind: 'data',
          detail: 'Query, 3 rows',
          trace: '{ "query": "deadline FROM quotes WHERE vendor = \'print\'", "returned": 3 }',
        },
      ],
    },
    { type: 'complete' },
    { type: 'wait', ms: 1600 },
    {
      type: 'sourceChange',
      sourceId: 'src-q3',
      status: 'stale',
      note: 'Updated after it was cited — the dates may have moved.',
    },
  ],
})

export const sourceGone = defineScenario({
  id: 'source-gone',
  label: 'Source no longer available',
  group: 'Sources',
  description:
    'A cited source is removed after the fact. A dead reference marked dead beats a confident link to nothing.',
  prompt: 'Where do the revised dates come from?',
  steps: [
    { type: 'wait', ms: 300 },
    {
      type: 'say',
      text: 'The dates come from three places, and they agree with each other. The freeze lands Tuesday per the Q3 revision [1], the room survey confirms capacity for the review [2], and the vendor quote fixes the print deadline [3].',
    },
    {
      type: 'sources',
      sources: [
        {
          id: 'src-q3',
          title: 'Q3 revision',
          location: 'Plans / Quarterly',
          sourceKind: 'document',
          detail: 'Pages 4\u20136',
          trace: '{ "pages": [4, 5, 6], "passage": "Freeze lands Tuesday; nothing merges after." }',
        },
        {
          id: 'src-survey',
          title: 'Site survey',
          location: 'Facilities / Reviews',
          sourceKind: 'document',
          detail: 'Page 2',
          trace: '{ "pages": [2], "passage": "Room 4 holds the full review group." }',
        },
        {
          id: 'src-quote',
          title: 'Vendor quote',
          location: 'Suppliers / Print',
          sourceKind: 'data',
          detail: 'Query, 3 rows',
          trace: '{ "query": "deadline FROM quotes WHERE vendor = \'print\'", "returned": 3 }',
        },
      ],
    },
    { type: 'complete' },
    { type: 'wait', ms: 1600 },
    {
      type: 'sourceChange',
      sourceId: 'src-quote',
      status: 'gone',
      note: 'Removed from the library after it was cited.',
    },
  ],
})

/*
 * FEATURES: the other half of the thesis. States show how a response can
 * go; these show what other libraries do not have at all.
 */
/*
 * SCOPE: the strongest idea in the set. The host's breadcrumb is the
 * context ladder; the control shows what is actually inside each rung;
 * and when the page moves underneath, the scope follows AND SAYS SO.
 */

export const scopeLadder = defineScenario({
  id: 'scope-ladder',
  label: 'Scope from the breadcrumb',
  group: 'Scope',
  kind: 'feature',
  description:
    'The app\u2019s own hierarchy is the context control: default to this page, widen deliberately, see what each rung holds.',
  prompt: 'What is still open in this plan?',
  steps: [
    {
      type: 'scope',
      levels: [
        {
          id: 'page',
          label: 'This page',
          summary: 'Quarterly planning \u2014 the plan and its 4 linked notes',
          itemCount: 5,
        },
        {
          id: 'section',
          label: 'Plans',
          summary: 'Everything filed under Plans',
          itemCount: 12,
        },
        {
          id: 'all',
          label: 'Everything',
          summary: 'All of Aquilo',
          itemCount: 48,
        },
      ],
      selectedId: 'page',
    },
    { type: 'wait', ms: 250 },
    {
      type: 'tool',
      name: 'Read the scope',
      ms: 700,
      outcome: 'succeeded',
      detail: 'This page \u2014 5 items',
      args: '{ "scope": "page", "items": 5 }',
      result: '{ "read": ["plan", "brief", "checklist", "decisions", "review-notes"] }',
    },
    {
      type: 'say',
      text: 'Within this page, two things are open: the venue hold, and closing out the two blocked workstreams once the review lands. Everything else on the plan is done or dated.',
    },
    { type: 'complete' },
  ],
})

export const scopeMoved = defineScenario({
  id: 'scope-moved',
  label: 'The page moves underneath',
  group: 'Scope',
  kind: 'feature',
  description:
    'In a drawer the page keeps moving. The scope follows the navigation \u2014 and says so, instead of silently guessing.',
  prompt: 'What is still open in this plan?',
  steps: [
    {
      type: 'scope',
      levels: [
        {
          id: 'page',
          label: 'This page',
          summary: 'Quarterly planning \u2014 the plan and its 4 linked notes',
          itemCount: 5,
        },
        {
          id: 'section',
          label: 'Plans',
          summary: 'Everything filed under Plans',
          itemCount: 12,
        },
        {
          id: 'all',
          label: 'Everything',
          summary: 'All of Aquilo',
          itemCount: 48,
        },
      ],
      selectedId: 'page',
    },
    { type: 'wait', ms: 250 },
    {
      type: 'say',
      text: 'Two things are open: the venue hold, and the two blocked workstreams. Both are waiting on Thursday\u2019s review.',
    },
    { type: 'complete' },
    { type: 'wait', ms: 1400 },
    {
      type: 'scopeMoved',
      levels: [
        {
          id: 'page',
          label: 'This page',
          summary: 'Reports review \u2014 the summary and its 2 appendices',
          itemCount: 3,
        },
        {
          id: 'section',
          label: 'Reports',
          summary: 'Everything filed under Reports',
          itemCount: 9,
        },
        {
          id: 'all',
          label: 'Everything',
          summary: 'All of Aquilo',
          itemCount: 48,
        },
      ],
      selectedId: 'page',
      note: 'The page changed \u2014 \u201cThis page\u201d now covers Reports review.',
    },
  ],
})

export const versionHistory = defineScenario({
  id: 'version-history',
  label: 'Version history',
  group: 'Versions',
  kind: 'feature',
  description:
    'Asking again makes a NEW version of the same words — and the older one stays in the thread instead of vanishing.',
  prompt: 'Tighten the summary to three sentences.',
  steps: [
    { type: 'wait', ms: 300 },
    {
      type: 'say',
      text: 'The workstreams are mostly on schedule, though two of them are blocked on the same review, which moved to Thursday. The budget follows the revised figures. The template switches over on Tuesday. Filing before then uses the old one. The venue hold still needs confirming.',
    },
    { type: 'complete' },
    { type: 'wait', ms: 900 },
    {
      type: 'retryTurn',
      say: 'Three of five workstreams are on schedule; the other two unblock after Thursday\u2019s review. Budget and template switch to the revised versions on Tuesday. Only the venue hold is still open.',
    },
  ],
})

export const restoreVersion = defineScenario({
  id: 'restore-version',
  label: 'Restore a version',
  group: 'Versions',
  kind: 'feature',
  description:
    'The thread IS the version history: preview an earlier version, see later turns set aside, then return — or restore it, which only ever adds.',
  prompt: 'Tighten the summary to three sentences.',
  steps: [
    { type: 'wait', ms: 300 },
    {
      type: 'say',
      text: 'The workstreams are mostly on schedule, though two of them are blocked on the same review, which moved to Thursday. The budget follows the revised figures. The template switches over on Tuesday. Filing before then uses the old one. The venue hold still needs confirming.',
    },
    { type: 'complete' },
    { type: 'wait', ms: 700 },
    {
      type: 'retryTurn',
      say: 'Three of five workstreams are on schedule; the other two unblock after Thursday\u2019s review. Budget and template switch to the revised versions on Tuesday. Only the venue hold is still open.',
    },
    { type: 'wait', ms: 1100 },
    { type: 'restore' },
  ],
})

export const multiplayer = defineScenario({
  id: 'multiplayer',
  label: 'Another person’s turn',
  group: 'Multiplayer',
  kind: 'feature',
  author: 'Ada',
  description:
    'A Lucet thread is shared: several people, one thread, a single writer at a time. Ada asks — the composer locks for everyone until her answer lands, and her turn arrives wearing her face. While hers runs, write your own and Queue it: it sends itself the moment the thread frees.',
  prompt: 'Pull the totals for the northern site.',
  steps: [
    { type: 'wait', ms: 600 },
    {
      type: 'say',
      text: 'Gathered. The northern site peaks in March, and the one number that moved since last week — the survey figure — is flagged for review.',
    },
    { type: 'usage', tokens: 610, costUsd: 0.0092 },
    { type: 'complete' },
  ],
})


/*
 * COST — the price before you spend it. A STATE group, not a feature
 * (brief §6, "Cost & latency signaling"): these lived on the Features
 * tab and no state review ever reached them — a designed state nobody
 * can trigger is indistinguishable from an undesigned one, so they sit
 * in the States rail now, wired through the runtime like every other
 * trigger.
 *
 * Every tool can tell you what you spent. The meter's job is the other
 * direction: the projected price of the NEXT turn, on each model, beside
 * the picker — so the cheaper model is the exit, one click from the
 * warning. The numbers here are chosen so the states actually derive:
 * caution means the remaining month no longer covers the projection, and
 * spent means a real turn crossed the line — nothing is flagged.
 */

export const budgetLow = defineScenario({
  id: 'budget-low',
  label: 'Budget caution',
  group: 'Cost',
  description:
    'The month is nearly spent and the thread is heavy, so the projected price of the next turn on the current model no longer fits what remains. The meter says so \u2014 and prices the model that still fits, one click away.',
  prompt: 'Compare the two proposals and recommend one.',
  steps: [
    /* A heavy thread: the window re-sends every turn, so context is what
       makes the next turn expensive. */
    { type: 'usage', tokens: 46_000, costUsd: 0.41 },
    /* The month, nearly gone. Seeded after the context so the ledger is
       exact: $9.80 spent of $10. */
    { type: 'budget', budgetUsd: 10, spentUsd: 9.8 },
    { type: 'wait', ms: 500 },
    {
      type: 'say',
      text: 'The second proposal. Both land in the same quarter, but the second front-loads its dependencies and names an owner for each \u2014 the first defers exactly the decisions that made last quarter slip.',
    },
    { type: 'usage', tokens: 2_400, costUsd: 0.11 },
    { type: 'complete' },
  ],
})

export const budgetSpent = defineScenario({
  id: 'budget-spent',
  label: 'Budget spent',
  group: 'Cost',
  description:
    'This turn itself crosses the line: its cost lands on the ledger and the composer stops with words, not a grey button. The block is derived from the numbers \u2014 nothing was flagged.',
  prompt: 'Summarise where the project stands.',
  steps: [
    { type: 'usage', tokens: 30_000, costUsd: 0.9 },
    { type: 'budget', budgetUsd: 10, spentUsd: 9.97 },
    { type: 'wait', ms: 500 },
    {
      type: 'say',
      text: 'Three of the four workstreams are on schedule. The venue hold is the open risk \u2014 it expires Friday, and everything in the June column assumes it holds.',
    },
    /* The crossing: $9.97 + $0.05 \u2014 the month ends mid-conversation,
       the way it actually does. */
    { type: 'usage', tokens: 2_600, costUsd: 0.05 },
    { type: 'complete' },
  ],
})

/*
 * THE RAIL LEADS WITH THE ARGUMENT. The stage at rest is already the
 * baseline demo — a complete cited answer, a successful tool call,
 * freshness, feedback — so a rail that leads with BASELINE spends its
 * top slot duplicating the stage while the fold cuts differentiators
 * off the bottom. Group order is insertion order, so the array IS the
 * argument: boundaries, tools, failures, service, cost, freshness —
 * the states the stage cannot show at rest — and the table stakes
 * filed last, which is what the brief calls them. Contrast pairs
 * (success beside partial failure) stay adjacent inside their group;
 * ids never move, so deep links hold.
 */
export const builtInScenarios: readonly Scenario[] = [
  refusal,
  lowConfidence,
  toolSuccess,
  toolPartialFailure,
  interrupted,
  rateLimit,
  degradedModel,
  serviceDown,
  budgetLow,
  budgetSpent,
  staleData,
  citedResponse,
  sourceUpdated,
  sourceGone,
  happyPath,
  formatted,
  reasoning,
  scopeLadder,
  scopeMoved,
  versionHistory,
  restoreVersion,
  multiplayer,
]
