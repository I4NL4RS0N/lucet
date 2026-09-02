import { describe, expect, it } from 'vitest'
import {
  createLucet,
  createManualClock,
  createStore,
  instantScheduler,
  reduce,
  createInitialState,
  describeEvent,
  submitBlocker,
  projectNextTurn,
} from './index.js'

/**
 * The core claims determinism as a structural property. Until now nothing
 * asserted it, which meant the claim rested on the absence of Math.random
 * rather than on evidence.
 */
describe('determinism', () => {
  it('produces an identical event sequence across runs', async () => {
    const run = async () => {
      const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
      await lucet.trigger('tool-partial-failure')
      await lucet.trigger('refusal')
      return lucet.getLog().map((e) => `${e.seq}:${e.event.type}`)
    }
    expect(await run()).toEqual(await run())
  })

  it('generates ids from a counter, not from randomness or wall clock', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('happy-path')
    const turn = lucet.getState().turns[0]
    expect(turn?.id).toBe('turn_1')
    expect(turn?.versionId).toBe('v_1')
  })
})

describe('scenarios chain rather than reset', () => {
  it('appends turns to the same thread', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('tool-partial-failure')
    await lucet.trigger('refusal')
    const { turns } = lucet.getState()
    expect(turns).toHaveLength(2)
    expect(turns[1]?.response?.status).toBe('refused')
  })
})

describe('terminal states are distinct', () => {
  it.each([
    ['refusal', 'refused'],
    ['rate-limit', 'failed'],
    ['interrupted', 'interrupted'],
    ['happy-path', 'complete'],
  ])('%s settles as %s', async (trigger, status) => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger(trigger)
    expect(lucet.getState().turns[0]?.response?.status).toBe(status)
  })

  it('keeps a partial tool call distinct from a failed one', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('tool-partial-failure')
    const tool = lucet.getState().turns[0]?.response?.parts.find((p) => p.kind === 'tool')
    expect(tool && tool.kind === 'tool' && tool.status).toBe('partial')
  })

  it('a tool call carries its receipt: args from the start, result at settle', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('tool-partial-failure')
    const tool = lucet.getState().turns[0]?.response?.parts.find((p) => p.kind === 'tool')
    if (!tool || tool.kind !== 'tool') throw new Error('no tool part')
    expect(tool.args).toContain('"limit": 3')
    expect(tool.result).toContain('"timed_out"')
    expect(tool.detail).toContain('2 of 3')
  })
})

describe('the turn lock', () => {
  it('locks on submit and releases when the response settles', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    const seen: boolean[] = []
    lucet.subscribe((state) => seen.push(state.composer.locked))
    await lucet.trigger('happy-path')
    expect(seen).toContain(true)
    expect(lucet.getState().composer.locked).toBe(false)
  })

  it('queuing lodges the prompt and clears the field; unlock leaves both for the runtime', () => {
    const store = createStore({ id: 't' })
    store.dispatch({ type: 'composer/locked', by: 'ada' })
    store.dispatch({ type: 'composer/changed', text: 'next one' })
    store.dispatch({ type: 'composer/queued', text: 'next one' })
    // Lodged: the field belongs to whatever comes after it.
    expect(store.getState().composer).toMatchObject({ text: '', queued: 'next one' })
    store.dispatch({ type: 'composer/changed', text: 'a newer draft' })
    store.dispatch({ type: 'composer/unlocked' })
    // Unlock does NOT refill the field: the old promotion silently overwrote
    // anything typed after queueing. Sending is the runtime's job.
    expect(store.getState().composer).toMatchObject({
      locked: false,
      queued: 'next one',
      text: 'a newer draft',
    })
  })

  it('KEEPS THE PROMISE: a queued prompt sends itself when the turn frees', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    const first = lucet.submit('first question')
    // Mid-turn: the composer is locked, and a second prompt is queued.
    expect(lucet.getState().composer.locked).toBe(true)
    lucet.store.dispatch({ type: 'composer/queued', text: 'second question' })
    await first
    // Both turns exist; the queued one was taken and sent by the library.
    const turns = lucet.getState().turns
    expect(turns).toHaveLength(2)
    expect(turns[1]?.prompt.parts).toMatchObject([{ kind: 'text', text: 'second question' }])
    expect(lucet.getState().composer.queued).toBeNull()
    expect(lucet.getLog().some((e) => e.event.type === 'composer/dequeued')).toBe(true)
  })

  /** Sleeps forever unless aborted, so a test can stop a run mid-flight. */
  const heldScheduler = {
    sleep: (_ms: number, signal?: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'))
          return
        }
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        })
      }),
  }

  it('hands a queued prompt back to the field when the response is STOPPED', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: heldScheduler })
    const first = lucet.submit('first question')
    lucet.store.dispatch({ type: 'composer/queued', text: 'second question' })
    lucet.abort()
    await first
    // Stop means "I am taking control": nothing fires behind your back, and
    // the unsent prompt is yours again.
    expect(lucet.getState().turns).toHaveLength(1)
    expect(lucet.getState().composer).toMatchObject({ queued: null, text: 'second question' })
  })
})

