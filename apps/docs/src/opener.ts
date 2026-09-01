import type { LucetEvent } from 'lucet-core'

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
  /* The exchange BEFORE the one on show: mostly scrolled out at open,
     the tail of its answer visible above the current user message. A
     thread that claims to be mid-conversation and shows exactly one
     exchange is a splash screen with extra steps; this one gives the
     scroll region something honest to hold and the claim a witness. */
  {
    type: 'turn/submitted',
    turnId: 't_prev',
    versionId: 'v_prev',
    messageId: 'pm_prev',
    text: 'Which of the documents changed since last week?',
    authorId: 'you',
    attachmentIds: [],
    retryOf: null,
  },
  { type: 'response/started', turnId: 't_prev', messageId: 'rm_prev' },
  { type: 'part/added', messageId: 'rm_prev', part: { kind: 'text', id: 'rm_prev_x', text: '' } },
  {
    type: 'part/delta',
    messageId: 'rm_prev',
    partId: 'rm_prev_x',
    delta:
      'Two of the three. The carrier review picked up a revised delivery table on Friday — the procurement dates moved out by a week. The internal note added a paragraph on scope late Monday. The Q3 revision has not changed since it was filed; if you want, I can re-check all three against their sources before you circulate anything.',
  },
  { type: 'response/settled', messageId: 'rm_prev', status: 'complete', reason: null },
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
      result: '{ "read": ["carrier-review", "internal-note", "q3-revision"] }',
    },
  },
  { type: 'part/added', messageId: 'rm_open', part: { kind: 'text', id: 'rm_open_x', text: '' } },
  {
    type: 'part/delta',
    messageId: 'rm_open',
    partId: 'rm_open_x',
    delta:
      'All three point at the same schedule risk, though they disagree on the cause. The carrier review attributes it to procurement [1]; the internal note blames scope [2]; the Q3 revision hedges between the two.',
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
          title: 'Carrier review',
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
