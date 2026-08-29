/**
 * The built-in scenario set.
 *
 * Deliberately weighted toward the states nobody designs. The happy path is one
 * entry here and eleven in every other library.
 *
 * Copy in these scenarios is part of the design work, not filler. What a product
 * says when it fails is most of how failing feels.
 */

import { defineScenario } from '../runtime/scenario.js'
import type { Scenario } from '../runtime/scenario.js'

export const happyPath = defineScenario({
  id: 'happy-path',
  label: 'Complete response',
  group: 'Baseline',
  description: 'A response that streams and finishes. The reference point.',
  prompt: 'Summarise how issuance volume moved last quarter.',
  steps: [
    { type: 'wait', ms: 400 },
    {
      type: 'say',
      text: 'Issuance volume rose 12% quarter over quarter, driven almost entirely by investment grade. High yield was flat. The move is concentrated in the last three weeks of the quarter, so it reads more like pulled-forward supply than a change in trend.',
    },
    { type: 'usage', tokens: 840, costUsd: 0.0126 },
    { type: 'complete' },
  ],
})

export const reasoning = defineScenario({
  id: 'reasoning',
  label: 'Thinking disclosure',
  group: 'Baseline',
  description: 'Reasoning streams into a disclosure, separate from the answer.',
  prompt: 'Which of these two portfolios carries more duration risk?',
  steps: [
    { type: 'wait', ms: 300 },
    {
      type: 'think',
      text: 'Both hold long-dated paper. Portfolio A is barbelled, so its weighted duration understates its convexity. Comparing weighted average duration alone would be misleading here.',
      chunkMs: 14,
    },
    { type: 'wait', ms: 250 },
    {
      type: 'say',
      text: 'Portfolio A, though not by the measure you would reach for first. Its weighted average duration is lower, but it is barbelled, so it reacts more sharply at both ends of the curve.',
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
  prompt: 'Pull the current spread for the three names I flagged.',
  steps: [
    { type: 'wait', ms: 250 },
    { type: 'tool', name: 'query_market_data', ms: 1400, outcome: 'succeeded', detail: '3 of 3 names returned' },
    { type: 'say', text: 'All three have widened since you flagged them, between 8 and 21 basis points.' },
    { type: 'complete' },
  ],
})

export const toolPartialFailure = defineScenario({
  id: 'tool-partial-failure',
  label: 'Tool partly fails',
  group: 'Tools',
  description:
    'The hard case. Some of the data came back and some did not, so the answer is real but incomplete. Silently answering from two thirds of the data is the failure mode this state exists to prevent.',
  prompt: 'Pull the current spread for the three names I flagged.',
  steps: [
    { type: 'wait', ms: 250 },
    { type: 'tool', name: 'query_market_data', ms: 1600, outcome: 'partial', detail: '2 of 3 names returned. Timed out on the third.' },
    {
      type: 'say',
      text: 'Two of the three have widened, by 8 and 21 basis points. The third did not come back in time, so this is not the full picture. Ask again and I will retry just that one.',
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
  prompt: 'Tell me which of these bonds to buy.',
  steps: [
    { type: 'wait', ms: 500 },
    {
      type: 'refuse',
      reason:
        'I cannot make a buy or sell recommendation. I can lay the three side by side on spread, duration, and rating history, which is usually the comparison underneath the question.',
    },
  ],
})

export const lowConfidence = defineScenario({
  id: 'low-confidence',
  label: 'Low confidence',
  group: 'Boundaries',
  description:
    'The answer is offered with its uncertainty attached, rather than delivered at the same confidence as everything else.',
  prompt: 'What is the recovery rate assumption here?',
  steps: [
    { type: 'wait', ms: 400 },
    {
      type: 'say',
      text: 'Probably 40%, which is the sector convention. I could not find it stated anywhere in the documents in scope, so this is the default rather than this issuer’s figure. Worth confirming before you rely on it.',
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
  prompt: 'Walk me through the methodology change.',
  steps: [
    { type: 'wait', ms: 300 },
    { type: 'say', text: 'The change affects how the sector adjustment is applied. Previously the adjustment was' },
    { type: 'interrupt', reason: 'The connection dropped before the response finished.' },
  ],
})

export const rateLimit = defineScenario({
  id: 'rate-limit',
  label: 'Rate limited',
  group: 'Failures',
  description: 'A quota wall, with the one thing the user actually needs: when it lifts.',
  prompt: 'Run that across all 400 issuers.',
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
    { type: 'service', status: 'down', message: 'The model provider is having an outage. Nothing you have written is lost.' },
    { type: 'wait', ms: 300 },
    { type: 'fail', reason: 'Cannot reach the model. Your prompt is still in the composer.' },
  ],
})

export const staleData = defineScenario({
  id: 'stale-data',
  label: 'Stale result',
  group: 'Freshness',
  description:
    'Answered from cache. Freshness is part of the answer, not metadata to bury.',
  prompt: 'What is the latest rating action?',
  steps: [
    { type: 'wait', ms: 200 },
    { type: 'tool', name: 'query_ratings', ms: 500, outcome: 'succeeded', detail: 'Served from cache, 4 hours old' },
    {
      type: 'say',
      text: 'Downgraded one notch to BBB. This is from a cache that is four hours old, so if there was an action this morning I would not have it yet.',
    },
    { type: 'complete' },
  ],
})

export const builtInScenarios: readonly Scenario[] = [
  happyPath,
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