describe('the reducer is pure', () => {
  it('does not mutate the state it is given', () => {
    const before = createInitialState('t')
    const snapshot = JSON.stringify(before)
    reduce(before, { type: 'composer/changed', text: 'hello' }, { now: 0 })
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('is total over every event type', () => {
    const state = createInitialState('t')
    expect(() => reduce(state, { type: 'thread/reset' }, { now: 0 })).not.toThrow()
    expect(() => reduce(state, { type: 'restore/exited' }, { now: 0 })).not.toThrow()
  })
})

describe('feedback and retry', () => {
  it('feedback lands on the response, toggles, and retracts', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('happy-path')
    const msg = () => lucet.getState().turns[0]?.response
    lucet.store.dispatch({ type: 'feedback/given', messageId: msg()!.id, verdict: 'up' })
    expect(msg()?.feedback).toBe('up')
    lucet.store.dispatch({ type: 'feedback/given', messageId: msg()!.id, verdict: 'down' })
    expect(msg()?.feedback).toBe('down')
    lucet.store.dispatch({ type: 'feedback/given', messageId: msg()!.id, verdict: null })
    expect(msg()?.feedback).toBeNull()
  })

  it('retry is a NEW turn that knows its ancestor: same words, new commit', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('happy-path')
    const first = lucet.getState().turns[0]!
    await lucet.retry(first.id)
    const { turns } = lucet.getState()
    expect(turns).toHaveLength(2)
    const second = turns[1]!
    expect(second.retryOf).toBe(first.id)
    expect(second.versionId).not.toBe(first.versionId)
    const words = (t: typeof first) =>
      t.prompt.parts.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join('\n')
    expect(words(second)).toBe(words(first))
  })

  it('retrying an unknown turn rejects instead of inventing one', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await expect(lucet.retry('nope')).rejects.toThrow('Unknown turn')
  })

  it('retry keeps a scenario recovery promise: the partial failure completes', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('tool-partial-failure')
    const failed = lucet.getState().turns.at(-1)!
    const failedTool = failed.response?.parts.find((p) => p.kind === 'tool')
    expect(failedTool && failedTool.kind === 'tool' ? failedTool.status : null).toBe('partial')

    await lucet.retry(failed.id)
    const { turns } = lucet.getState()
    const recovered = turns.at(-1)!
    expect(recovered.retryOf).toBe(failed.id)
    const tool = recovered.response?.parts.find((p) => p.kind === 'tool')
    expect(tool && tool.kind === 'tool' ? tool.status : null).toBe('succeeded')
    expect(recovered.response?.status).toBe('complete')
    const text = recovered.response?.parts.find((p) => p.kind === 'text')
    expect(text && text.kind === 'text' ? text.text : '').toContain('full picture')

    /* The recovery does not chain: retrying the RECOVERED turn plays
       the generic reply, not the recovery again. */
    await lucet.retry(recovered.id)
    const third = lucet.getState().turns.at(-1)!
    const thirdTool = third.response?.parts.find((p) => p.kind === 'tool')
    expect(thirdTool).toBeUndefined()
  })
})

