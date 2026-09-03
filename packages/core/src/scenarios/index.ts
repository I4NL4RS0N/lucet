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

/* EVERY ENTRY POINT RUNS THE SEQUENCE AT ITS SCRIPTED PACE — the rail, the
   Features tab, the cold-start suggestion and the deep link alike — and none
   presents a settled state in place of it; the one exception is a
   once-per-thread scenario fired again, which only re-enters its preview
   (settled: the timing review of 2026-09-03, with paired frames). */
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
  /* The promise in the text above, kept and NAMED (round 05, P1): the
     verb retries only the timed-out source and completes the picture. */
  recovery: {
    verb: { label: 'Retry missing source', icon: 'retry-one' },
    mode: 'retry',
    steps: [
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
  },
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
  /* THE SAFE BOUNDARY STILL ADVANCES THE TASK (round 05, P1): the verb
     lists what would go, as rows, and deletes nothing. The response stays
     a refusal; the list is appended to it. */
  recovery: {
    verb: { label: 'Show proposed deletions', icon: 'list' },
    mode: 'resume',
    steps: [
      { type: 'wait', ms: 200 },
      {
        type: 'tool',
        name: 'Listed what would be deleted',
        ms: 700,
        outcome: 'succeeded',
        detail: '4 files, nothing removed',
        args: '{ "scope": "Plans", "older_than_days": 365, "dry_run": true }',
        result: '{ "candidates": 4, "deleted": 0 }',
      },
      {
        type: 'sources',
        label: 'Proposed deletions',
        sources: [
          { id: 'del-kickoff', title: 'kickoff-notes-2023.md', location: 'Plans / Archive', sourceKind: 'document', detail: 'Last edited 14 months ago', trace: '{ "path": "Plans/Archive/kickoff-notes-2023.md", "edited": "2025-06-30", "reason": "superseded by the release plan" }' },
          { id: 'del-draft-a', title: 'brief-draft-a.md', location: 'Plans / Drafts', sourceKind: 'document', detail: 'Superseded draft', trace: '{ "path": "Plans/Drafts/brief-draft-a.md", "superseded_by": "Plans/Release/brief.md" }' },
          { id: 'del-draft-b', title: 'brief-draft-b.md', location: 'Plans / Drafts', sourceKind: 'document', detail: 'Superseded draft', trace: '{ "path": "Plans/Drafts/brief-draft-b.md", "superseded_by": "Plans/Release/brief.md" }' },
          { id: 'del-empty', title: 'Scratch', location: 'Plans / Scratch', sourceKind: 'document', detail: 'Empty folder', trace: '{ "path": "Plans/Scratch", "items": 0 }' },
        ],
      },
      {
        type: 'say',
        text: 'Nothing was deleted. These four look old: a kickoff note from 2023, two drafts the release brief replaced, and an empty folder. Say which should go and I will remove only those.',
      },
    ],
  },
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
    /* THE QUIET LABEL (round 05 P2): uncertainty is marked before the
       answer in one word, in the neutral tone — never a percentage, never
       an alarm. */
    { type: 'notice', state: 'uncertain', tone: 'neutral', label: 'Unverified', text: '' },
    {
      type: 'say',
      text: 'Probably the 30th, which is what the summary says. I could not find it confirmed anywhere in the source documents, so this is the summary’s claim rather than the original’s. Worth checking before you rely on it.',
    },
    { type: 'complete' },
  ],
  /* THE UNCERTAIN ANSWER IS CHECKED, NOT RE-ASKED (round 05, P1): the
     verb runs the citation check and surfaces the sources for the claim. */
  recovery: {
    verb: { label: 'Check sources', icon: 'check-sources' },
    mode: 'resume',
    steps: [
      { type: 'wait', ms: 200 },
      {
        type: 'tool',
        name: 'Checked the sources',
        ms: 800,
        outcome: 'succeeded',
        detail: '1 of 2 claims confirmed',
        args: '{ "claim": "deadline is the 30th", "search": ["Plans/Quarterly"] }',
        result: '{ "confirmed": ["schedule: 28th"], "unconfirmed": ["summary: 30th"] }',
      },
      {
        type: 'sources',
        label: 'Checked against',
        sources: [
          { id: 'chk-summary', title: 'Project summary', location: 'Plans / Quarterly', sourceKind: 'document', detail: 'Page 1', trace: '{ "pages": [1], "passage": "Deadline: the 30th." }' },
          { id: 'chk-schedule', title: 'Schedule', location: 'Plans / Quarterly', sourceKind: 'data', detail: 'Row 14', trace: '{ "row": 14, "milestone": "Deadline", "date": "the 28th" }' },
        ],
      },
      {
        type: 'say',
        text: 'The 30th comes from the summary alone. The schedule names the 28th, so the deadline is the 28th unless the summary was updated after it.',
      },
    ],
  },
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
  /* CONTINUE, FROM WHERE IT STOPPED (round 05, P1): a bounded addition —
     the response resumes and the sentence picks up mid-word, then it
     settles complete. What arrived stayed; what was missing arrives. */
  recovery: {
    verb: { label: 'Continue response', icon: 'continue' },
    mode: 'resume',
    steps: [
      { type: 'wait', ms: 300 },
      {
        type: 'continue',
        text: ' applied once per file, so every batch repeated the same work. Now it runs once per batch, and the second stage sees the whole set at once.',
      },
      { type: 'complete' },
    ],
  },
})

