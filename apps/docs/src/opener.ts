import type { LucetEvent } from 'lucet'

/* THE FRONT DOOR OPENS MID-THREAD (review): a splash proves you can
   centre a headline; a settled turn shows a tool call with its receipt
   and duration, a cited answer, and a freshness signal — three
   differentiators visible in the first second, and the rail has
   something to act on. Seeded synchronously so the first paint already
   has it. The cold start stays a STATE — in the rail, under Baseline,
   where the unhappy-states list always put it.

   Shared between the Konfabulator and the components page's "The app,
   live" section: a heading that says "the app" over a bare composer
   was a false claim, and the fix that keeps it true is opening BOTH
   on the same moment rather than maintaining a second scenario. */
export const OPENER_EVENTS: readonly LucetEvent[] = [
  {
    type: 'turn/submitted',
    turnId: 't_open',
    versionId: 'v_open',
    messageId: 'pm_open',
    text: 'Summarise the three documents I shared.',
    authorId: 'you',
    attachmentIds: [],
    retryOf: null,
  },
  { type: 'response/started', turnId: 't_open', messageId: 'rm_open' },
  {
    type: 'part/added',
    messageId: 'rm_open',
    part: {
      kind: 'tool',
      id: 'rm_open_t',
      name: 'Read 3 documents',
      status: 'succeeded',
      detail: '1.4s',
      args: '{ "scope": "attachments", "count": 3 }',
      result: '{ "read": ["vendor-review", "internal-note", "q3-revision"] }',
    },
  },
  { type: 'part/added', messageId: 'rm_open', part: { kind: 'text', id: 'rm_open_x', text: '' } },
  {
    type: 'part/delta',
    messageId: 'rm_open',
    partId: 'rm_open_x',
    delta:
      'All three point at the same schedule risk, though they disagree on the cause. The vendor review attributes it to procurement [1]; the internal note blames scope [2]; the Q3 revision hedges between the two.',
  },
  {
    type: 'part/added',
    messageId: 'rm_open',
    part: {
      kind: 'sources',
      id: 'rm_open_s',
      sources: [
        {
          id: 'src-vendor',
          title: 'Vendor review',
          location: 'Reports / Procurement',
          sourceKind: 'document',
          status: 'ok',
          note: null,
          detail: 'Pages 2–3',
          trace: '{ "pages": [2, 3], "passage": "Procurement lead times moved the critical path." }',
        },
        {
          id: 'src-note',
          title: 'Internal note',
          location: 'Plans / Quarterly',
          sourceKind: 'document',
          status: 'stale',
          note: 'Last checked 6 days ago',
          detail: 'Whole note',
          trace: '{ "passage": "Scope grew twice without a date change." }',
        },
      ],
    },
  },
  { type: 'response/settled', messageId: 'rm_open', status: 'complete', reason: null },
  { type: 'composer/unlocked' },
  {
    type: 'usage/changed',
    patch: { threadTokens: 1_840, contextTokens: 1_840, threadCostUsd: 0.0276, monthlySpentUsd: 6.2676 },
  },
]