describe('restore is a copy, never a rollback', () => {
  it('walks back, forward, and back again; the store only grows', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('happy-path')
    const v1 = lucet.getState().turns.at(-1)!
    await lucet.retry(v1.id)
    const v2 = lucet.getState().turns.at(-1)!
    expect(lucet.getState().turns).toHaveLength(2)

    /* Preview touches nothing but the view flag. */
    lucet.store.dispatch({ type: 'restore/entered', turnId: v1.id })
    expect(lucet.getState().restoredFrom).toBe(v1.id)
    expect(lucet.getState().turns).toHaveLength(2)

    /* BACK: commit restores v1 as a new version; nothing is deleted and
       the preview view clears. */
    lucet.restore(v1.id)
    const afterBack = lucet.getState()
    expect(afterBack.restoredFrom).toBeNull()
    expect(afterBack.turns).toHaveLength(3)
    const v3 = afterBack.turns.at(-1)!
    expect(v3.restoreOf).toBe(v1.id)
    expect(v3.retryOf).toBeNull()
    const text = (t: typeof v1) =>
      t.response?.parts.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join('') ?? ''
    expect(text(v3)).toBe(text(v1))
    expect(afterBack.turns.map((t) => t.id)).toContain(v2.id)

    /* FORWARD: the later version is still there and still restorable. */
    lucet.restore(v2.id)
    const afterForward = lucet.getState()
    expect(afterForward.turns).toHaveLength(4)
    expect(afterForward.turns.at(-1)!.restoreOf).toBe(v2.id)
    expect(text(afterForward.turns.at(-1)!)).toBe(text(v2))

    /* BACK AGAIN: every version reachable after every restore. */
    lucet.restore(v1.id)
    const finalState = lucet.getState()
    expect(finalState.turns).toHaveLength(5)
    for (const t of [v1, v2, v3]) {
      expect(finalState.turns.map((x) => x.id)).toContain(t.id)
    }
    /* New ids everywhere on the copy: feedback and announce address the
       new messages, never the source's. */
    const copy = finalState.turns.at(-1)!
    expect(copy.prompt.id).not.toBe(v1.prompt.id)
    expect(copy.response?.id).not.toBe(v1.response?.id)
  })
})

describe('scope control', () => {
  it('the ladder installs, the selection acts, and reset keeps the host config', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('scope-ladder')
    const scope = () => lucet.getState().scope
    expect(scope().levels).toHaveLength(3)
    expect(scope().selectedId).toBe('page')
    lucet.store.dispatch({ type: 'scope/changed', levelId: 'all' })
    expect(scope().selectedId).toBe('all')
    lucet.store.dispatch({ type: 'thread/reset' })
    expect(scope().levels).toHaveLength(3)
    expect(lucet.getState().turns).toHaveLength(0)
  })

  it('the page moves AFTER settle: the ladder follows and the note says so', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('scope-moved')
    const { scope, turns } = lucet.getState()
    expect(turns[0]!.response?.status).toBe('complete')
    expect(scope.movedNote).toContain('Reports review')
    expect(scope.levels[0]?.summary).toContain('Reports review')
    /* Acting on scope settles the note. */
    lucet.store.dispatch({ type: 'scope/changed', levelId: 'page' })
    expect(lucet.getState().scope.movedNote).toBeNull()
  })
})

describe('version marker and restore', () => {
  it('a retryTurn is a NEW commit of the same words, after settle', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('version-history')
    const { turns } = lucet.getState()
    expect(turns).toHaveLength(2)
    expect(turns[1]!.retryOf).toBe(turns[0]!.id)
    expect(turns[1]!.versionId).not.toBe(turns[0]!.versionId)
    const words = (i: number) =>
      turns[i]!.prompt.parts.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join('')
    expect(words(1)).toBe(words(0))
    expect(turns[1]!.response?.status).toBe('complete')
  })

  it('restore enters the past, blocks the composer, and exits clean', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('restore-version')
    const state = lucet.getState()
    expect(state.restoredFrom).toBe(state.turns[0]!.id)
    /* The past does not take new commits — above even the lock. */
    expect(submitBlocker({ ...state, restoredFrom: state.restoredFrom })).toBe('restored')
    lucet.store.dispatch({ type: 'restore/exited' })
    expect(lucet.getState().restoredFrom).toBeNull()
    expect(submitBlocker({ ...lucet.getState() })).not.toBe('restored')
  })
})