export const rateLimit = defineScenario({
  id: 'rate-limit',
  label: 'Rate limited',
  group: 'Failures',
  description: 'A quota wall, with the one thing the user actually needs: when it lifts.',
  prompt: 'Run that across all 400 files.',
  steps: [
    { type: 'wait', ms: 600 },
    /* The reset is a clock time the ending shows exactly (round 05, P1);
       thirty seconds here so the demo can be watched, not waited out. */
    /* Caution, not danger (round 05 P2 severity table): the limit lifts. */
    { type: 'fail', reason: 'The burst limit for this minute is used up. Your draft is kept.', retryAt: 30_000, tone: 'caution' },
  ],
  /* NO GENERIC RETRY UNTIL RESET: the verb arms a retry for the moment
     the limit lifts; until then it reads as a status. The draft stays. */
  recovery: {
    verb: { label: 'Retry when it resets', icon: 'queue' },
    mode: 'retry-at',
    steps: [
      { type: 'wait', ms: 300 },
      { type: 'say', text: 'Done across all 400 files. Twelve carried the old header and were updated; the rest were already current.' },
      { type: 'usage', tokens: 1_800 },
      { type: 'complete' },
    ],
  },
})

/* TOLD, PLAINLY (audit round 05): the fallback is a fact about how this
   answer was made, so it is stated inline before the answer — model,
   reason, impact — in the info tone, because transparency is not a
   failure. The composer's model control agrees (Fast), and the notice
   carries the one exit the runtime can keep: Retry on Auto, which plays
   the recovery once Auto is back. */
export const degradedModel = defineScenario({
  id: 'degraded-model',
  label: 'Fallback model used',
  group: 'Service',
  description:
    'The app fell back to a cheaper model during an incident. That is exactly the moment the user most deserves to be told, and exactly the moment every tool stays quiet.',
  prompt: 'Draft the summary section.',
  steps: [
    { type: 'service', status: 'degraded', message: 'Auto is temporarily unavailable.' },
    { type: 'model', modelId: 'fast' },
    {
      type: 'notice',
      state: 'degraded',
      /* Transparency, not failure: the info tone on the degraded glyph. */
      tone: 'info',
      label: 'Using Fast instead of Auto.',
      text: 'Auto is temporarily unavailable — review numerical details before using this result.',
      action: { label: 'Retry on Auto', kind: 'retry-on-model', modelId: 'auto' },
    },
    { type: 'wait', ms: 400 },
    {
      type: 'say',
      text: 'Here is a draft of the summary section. The two figures it quotes — the total and the delivery date — are carried over from the notes as written.',
    },
    { type: 'usage', tokens: 520 },
    { type: 'complete' },
  ],
  /* Retry on Auto: the service is back, the model control returns to
     Auto, and the same section is drafted with the figures checked. */
  recovery: {
    /* No verb on the ending — the exit is the notice's action (P0, the
       reference implementation). */
    mode: 'retry',
    steps: [
      { type: 'service', status: 'operational', message: null },
      { type: 'model', modelId: 'auto' },
      { type: 'wait', ms: 400 },
      {
        type: 'say',
        text: 'Here is the summary section, drafted on Auto. The total and the delivery date were checked against the revised table: the total holds, the date moved to Thursday.',
      },
      { type: 'usage', tokens: 560 },
      { type: 'complete' },
    ],
  },
})