describe('citations and sources', () => {
  it('a cited response carries its bibliography, all sources ok', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('cited-response')
    const parts = lucet.getState().turns[0]!.response!.parts
    const sources = parts.find((p) => p.kind === 'sources')
    expect(sources?.kind).toBe('sources')
    if (sources?.kind !== 'sources') return
    expect(sources.sources).toHaveLength(3)
    expect(sources.sources.every((s) => s.status === 'ok' && s.note === null)).toBe(true)
    /* Traceability: the locator in words, the receipt underneath. */
    expect(sources.sources[0]?.detail).toBe('Pages 4\u20136')
    expect(sources.sources[0]?.trace).toContain('passage')
    expect(sources.sources[2]?.trace).toContain('query')
  })

  it('a source ages AFTER the response settles — status and note land, neighbours untouched', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('source-updated')
    const message = lucet.getState().turns[0]!.response!
    expect(message.status).toBe('complete')
    const sources = message.parts.find((p) => p.kind === 'sources')
    if (sources?.kind !== 'sources') throw new Error('no sources part')
    const aged = sources.sources.find((s) => s.id === 'src-q3')
    expect(aged?.status).toBe('stale')
    expect(aged?.note).toContain('Updated after it was cited')
    expect(sources.sources.filter((s) => s.status === 'ok')).toHaveLength(2)
  })

  it('a removed source is marked gone, and the log says so in words', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('source-gone')
    const sources = lucet.getState().turns[0]!.response!.parts.find((p) => p.kind === 'sources')
    if (sources?.kind !== 'sources') throw new Error('no sources part')
    expect(sources.sources.find((s) => s.id === 'src-quote')?.status).toBe('gone')
    const described = lucet.store.getLog()
      .map((entry) => describeEvent(entry.event))
      .filter((line) => line.includes('source'))
    expect(described).toContain('A cited source is no longer available')
  })
})

describe('budget meter', () => {
  it('a turn pays twice: the thread tally and the month move together', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.submit('Hello.')
    const { usage } = lucet.getState()
    expect(usage.threadCostUsd).toBeCloseTo(0.0048, 6)
    expect(usage.monthlySpentUsd).toBeCloseTo(0.0048, 6)
    /* No budget configured: spend accrues, nothing ever blocks. */
    expect(usage.monthlyBudgetUsd).toBeNull()
    expect(submitBlocker({ ...lucet.getState(), usage })).toBe('empty')
  })

  it('the projection prices the NEXT turn from context, draft, and the rate — derived, never stored', () => {
    const state = createInitialState('t', 200_000)
    const heavy = {
      ...state,
      usage: { ...state.usage, contextTokens: 48_400 },
      composer: { ...state.composer, text: 'x'.repeat(400) },
    }
    const p = projectNextTurn(heavy)
    /* 900 overhead + 48,400 window + 100 draft + 600 reply, at $3/MTok. */
    expect(p?.tokens).toBe(50_000)
    expect(p?.costUsd).toBeCloseTo(0.15, 4)
    /* Same state, cheaper model: repricing is a parameter, not a mutation. */
    expect(projectNextTurn(heavy, 'fast')?.costUsd).toBeCloseTo(0.03, 4)
    /* A model the host does not price projects nothing. */
    const unpriced = {
      ...heavy,
      model: { selectedId: 'x', options: [{ id: 'x', label: 'X', note: null, usdPerMTok: null }] },
    }
    expect(projectNextTurn(unpriced)).toBeNull()
  })

  it('the low month: what remains no longer covers the projection, and a cheaper model does', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('budget-low')
    const state = lucet.getState()
    /* The trigger sets the decision up and spends nothing (round 05):
       $9.88 of $10 gone, the draft in the composer, no turn yet. */
    expect(state.usage.monthlySpentUsd).toBeCloseTo(9.88, 4)
    expect(state.turns).toHaveLength(0)
    const remaining = state.usage.monthlyBudgetUsd! - state.usage.monthlySpentUsd
    const onSelected = projectNextTurn(state)!
    expect(onSelected.costUsd).toBeGreaterThan(remaining)
    expect(projectNextTurn(state, 'fast')!.costUsd).toBeLessThanOrEqual(remaining)
    /* Low is a warning, not a wall: the composer still sends the draft. */
    expect(submitBlocker({ ...state, usage: state.usage })).toBeNull()
  })

  it('the month runs out mid-conversation: the crossing turn lands, then the composer stops with words', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('budget-spent')
    const state = lucet.getState()
    /* The turn that crossed the line still completed — the block is for
       the NEXT spend, never a punishment for the last one. */
    expect(state.turns[0]!.response?.status).toBe('complete')
    expect(state.usage.monthlySpentUsd).toBeCloseTo(10.02, 4)
    expect(submitBlocker({ ...state, usage: state.usage })).toBe('budget')
    expect(describeEvent({ type: 'usage/changed', patch: {} })).toBeTypeOf('string')
  })

  it('a new thread empties the window, never the month', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('budget-low')
    lucet.store.dispatch({ type: 'thread/reset' })
    const { usage } = lucet.getState()
    expect(usage.threadTokens).toBe(0)
    expect(usage.contextTokens).toBe(0)
    expect(usage.threadCostUsd).toBe(0)
    expect(usage.monthlyBudgetUsd).toBe(10)
    expect(usage.monthlySpentUsd).toBeCloseTo(9.88, 4)
  })
})

describe('every trigger does what it says (round 05)', () => {
  const fresh = () => createLucet({ clock: createManualClock(0), scheduler: instantScheduler })

  it('Do runs three receipts to completion, then the summary, then the pages it created', async () => {
    const lucet = fresh()
    await lucet.trigger('do-plan')
    const turn = lucet.getState().turns.at(-1)!
    const parts = turn.response!.parts
    const kinds = parts.map((p) => p.kind)
    expect(kinds.slice(0, 3)).toEqual(['tool', 'tool', 'tool'])
    expect(parts.every((p) => p.kind !== 'tool' || p.status === 'succeeded')).toBe(true)
    expect(kinds.indexOf('text')).toBeGreaterThan(kinds.lastIndexOf('tool'))
    const made = parts.find((p) => p.kind === 'sources')
    expect(made && made.kind === 'sources' ? made.label : null).toBe('Created')
    expect(made && made.kind === 'sources' ? made.sources.map((x) => x.title) : []).toEqual(['brief.md', 'checklist.md', 'decisions.md'])
    expect(turn.response!.status).toBe('complete')
    /* The receipts take real time on the real clock: about 2.3 seconds. */
    const ms = lucet.triggers.get('do-plan')!.steps.reduce((sum, s) => sum + (s.type === 'tool' ? s.ms : 0), 0)
    expect(ms).toBeGreaterThanOrEqual(2000)
    expect(ms).toBeLessThanOrEqual(3000)
  })

  it('the fallback is told inline, the control agrees, and Retry on Auto recovers', async () => {
    const lucet = fresh()
    await lucet.trigger('degraded-model')
    const state = lucet.getState()
    expect(state.model.selectedId).toBe('fast')
    const turn = state.turns.at(-1)!
    const parts = turn.response!.parts
    const notice = parts.find((p) => p.kind === 'notice')
    expect(notice && notice.kind === 'notice' ? notice.state : null).toBe('degraded')
    expect(notice && notice.kind === 'notice' ? notice.tone : null).toBe('info')
    expect(notice && notice.kind === 'notice' ? notice.label : '').toBe('Using Fast instead of Auto.')
    expect(notice && notice.kind === 'notice' ? notice.text : '').toMatch(/^Auto is temporarily unavailable/)
    expect(parts.findIndex((p) => p.kind === 'notice')).toBeLessThan(parts.findIndex((p) => p.kind === 'text'))
    const action = notice && notice.kind === 'notice' ? notice.action : null
    expect(action).toEqual({ label: 'Retry on Auto', kind: 'retry-on-model', modelId: 'auto', turnId: turn.id })
    lucet.store.dispatch({ type: 'model/changed', modelId: action!.modelId })
    await lucet.retry(action!.turnId)
    const after = lucet.getState()
    expect(after.turns).toHaveLength(2)
    expect(after.turns.at(-1)!.retryOf).toBe(turn.id)
    expect(after.model.selectedId).toBe('auto')
    expect(after.service.status).toBe('operational')
  })

  it('while Ada holds the turn, a queued prompt waits and sends itself when her turn lands', async () => {
    const lucet = fresh()
    const run = lucet.trigger('multiplayer')
    expect(lucet.getState().composer.locked).toBe(true)
    expect(lucet.getState().composer.lockedBy).toBe('Ada')
    lucet.store.dispatch({ type: 'composer/changed', text: 'And the southern site?' })
    lucet.store.dispatch({ type: 'composer/queued', text: 'And the southern site?' })
    expect(lucet.inspect().queued).toBe('And the southern site?')
    await run
    const state = lucet.getState()
    expect(state.turns).toHaveLength(2)
    expect(state.turns[0]!.prompt.authorId).toBe('Ada')
    expect(state.turns[1]!.prompt.authorId).toBe('you')
    expect(state.composer.queued).toBeNull()
    expect(state.composer.locked).toBe(false)
  })

  it('the budget caution sets up the decision and spends nothing until the person sends, on the model they chose', async () => {
    const lucet = fresh()
    await lucet.trigger('budget-low')
    const before = lucet.getState()
    expect(before.turns).toHaveLength(0)
    expect(before.composer.text).toBe('Compare the two proposals and recommend one.')
    expect(before.usage.monthlySpentUsd).toBeCloseTo(9.88, 4)
    expect(lucet.inspect().pendingReply).toBe('budget-low')
    const remaining = before.usage.monthlyBudgetUsd! - before.usage.monthlySpentUsd
    expect(projectNextTurn(before)!.costUsd).toBeGreaterThan(remaining)
    expect(projectNextTurn(before, 'fast')!.costUsd).toBeLessThanOrEqual(remaining)
    lucet.store.dispatch({ type: 'model/changed', modelId: 'fast' })
    await lucet.submit(before.composer.text)
    const after = lucet.getState()
    expect(after.turns).toHaveLength(1)
    expect(after.turns[0]!.response!.status).toBe('complete')
    expect(after.turns[0]!.response!.parts.some((p) => p.kind === 'text' && /second proposal/i.test(p.text))).toBe(true)
    /* The whole window at Fast's rate — 46,000 of context plus 2,400 — not Auto's. */
    expect(after.usage.threadCostUsd - before.usage.threadCostUsd).toBeCloseTo(((46_000 + 2_400) / 1_000_000) * 0.6, 3)
    expect(lucet.inspect().pendingReply).toBeNull()
  })

  it('the restore trigger lands straight in the preview and never duplicates version blocks', async () => {
    const lucet = fresh()
    const logBefore = lucet.getLog().length
    await lucet.trigger('restore-version')
    const events = lucet.getLog().slice(logBefore).map((e) => e.event.type)
    expect(events).not.toContain('part/delta')
    const state = lucet.getState()
    expect(state.turns).toHaveLength(2)
    expect(state.restoredFrom).toBe(state.turns[0]!.id)
    lucet.store.dispatch({ type: 'restore/exited' })
    await lucet.trigger('restore-version')
    expect(lucet.getState().turns).toHaveLength(2)
    expect(lucet.getState().restoredFrom).toBe(state.turns[0]!.id)
  })

  it('Reset cancels timers, clears the queue and the pending reply, and unlocks', async () => {
    const lucet = createLucet({ clock: createManualClock(0) })
    const run = lucet.trigger('multiplayer')
    lucet.store.dispatch({ type: 'composer/queued', text: 'later' })
    lucet.reset()
    await run.catch(() => undefined)
    await lucet.trigger('budget-low')
    lucet.reset()
    expect(lucet.inspect()).toEqual({ pendingTimers: 0, running: false, pendingReply: null, queued: null, locked: false, scheduledRetries: 0 })
    expect(lucet.getState().turns).toHaveLength(0)
    expect(lucet.getState().composer.text).toBe('')
  })
})