export const serviceDown = defineScenario({
  id: 'service-down',
  label: 'Provider outage',
  group: 'Service',
  description:
    'Down is not degraded. Degraded means wait or switch. Down means protect the draft and say so.',
  prompt: 'Draft the summary section.',
  steps: [
    /* TWO LEVELS, NO REPEATED WORDING (round 05, P1): the composer's
       strip states the current condition, quietly; the turn's ending
       records what happened to that request, in danger. */
    { type: 'service', status: 'down', message: 'The AI service is unreachable right now — drafts are kept.' },
    { type: 'wait', ms: 300 },
    { type: 'fail', reason: 'This request did not get through.' },
  ],
  recovery: {
    verb: { label: 'Retry connection', icon: 'connection' },
    mode: 'retry',
    steps: [
      { type: 'service', status: 'operational', message: null },
      { type: 'wait', ms: 300 },
      { type: 'say', text: 'Here is the summary section. The two figures it quotes, the total and the delivery date, match the revised table.' },
      { type: 'usage', tokens: 520 },
      { type: 'complete' },
    ],
  },
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
  /* REFRESH, THROUGH THE RUNTIME (round 05, P1): a fresh fetch, and the
     receipt says how fresh. */
  recovery: {
    verb: { label: 'Refresh result', icon: 'refresh' },
    mode: 'resume',
    steps: [
      { type: 'wait', ms: 200 },
      {
        type: 'tool',
        name: 'Fetched the index',
        ms: 600,
        outcome: 'succeeded',
        detail: 'Fresh — fetched just now',
        args: '{ "path": "revisions/latest", "cache": "bypass" }',
        result: '{ "revision": 8, "dated": "today 09:14", "cache_age_hours": 0 }',
      },
      { type: 'say', text: 'Revision 8, published this morning at 09:14. The cached answer above was one revision behind.' },
    ],
  },
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
  /* RE-CHECK AGAINST THE UPDATED SOURCE (round 05, P1): the source's flag
     clears when the check lands, and the answer says what held. */
  recovery: {
    verb: { label: 'Re-check answer', icon: 'recheck' },
    mode: 'resume',
    steps: [
      { type: 'wait', ms: 300 },
      {
        type: 'tool',
        name: 'Re-checked the Q3 revision',
        ms: 700,
        outcome: 'succeeded',
        detail: 'Pages 4–6, revised copy',
        args: '{ "source": "src-q3", "pages": [4, 5, 6] }',
        result: '{ "changed": ["room booking"], "unchanged": ["freeze date", "review capacity", "print deadline"] }',
      },
      { type: 'sourceChange', sourceId: 'src-q3', status: 'ok', note: null },
      { type: 'say', text: 'Checked against the updated revision: the freeze still lands Tuesday, and the room and vendor dates are unchanged.' },
    ],
  },
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
  /* REPLACE THE SOURCE (round 05, P1): the dead reference is replaced in
     place by one that opens; the removed one never read as openable. */
  recovery: {
    verb: { label: 'Replace source', icon: 'replace' },
    mode: 'resume',
    steps: [
      { type: 'wait', ms: 300 },
      {
        type: 'tool',
        name: 'Found a replacement',
        ms: 700,
        outcome: 'succeeded',
        detail: 'Archived copy, same query',
        args: '{ "missing": "src-quote", "search": ["Suppliers / Archive"] }',
        result: '{ "replacement": "src-quote-archive", "rows": 3 }',
      },
      {
        type: 'sourceReplace',
        sourceId: 'src-quote',
        replacement: { id: 'src-quote-archive', title: 'Vendor quote (archived copy)', location: 'Suppliers / Archive', sourceKind: 'data', detail: 'Query, 3 rows', trace: '{ "query": "deadline FROM quotes_archive WHERE vendor = \'print\'", "returned": 3 }' },
      },
      { type: 'say', text: 'The vendor quote was removed from the library. The archived copy returns the same three rows, and the print deadline holds.' },
    ],
  },
})

/*
 * FEATURES: the other half of the thesis. States show how a response can
 * go; these show what other libraries do not have at all.
 */
/*
 * SCOPE: the strongest idea in the set. The host's breadcrumb is the
 * context ladder; the control shows what is actually inside each rung;
 * and when the page changes under it, the scope follows AND SAYS SO (or,
 * with a draft in the field, asks first).
 */

export const scopeLadder = defineScenario({
  id: 'scope-ladder',
  label: 'Use the current page as context',
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
  label: 'Scope updates after navigation',
  group: 'Scope',
  kind: 'feature',
  description:
    'In a drawer the page keeps moving. With nothing typed, the scope follows the navigation and says so. With a draft in the field it asks first — the words were written against a page.',
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
    /* THE FREEZE (round 05 P2): a draft is in the field when the page
       moves again, so this move is HELD and the control asks. */
    { type: 'wait', ms: 1600 },
    { type: 'draft', text: 'Summarise what changed in the review for the vendor.' },
    { type: 'wait', ms: 500 },
    {
      type: 'scopeMoved',
      levels: [
        {
          id: 'page',
          label: 'This page',
          summary: 'Vendor call — the notes and the quote',
          itemCount: 2,
        },
        {
          id: 'section',
          label: 'Calls',
          summary: 'Everything filed under Calls',
          itemCount: 6,
        },
        {
          id: 'all',
          label: 'Everything',
          summary: 'All of Aquilo',
          itemCount: 48,
        },
      ],
      selectedId: 'page',
      note: 'The page changed — “This page” now covers Vendor call.',
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
  /* STRAIGHT INTO PREVIEW (audit round 05): the point of this trigger is
     the state it ends in, so it lands settled — no Sending, no streaming,
     no Queue frame — and firing it again re-enters the preview without
     adding a single version block. */
  instant: true,
  oncePerThread: true,
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
    /* Ada's turn runs LIVE and long enough to be seen (audit round 05):
       the composer stays typeable under her lock, the strip says whose
       turn it is, Send reads Queue, and the queued turn sends itself when
       hers lands — the library keeping the strip's promise. */
    {
      type: 'say',
      chunkMs: 90,
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
  /* BEFORE THE SPEND (audit round 05): the trigger sets up the decision
     and stops. A heavy thread (the window re-sends every turn, so context
     is what makes the next turn expensive), a month nearly gone ($9.88 of
     $10 — twelve cents left, less than the turn on Auto, more than on
     Fast — seeded after the context so the ledger is exact), and the draft
     already in the composer. The meter is the decision point: Use Fast or
     continue on Auto. Nothing is spent until the person sends. */
  preSend: [
    { type: 'usage', tokens: 46_000, costUsd: 0.41 },
    { type: 'budget', budgetUsd: 10, spentUsd: 9.88 },
    { type: 'draft', text: 'Compare the two proposals and recommend one.' },
  ],
  /* The reply to the person's own send, priced at the model they chose. */
  steps: [
    { type: 'wait', ms: 500 },
    {
      type: 'say',
      text: 'The second proposal. Both land in the same quarter, but the second front-loads its dependencies and names an owner for each \u2014 the first defers exactly the decisions that make the schedule slip.',
    },
    { type: 'usage', tokens: 2_400 },
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
    /* The month resets at a clock time the blocked composer shows exactly
       (round 05, P1): two days and five hours from now, in the fiction. */
    { type: 'budget', budgetUsd: 10, spentUsd: 9.97, resetsInMs: 2 * 24 * 3_600_000 + 5 * 3_600_000 },
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
/*
 * DO VISIBLY DOES (audit round 05). The cold start's Do chip promised
 * pages in Plans; the path now performs it through the tool lifecycle —
 * three legible receipts, running to complete on the runtime's own clock
 * (about 2.3 seconds of real time; the chip's "~2 min" is the fiction's
 * estimate) — then the summary, then the created pages as rows in the
 * Sources grammar under "Created", each expandable in place. No artifact
 * panel, no new component: the receipt and the row already existed.
 */
export const doPlan = defineScenario({
  id: 'do-plan',
  label: 'Do — creates pages in Plans',
  group: 'Baseline',
  description:
    'The Do path: a request that changes something outside the answer. The receipts run, the pages are created, and the answer reports what now exists.',
  prompt: 'Turn my notes into a short plan.',
  steps: [
    { type: 'wait', ms: 250 },
    /* Staged (round 06): the three operations enter together as pending
       and run one after another — roughly half a second each, the answer
       after the last — so the work is legible while it happens. */
    {
      type: 'tools',
      items: [
        {
          name: 'Drafting release plan',
          ms: 480,
          outcome: 'succeeded',
          detail: '4 sections from 2 notes',
          args: '{ "source": ["Kickoff notes", "Vendor call"], "shape": "release plan" }',
          result: '{ "sections": ["Goal", "Scope", "Timeline", "Risks"] }',
        },
        {
          name: 'Creating folder structure',
          ms: 450,
          outcome: 'succeeded',
          detail: 'Plans / Release',
          args: '{ "parent": "Plans", "name": "Release" }',
          result: '{ "path": "Plans/Release", "created": true }',
        },
        {
          name: 'Filing pages in Plans',
          ms: 520,
          outcome: 'succeeded',
          detail: '3 pages filed',
          args: '{ "folder": "Plans/Release", "pages": ["brief.md", "checklist.md", "decisions.md"] }',
          result: '{ "filed": 3, "failed": 0 }',
        },
      ],
    },
    {
      type: 'say',
      text: 'Done. Three pages are filed under Plans / Release: the brief carries the four-section plan, the checklist holds the launch steps in order, and the decisions log opens with the two calls already made in your notes.',
    },
    {
      type: 'sources',
      label: 'Created',
      sources: [
        {
          id: 'made-brief',
          title: 'brief.md',
          location: 'Plans / Release',
          sourceKind: 'document',
          detail: '4 sections',
          trace: '{ "path": "Plans/Release/brief.md", "sections": ["Goal", "Scope", "Timeline", "Risks"], "words": 412 }',
        },
        {
          id: 'made-checklist',
          title: 'checklist.md',
          location: 'Plans / Release',
          sourceKind: 'document',
          detail: '9 steps',
          trace: '{ "path": "Plans/Release/checklist.md", "steps": 9, "owners_assigned": 6 }',
        },
        {
          id: 'made-decisions',
          title: 'decisions.md',
          location: 'Plans / Release',
          sourceKind: 'document',
          detail: '2 decisions',
          trace: '{ "path": "Plans/Release/decisions.md", "decisions": ["Freeze the template Tuesday", "Move the review to Thursday"] }',
        },
      ],
    },
    { type: 'usage', tokens: 1_260, costUsd: 0.0189 },
    { type: 'complete' },
  ],
})

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
  doPlan,
  scopeLadder,
  scopeMoved,
  versionHistory,
  restoreVersion,
  multiplayer,
]