describe('every ending gets its own exit (round 05, P1)', () => {
  const fresh = () => createLucet({ clock: createManualClock(1_000_000), scheduler: instantScheduler })
  const last = (lucet: ReturnType<typeof createLucet>) => lucet.getState().turns.at(-1)!

  it('a refusal shows the proposed deletions as rows and deletes nothing; it stays a refusal', async () => {
    const lucet = fresh()
    await lucet.trigger('refusal')
    const before = last(lucet)
    expect(before.response!.recovery).toMatchObject({ label: 'Show proposed deletions', mode: 'resume' })
    await lucet.recover(before.id)
    const after = last(lucet)
    expect(lucet.getState().turns).toHaveLength(1)
    expect(after.response!.status).toBe('refused')
    expect(after.response!.reason).toBe(before.response!.reason)
    expect(after.response!.parts.map((p) => p.kind)).toEqual(['tool', 'sources', 'text'])
    const rows = after.response!.parts.find((p) => p.kind === 'sources')
    expect(rows && rows.kind === 'sources' ? rows.label : null).toBe('Proposed deletions')
    expect(after.response!.recovery).toBeNull()
  })

  it('low confidence checks its sources without re-asking', async () => {
    const lucet = fresh()
    await lucet.trigger('low-confidence')
    expect(last(lucet).response!.recovery?.label).toBe('Check sources')
    await lucet.recover(last(lucet).id)
    expect(lucet.getState().turns).toHaveLength(1)
    expect(last(lucet).response!.parts.map((p) => p.kind)).toEqual(['text', 'tool', 'sources', 'text'])
    expect(last(lucet).response!.status).toBe('complete')
  })

  it('a partial tool failure retries only the missing source, as a new turn', async () => {
    const lucet = fresh()
    await lucet.trigger('tool-partial-failure')
    const first = last(lucet)
    expect(first.response!.recovery).toMatchObject({ label: 'Retry missing source', icon: 'retry-one', mode: 'retry' })
    await lucet.recover(first.id)
    expect(lucet.getState().turns).toHaveLength(2)
    expect(last(lucet).retryOf).toBe(first.id)
    const tool = last(lucet).response!.parts.find((p) => p.kind === 'tool')
    expect(tool && tool.kind === 'tool' ? tool.name : null).toBe('Retried the carrier quote')
  })

  it('an interrupted response continues from where it stopped, in the same message', async () => {
    const lucet = fresh()
    await lucet.trigger('interrupted')
    const before = last(lucet)
    const partial = before.response!.parts[0]
    expect(before.response!.status).toBe('interrupted')
    expect(before.response!.recovery).toMatchObject({ label: 'Continue response', icon: 'continue', mode: 'resume' })
    await lucet.recover(before.id)
    expect(lucet.getState().turns).toHaveLength(1)
    const after = last(lucet).response!
    expect(after.status).toBe('complete')
    expect(after.parts).toHaveLength(1)
    const text = after.parts[0]!.kind === 'text' ? after.parts[0]!.text : ''
    expect(text.startsWith(partial && partial.kind === 'text' ? partial.text : '?')).toBe(true)
    expect(text).toMatch(/Previously that step was applied once per file/)
  })

  it('a rate limit shows its reset time and arms a retry for that moment; the draft stays', async () => {
    const lucet = fresh()
    await lucet.trigger('rate-limit')
    /* The person types while limited; the scheduled retry must not touch it. */
    lucet.store.dispatch({ type: 'composer/changed', text: 'a draft in progress' })
    const first = last(lucet)
    expect(first.response!.recovery).toMatchObject({ label: 'Retry when it resets', mode: 'retry-at', at: 1_000_000 + 30_000 })
    const armed = lucet.recover(first.id)
    expect(lucet.getState().turns.at(-1)!.response!.recovery?.scheduledAt).toBe(1_030_000)
    await armed
    expect(lucet.getState().turns).toHaveLength(2)
    expect(last(lucet).retryOf).toBe(first.id)
    expect(last(lucet).response!.status).toBe('complete')
    expect(lucet.getState().composer.text).toBe('a draft in progress')
    expect(lucet.inspect().scheduledRetries).toBe(0)
  })

  it('an outage retries the connection; the strip and the ending share no words', async () => {
    const lucet = fresh()
    await lucet.trigger('service-down')
    const first = last(lucet)
    expect(lucet.getState().service.status).toBe('down')
    expect(first.response!.recovery).toMatchObject({ label: 'Retry connection', mode: 'retry' })
    const words = (t: string) => new Set(t.toLowerCase().match(/[a-z]{5,}/g) ?? [])
    const strip = words(lucet.getState().service.message ?? '')
    const ending = words(first.response!.reason ?? '')
    expect([...strip].filter((w) => ending.has(w))).toEqual([])
    await lucet.recover(first.id)
    expect(lucet.getState().service.status).toBe('operational')
    expect(last(lucet).retryOf).toBe(first.id)
    expect(last(lucet).response!.status).toBe('complete')
  })

  it('a spent month says exactly when it resets', async () => {
    const lucet = fresh()
    await lucet.trigger('budget-spent')
    const { usage } = lucet.getState()
    expect(usage.monthlyResetAt).toBe(1_000_000 + 2 * 24 * 3_600_000 + 5 * 3_600_000)
    expect(submitBlocker({ ...lucet.getState(), usage })).toBe('budget')
    expect(last(lucet).response!.recovery).toBeNull()
  })

  it('a stale result refreshes through the runtime and the receipt says how fresh', async () => {
    const lucet = fresh()
    await lucet.trigger('stale-data')
    expect(last(lucet).response!.recovery?.label).toBe('Refresh result')
    await lucet.recover(last(lucet).id)
    const tools = last(lucet).response!.parts.filter((p) => p.kind === 'tool')
    expect(tools).toHaveLength(2)
    expect(tools[1]!.kind === 'tool' ? tools[1]!.detail : null).toBe('Fresh — fetched just now')
    expect(last(lucet).response!.status).toBe('complete')
  })

  it('an updated source is re-checked and its flag clears', async () => {
    const lucet = fresh()
    await lucet.trigger('source-updated')
    const sourcesOf = () => { const p = last(lucet).response!.parts.find((x) => x.kind === 'sources'); return p && p.kind === 'sources' ? p.sources : [] }
    expect(sourcesOf().find((x) => x.id === 'src-q3')?.status).toBe('stale')
    expect(last(lucet).response!.recovery?.label).toBe('Re-check answer')
    await lucet.recover(last(lucet).id)
    expect(sourcesOf().find((x) => x.id === 'src-q3')).toMatchObject({ status: 'ok', note: null })
  })

  it('a removed source is replaced in place', async () => {
    const lucet = fresh()
    await lucet.trigger('source-gone')
    const sourcesOf = () => { const p = last(lucet).response!.parts.find((x) => x.kind === 'sources'); return p && p.kind === 'sources' ? p.sources : [] }
    expect(sourcesOf().find((x) => x.id === 'src-quote')?.status).toBe('gone')
    expect(last(lucet).response!.recovery?.label).toBe('Replace source')
    await lucet.recover(last(lucet).id)
    expect(sourcesOf().some((x) => x.id === 'src-quote')).toBe(false)
    expect(sourcesOf().find((x) => x.id === 'src-quote-archive')).toMatchObject({ status: 'ok', note: null, title: 'Vendor quote (archived copy)' })
    expect(sourcesOf()).toHaveLength(3)
  })

  it('a complete answer with no verb keeps "Ask again", and Reset cancels an armed retry', async () => {
    const instant = fresh()
    await instant.trigger('happy-path')
    expect(last(instant).response!.recovery).toBeNull()
    const lucet = createLucet({ clock: createManualClock(0) })
    await lucet.trigger('rate-limit')
    const armed = lucet.recover(last(lucet).id)
    expect(lucet.inspect().scheduledRetries).toBe(1)
    lucet.reset()
    await armed
    expect(lucet.inspect()).toMatchObject({ scheduledRetries: 0, pendingTimers: 0, running: false })
    expect(lucet.getState().turns).toHaveLength(0)
  })
})
