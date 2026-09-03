import { describe, expect, it } from 'vitest'
import type { Scheduler, ToolPart } from './index.js'
import { scopeDisplay,
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

  it('the page moves AFTER settle: with nothing typed the ladder follows and says so; with a draft the move is held', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('scope-moved')
    const { scope, turns, composer } = lucet.getState()
    expect(turns[0]!.response?.status).toBe('complete')
    /* The first move found an empty field: it applied, and said so. */
    expect(scope.movedNote).toContain('Reports review')
    expect(scope.levels[0]?.summary).toContain('Reports review')
    /* The second found a draft: HELD, ladder unchanged, the choice open. */
    expect(composer.text).not.toBe('')
    expect(scope.pending?.note).toContain('Vendor call')
    expect(scope.pending?.levels[0]?.summary).toContain('Vendor call')
    /* Acting on scope settles the note and the held move alike. */
    lucet.store.dispatch({ type: 'scope/changed', levelId: 'page' })
    expect(lucet.getState().scope.movedNote).toBeNull()
    expect(lucet.getState().scope.pending).toBeNull()
    expect(lucet.getState().scope.levels[0]?.summary).toContain('Reports review')
  })

  it('Use new page applies the held move; Keep previous page drops it; a new thread applies it', async () => {
    const run = async () => {
      const l = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
      await l.trigger('scope-moved')
      return l
    }
    const accepted = await run()
    accepted.store.dispatch({ type: 'scope/updateAccepted' })
    expect(accepted.getState().scope.pending).toBeNull()
    expect(accepted.getState().scope.levels[0]?.summary).toContain('Vendor call')
    expect(accepted.getState().scope.movedNote).toContain('Vendor call')
    expect(describeEvent({ type: 'scope/updateAccepted' })).toBe('Scope updated to the new page')
    const declined = await run()
    declined.store.dispatch({ type: 'scope/updateDeclined' })
    expect(declined.getState().scope.pending).toBeNull()
    expect(declined.getState().scope.levels[0]?.summary).toContain('Reports review')
    expect(declined.getState().composer.text).not.toBe('')
    expect(describeEvent({ type: 'scope/updateDeclined' })).toBe('Scope kept on the previous page')
    const fresh = await run()
    fresh.reset()
    expect(fresh.getState().scope.pending).toBeNull()
    expect(fresh.getState().scope.levels[0]?.summary).toContain('Vendor call')
    expect(fresh.getState().scope.movedNote).toBeNull()
  })

  it('only a changed boundary is news: a wider scope rides through page navigation with no note and no decision', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('scope-ladder')
    lucet.store.dispatch({ type: 'scope/changed', levelId: 'all' })
    lucet.store.dispatch({ type: 'composer/changed', text: 'List every open risk.' })
    const moved = lucet.getState().scope.levels.map((l) =>
      l.id === 'page' ? { ...l, name: 'Reports review', summary: 'Reports review — the summary and its 2 appendices', itemCount: 3 } : l,
    )
    lucet.store.dispatch({ type: 'scope/moved', levels: moved, selectedId: 'all', note: 'Scope updated to Reports review.', pageName: 'Reports review' })
    const { scope, composer } = lucet.getState()
    /* The ladder updated underneath; the selected boundary did not, so
       nothing is asked and nothing is announced. */
    expect(scope.selectedId).toBe('all')
    expect(scope.levels[0]?.summary).toContain('Reports review')
    expect(scope.pending).toBeNull()
    expect(scope.movedNote).toBeNull()
    expect(composer.text).toBe('List every open risk.')
  })

  it('the page on screen, chosen from the picker, comes into force in one step; matching pages read as This page', async () => {
    /* Matching: the ladder in force is the page's own. */
    const plain = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await plain.trigger('scope-ladder')
    const before = scopeDisplay(plain.getState().scope)!
    expect(before.divergent).toBe(false)
    expect(before.label).toBe('This page')
    expect(before.name).toBe('Scope: This page — Quarterly planning — the plan and its 4 linked notes')
    expect(before.rows.map((r) => r.label)).toEqual(['This page', 'Plans', 'All of Aquilo'])
    /* Held, then kept: divergent by construction while the pages differ. */
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('scope-moved')
    expect(scopeDisplay(lucet.getState().scope)!.divergent).toBe(true)
    lucet.store.dispatch({ type: 'scope/updateDeclined' })
    expect(scopeDisplay(lucet.getState().scope)!.divergent).toBe(true)
    /* Rebind: the ladder on screen, at the named rung; the note says so;
       the draft is untouched and nothing was sent. */
    const sends = lucet.getLog().filter((e) => e.event.type === 'turn/submitted').length
    lucet.store.dispatch({ type: 'scope/rebound', levelId: 'page' })
    const after = lucet.getState()
    expect(after.scope.onScreen).toBeNull()
    expect(after.scope.selectedId).toBe('page')
    expect(after.scope.levels[0]?.name).toBe('Vendor call')
    expect(after.scope.movedNote).toBe('Scope updated to Vendor call.')
    expect(scopeDisplay(after.scope)!.label).toBe('This page')
    expect(after.composer.text).toBe('Summarise what changed in the review for the vendor.')
    expect(lucet.getLog().filter((e) => e.event.type === 'turn/submitted').length).toBe(sends)
    /* A wider scope never diverges: no row is added and it stays named. */
    lucet.store.dispatch({ type: 'scope/changed', levelId: 'all' })
    lucet.store.dispatch({ type: 'scope/moved', levels: after.scope.levels.map((l) => (l.id === 'page' ? { ...l, name: 'Quarterly planning', summary: 'Quarterly planning — the plan and its 4 linked notes', itemCount: 5 } : l)), selectedId: 'all', note: 'Scope updated to Quarterly planning.', pageName: 'Quarterly planning' })
    const wide = scopeDisplay(lucet.getState().scope)!
    expect(wide.divergent).toBe(false)
    expect(wide.label).toBe('All of Aquilo')
    expect(wide.rows).toHaveLength(3)
  })

  it('a kept scope follows the page once the field is empty — after a fresh send, and on a new thread', async () => {
    const run = async () => {
      const l = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
      await l.trigger('scope-moved')
      l.store.dispatch({ type: 'scope/updateDeclined' })
      return l
    }
    const sent = await run()
    await sent.submit(sent.getState().composer.text)
    expect(sent.getState().scope.onScreen).toBeNull()
    expect(sent.getState().scope.levels[0]?.name).toBe('Vendor call')
    expect(sent.getState().scope.movedNote).toBe('Scope updated to Vendor call.')
    const fresh = await run()
    fresh.reset()
    expect(fresh.getState().scope.onScreen).toBeNull()
    expect(fresh.getState().scope.levels[0]?.name).toBe('Vendor call')
  })

  it('the decision names both pages, keeping says so, and a fresh send lets the held move apply', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('scope-moved')
    const held = lucet.getState().scope
    expect(held.pending?.pageName).toBe('Vendor call')
    expect(held.levels.find((l) => l.id === held.selectedId)?.name).toBe('Reports review')
    expect(held.pending?.levels.find((l) => l.id === held.pending?.selectedId)?.name).toBe('Vendor call')
    /* Keep: the ladder stays, and the outcome is said in words. */
    lucet.store.dispatch({ type: 'scope/updateDeclined' })
    expect(lucet.getState().scope.movedNote).toBe('Scope remains on Reports review.')
    expect(lucet.getState().scope.levels[0]?.summary).toContain('Reports review')
    /* The state keeps the ladder on screen (Vendor call) while the scope stays
       on Reports review: the display names the pinned page and offers the
       page on screen as the first row — one model for chip, name and rows. */
    const kept = lucet.getState().scope
    expect(kept.onScreen?.[0]?.name).toBe('Vendor call')
    const shown = scopeDisplay(kept)!
    expect(shown.divergent).toBe(true)
    expect(shown.label).toBe('Reports review')
    expect(shown.name).toBe('Scope: Reports review — the summary and its 2 appendices')
    expect(shown.rows[0]).toMatchObject({ label: 'This page', onScreen: true, selected: false, count: 2 })
    expect(shown.rows[0]?.secondary).toContain('Vendor call')
    expect(shown.rows[1]).toMatchObject({ label: 'Reports review', selected: true, onScreen: false })
    expect(shown.rows[1]?.secondary).toBe('Previously selected page · the summary and its 2 appendices')
    expect(shown.rows.map((r) => r.label)).toEqual(['This page', 'Reports review', 'Reports', 'All of Aquilo'])
    /* Held again, then sent: the words go against the kept scope, and the
       move applies behind them because the field is empty now. */
    lucet.store.dispatch({ type: 'scope/moved', levels: held.pending!.levels, selectedId: 'page', note: 'Scope updated to Vendor call.', pageName: 'Vendor call' })
    expect(lucet.getState().scope.pending).not.toBeNull()
    await lucet.submit(lucet.getState().composer.text)
    const after = lucet.getState()
    expect(after.turns.at(-1)?.prompt.parts[0]).toMatchObject({ kind: 'text', text: 'Summarise what changed in the review for the vendor.' })
    expect(after.scope.pending).toBeNull()
    expect(after.scope.levels[0]?.summary).toContain('Vendor call')
    expect(after.scope.movedNote).toBe('Scope updated to Vendor call.')
  })

  it('an empty field never holds: the same move applies at once, and only a draft holds the next', () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    const levels = [{ id: 'page', label: 'This page', summary: 'Somewhere else', itemCount: 1 }]
    lucet.store.dispatch({ type: 'scope/moved', levels, selectedId: 'page', note: 'Moved.' })
    expect(lucet.getState().scope.pending).toBeNull()
    expect(lucet.getState().scope.levels[0]?.summary).toBe('Somewhere else')
    lucet.store.dispatch({ type: 'composer/changed', text: 'a draft' })
    lucet.store.dispatch({ type: 'scope/moved', levels: [{ ...levels[0]!, summary: 'A third page' }], selectedId: 'page', note: 'Moved again.' })
    expect(lucet.getState().scope.levels[0]?.summary).toBe('Somewhere else')
    expect(lucet.getState().scope.pending?.levels[0]?.summary).toBe('A third page')
    expect(describeEvent({ type: 'scope/moved', levels, selectedId: 'page', note: 'x' })).toBe('The page changed under the scope')
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

  it('a running turn is never stopped for cost: the ledger crosses mid-turn, the response still lands whole', async () => {
    /* THE RULE (component audit 03): the projection was on the trigger
       before the send, so a turn in flight was consented to at its price.
       Nothing about it changes when the month crosses — the ledger
       updates, the words keep arriving, and the NEXT send meets the wall.
       Aborting for cost would throw away work already paid for. */
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('budget-spent')
    const log = lucet.getLog().map((entry) => entry.event)
    const crossedAt = log.findIndex(
      (e) => e.type === 'usage/changed' && (e.patch.monthlySpentUsd ?? 0) >= 10,
    )
    const settledAt = log.findIndex((e) => e.type === 'response/settled')
    /* The crossing happened while the response was still open... */
    expect(crossedAt).toBeGreaterThan(-1)
    expect(crossedAt).toBeLessThan(settledAt)
    /* ...and the response settled complete, once, with its words intact. */
    const settles = log.filter((e) => e.type === 'response/settled')
    expect(settles).toHaveLength(1)
    expect(settles[0]).toMatchObject({ status: 'complete' })
    expect(log.some((e) => e.type === 'budget/intercepted')).toBe(false)
    const state = lucet.getState()
    expect(state.turns[0]!.response?.status).toBe('complete')
    expect(state.turns[0]!.response?.parts.some((p) => p.kind === 'text' && p.text.length > 40)).toBe(true)
    /* The wall is for the next spend. */
    expect(submitBlocker({ ...state, usage: state.usage })).toBe('budget')
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

  it('a spent month follows into the new thread, reset time and all — a new thread is not a refund', async () => {
    /* THE RULE (component audit 03, independent verification): the cap is
       the account's. Starting a new thread empties the window and the
       thread's tally; the month, its wall, and the moment it lifts all
       carry over. Only a host's own ledger — or the demo's Reset — can
       give the month back. */
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    await lucet.trigger('budget-spent')
    const before = lucet.getState().usage
    expect(before.monthlyResetAt).not.toBeNull()
    lucet.reset()
    const after = lucet.getState()
    expect(after.turns).toHaveLength(0)
    expect(after.usage.threadCostUsd).toBe(0)
    expect(after.usage.monthlyBudgetUsd).toBe(before.monthlyBudgetUsd)
    expect(after.usage.monthlySpentUsd).toBeCloseTo(before.monthlySpentUsd, 6)
    expect(after.usage.monthlyResetAt).toBe(before.monthlyResetAt)
    expect(submitBlocker({ ...after, usage: after.usage })).toBe('budget')
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
    /* The receipts take real time on the real clock: about a second and a
       half as a staged group (round 06), roughly half a second each. */
    const ms = lucet.triggers.get('do-plan')!.steps.reduce(
      (sum, s) => sum + (s.type === 'tools' ? s.items.reduce((a, i) => a + i.ms, 0) : s.type === 'tool' ? s.ms : 0),
      0,
    )
    expect(ms).toBeGreaterThanOrEqual(1300)
    expect(ms).toBeLessThanOrEqual(1800)
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

  it('while Jennifer holds the turn, a queued prompt waits and sends itself when her turn lands', async () => {
    const lucet = fresh()
    const run = lucet.trigger('multiplayer')
    expect(lucet.getState().composer.locked).toBe(true)
    expect(lucet.getState().composer.lockedBy).toBe('Jennifer Lee')
    lucet.store.dispatch({ type: 'composer/changed', text: 'And the southern site?' })
    lucet.store.dispatch({ type: 'composer/queued', text: 'And the southern site?' })
    expect(lucet.inspect().queued).toBe('And the southern site?')
    await run
    const state = lucet.getState()
    expect(state.turns).toHaveLength(2)
    expect(state.turns[0]!.prompt.authorId).toBe('Jennifer Lee')
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
    expect(last(lucet).response!.parts.map((p) => p.kind)).toEqual(['notice', 'text', 'tool', 'sources', 'text'])
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

/* A scheduler the test releases one sleep at a time, so a sequence can be
   read mid-way: what is pending, what is running, what has not begun. */
function stepper() {
  const waiting: Array<() => void> = []
  const scheduler: Scheduler = {
    sleep: (_ms, signal) =>
      new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('aborted'))
          return
        }
        const done = () => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        }
        /* An aborted sleep leaves the queue too: what Reset cancelled is
           no longer pending anywhere. */
        const onAbort = () => {
          const i = waiting.indexOf(done)
          if (i >= 0) waiting.splice(i, 1)
          reject(new Error('aborted'))
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        waiting.push(done)
      }),
  }
  const tick = () => new Promise<void>((r) => setTimeout(r, 0))
  const release = async () => {
    waiting.shift()?.()
    await tick()
  }
  return { scheduler, release, tick, pending: () => waiting.length }
}

describe('the hold at the threshold, and staged receipts (round 06)', () => {
  const fresh = () => createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
  const eventTypes = (lucet: ReturnType<typeof createLucet>) =>
    lucet.getLog().map((entry) => (entry as unknown as { event: { type: string } }).event.type)

  it('the first Send over the month holds instead of sending; letting go keeps the draft', async () => {
    const lucet = fresh()
    await lucet.trigger('budget-low')
    const draft = lucet.getState().composer.text
    expect(draft).not.toBe('')
    await lucet.submit(draft)
    const held = lucet.getState()
    expect(held.turns).toHaveLength(0)
    expect(held.composer.intercept).toMatchObject({ text: draft })
    expect(held.composer.intercept!.costUsd).toBeGreaterThan(held.composer.intercept!.remainingUsd)
    expect(eventTypes(lucet).at(-1)).toBe('budget/intercepted')
    /* Nothing was spent and the pre-send reply still waits for the real send. */
    expect(lucet.inspect().pendingReply).toBe('budget-low')
    expect(lucet.inspect().running).toBe(false)
    lucet.dismissIntercept()
    const released = lucet.getState()
    expect(released.composer.intercept).toBeNull()
    expect(released.composer.text).toBe(draft)
    expect(released.turns).toHaveLength(0)
    expect(eventTypes(lucet).at(-1)).toBe('budget/released')
    /* Pressing Send again holds again: the threshold is never crossed by repetition. */
    await lucet.submit(draft)
    expect(lucet.getState().turns).toHaveLength(0)
    expect(lucet.getState().composer.intercept).not.toBeNull()
  })

  it('Continue sends the held words on the chosen model, and the pre-send reply plays', async () => {
    const lucet = fresh()
    await lucet.trigger('budget-low')
    const draft = lucet.getState().composer.text
    await lucet.submit(draft)
    expect(lucet.getState().composer.intercept).not.toBeNull()
    await lucet.confirmSpend()
    const s = lucet.getState()
    expect(s.turns).toHaveLength(1)
    expect(s.turns[0]!.prompt.parts[0]).toMatchObject({ kind: 'text', text: draft })
    expect(s.model.selectedId).toBe('auto')
    expect(s.composer.intercept).toBeNull()
    expect(s.composer.text).toBe('')
    expect(s.turns[0]!.response!.status).toBe('complete')
    expect(lucet.inspect().pendingReply).toBeNull()
  })

  it('the cheaper model releases the hold, and the next Send goes through within the month', async () => {
    const lucet = fresh()
    await lucet.trigger('budget-low')
    const draft = lucet.getState().composer.text
    await lucet.submit(draft)
    expect(lucet.getState().composer.intercept).not.toBeNull()
    lucet.store.dispatch({ type: 'model/changed', modelId: 'fast' })
    expect(lucet.getState().composer.intercept).toBeNull()
    await lucet.submit(draft)
    const s = lucet.getState()
    expect(s.turns).toHaveLength(1)
    expect(s.model.selectedId).toBe('fast')
    expect(s.composer.intercept).toBeNull()
    expect(eventTypes(lucet).filter((t) => t === 'budget/intercepted')).toHaveLength(1)
  })

  it('a queued prompt that would cross the month comes back to the field under the hold, never sent behind your back', async () => {
    const { scheduler, release, tick } = stepper()
    const lucet = createLucet({ clock: createManualClock(0), scheduler })
    lucet.store.dispatch({
      type: 'usage/changed',
      patch: { monthlyBudgetUsd: 10, monthlySpentUsd: 9.95, contextTokens: 46_000 },
    })
    const ada = lucet.trigger('multiplayer')
    await tick()
    expect(lucet.getState().composer.locked).toBe(true)
    lucet.store.dispatch({ type: 'composer/queued', text: 'And the southern site, in full detail?' })
    let done = false
    void ada.then(() => {
      done = true
    })
    for (let i = 0; i < 200 && !done; i++) await release()
    expect(done).toBe(true)
    const s = lucet.getState()
    expect(s.turns).toHaveLength(1)
    expect(s.turns[0]!.prompt.authorId).toBe('Jennifer Lee')
    expect(s.composer.queued).toBeNull()
    expect(s.composer.locked).toBe(false)
    expect(s.composer.text).toBe('And the southern site, in full detail?')
    expect(s.composer.intercept).toMatchObject({ text: 'And the southern site, in full detail?' })
  })

  it('Reset lets the hold go with everything else', async () => {
    const lucet = fresh()
    await lucet.trigger('budget-low')
    await lucet.submit(lucet.getState().composer.text)
    expect(lucet.getState().composer.intercept).not.toBeNull()
    lucet.reset()
    expect(lucet.getState().composer.intercept).toBeNull()
    expect(lucet.getState().turns).toHaveLength(0)
    expect(lucet.inspect()).toEqual({ pendingTimers: 0, running: false, pendingReply: null, queued: null, locked: false, scheduledRetries: 0 })
  })

  it('Do stages its receipts: all pending at once, one running at a time, the answer after the last', async () => {
    const { scheduler, release, tick } = stepper()
    const lucet = createLucet({ clock: createManualClock(0), scheduler })
    const run = lucet.trigger('do-plan')
    let done = false
    void run.then(() => {
      done = true
    })
    const tools = () =>
      (lucet.getState().turns.at(-1)?.response?.parts ?? [])
        .filter((p): p is ToolPart => p.kind === 'tool')
        .map((p) => p.status)
    const texts = () => (lucet.getState().turns.at(-1)?.response?.parts ?? []).filter((p) => p.kind === 'text')
    await tick()
    /* The opening latency precedes the group: nothing has entered yet. */
    expect(tools()).toEqual([])
    await release()
    /* One frame later every receipt is present — the first running, the rest waiting. */
    expect(tools()).toEqual(['running', 'pending', 'pending'])
    expect(texts()).toHaveLength(0)
    await release()
    expect(tools()).toEqual(['succeeded', 'running', 'pending'])
    expect(texts()).toHaveLength(0)
    await release()
    expect(tools()).toEqual(['succeeded', 'succeeded', 'running'])
    expect(texts()).toHaveLength(0)
    await release()
    expect(tools()).toEqual(['succeeded', 'succeeded', 'succeeded'])
    for (let i = 0; i < 400 && !done; i++) await release()
    expect(done).toBe(true)
    const response = lucet.getState().turns.at(-1)!.response!
    expect(response.status).toBe('complete')
    const kinds = response.parts.map((p) => p.kind)
    expect(kinds.indexOf('text')).toBe(3)
    expect(eventTypes(lucet).filter((t) => t === 'tool/started')).toHaveLength(3)
    expect(describeEvent({ type: 'tool/started', messageId: 'm', partId: 'p' })).toBe('Tool started')
  })

  it('Reset mid-group cancels what remains', async () => {
    const { scheduler, release, tick, pending } = stepper()
    const lucet = createLucet({ clock: createManualClock(0), scheduler })
    void lucet.trigger('do-plan').catch(() => undefined)
    await tick()
    await release()
    expect(lucet.getState().turns.at(-1)!.response!.parts.filter((p) => p.kind === 'tool')).toHaveLength(3)
    lucet.reset()
    await tick()
    expect(lucet.getState().turns).toHaveLength(0)
    expect(pending()).toBe(0)
    expect(lucet.inspect().running).toBe(false)
  })
})

describe('language, the scope-freeze rule, metadata, severity (round 05, P2)', () => {
  const fresh = () => createLucet({ clock: createManualClock(0), scheduler: instantScheduler })

  it('a rate limit ends in caution: failed as status, caution as tone; an outage keeps the red', async () => {
    const lucet = fresh()
    await lucet.trigger('rate-limit')
    const limited = lucet.getState().turns[0]!.response!
    expect(limited.status).toBe('failed')
    expect(limited.tone).toBe('caution')
    await lucet.trigger('service-down')
    const outage = lucet.getState().turns[1]!.response!
    expect(outage.status).toBe('failed')
    expect(outage.tone).toBeNull()
  })

  it('the uncertain answer carries one quiet word before it: Unverified, neutral, no percentage', async () => {
    const lucet = fresh()
    await lucet.trigger('low-confidence')
    const parts = lucet.getState().turns[0]!.response!.parts
    expect(parts[0]).toMatchObject({ kind: 'notice', state: 'uncertain', tone: 'neutral', label: 'Unverified', text: '' })
    expect(parts[1]?.kind).toBe('text')
    expect(parts.some((p) => p.kind === 'text' && /%/.test(p.text))).toBe(false)
  })

  it('the rail speaks the new names', () => {
    const lucet = fresh()
    expect(lucet.triggers.get('scope-ladder')?.label).toBe('Use the current page as context')
    expect(lucet.triggers.get('scope-moved')?.label).toBe('Scope updates after navigation')
  })
})

describe('ownership (component audit 06)', () => {
  const adaRunning = async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    /* Jennifer's turn: run it without awaiting, queue behind it. The instant
       scheduler still yields between steps, so the run is in flight here. */
    const run = lucet.trigger('multiplayer')
    await Promise.resolve()
    expect(lucet.getState().composer.locked).toBe(true)
    expect(lucet.getState().composer.lockedBy).toBe('Jennifer Lee')
    lucet.store.dispatch({ type: 'composer/queued', text: 'Also list the owners.' })
    return { lucet, run }
  }

  it('a stop during another person\'s run is terminal: the queued words send once, as yours', async () => {
    const { lucet, run } = await adaRunning()
    lucet.abort()
    await run
    /* the queue promise runs after the aborted run settles */
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    const turns = lucet.getState().turns
    expect(turns[0]?.prompt.authorId).toBe('Jennifer Lee')
    expect(turns[0]?.response?.status).toBe('interrupted')
    expect(turns.length).toBeGreaterThanOrEqual(2)
    expect(turns[1]?.prompt.authorId).toBe('you')
    expect(turns[1]?.prompt.parts[0]).toMatchObject({ kind: 'text', text: 'Also list the owners.' })
    expect(lucet.getState().composer.queued).toBeNull()
  })

  it('a stop of your OWN run hands the queued words back to the field', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    const run = lucet.submit('Where do things stand?')
    await Promise.resolve()
    expect(lucet.getState().composer.lockedBy).toBe('you')
    lucet.store.dispatch({ type: 'composer/queued', text: 'And the appendix?' })
    lucet.abort()
    await run
    await new Promise((r) => setTimeout(r, 0))
    expect(lucet.getState().turns).toHaveLength(1)
    expect(lucet.getState().composer.queued).toBeNull()
    expect(lucet.getState().composer.text).toBe('And the appendix?')
  })
})

describe('attachments travel with the queue (component audit 07)', () => {
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
  }
  const adaRunningWithFile = async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    const run = lucet.trigger('multiplayer')
    await Promise.resolve()
    expect(lucet.getState().composer.lockedBy).toBe('Jennifer Lee')
    lucet.store.dispatch({ type: 'attachment/added', id: 'a1', name: 'brief.pdf', fileKind: 'document', sizeBytes: 1200 })
    lucet.store.dispatch({ type: 'attachment/settled', id: 'a1', status: 'ready', reason: null })
    lucet.store.dispatch({ type: 'composer/queued', text: 'Also compare with this.' })
    return { lucet, run }
  }

  it('Queue commits the staged files with the words; Edit returns both', async () => {
    const { lucet } = await adaRunningWithFile()
    expect(lucet.getState().composer.attachments).toHaveLength(0)
    expect(lucet.getState().composer.queuedAttachments.map((a) => a.id)).toEqual(['a1'])
    lucet.store.dispatch({ type: 'composer/dequeued' })
    expect(lucet.getState().composer.queued).toBeNull()
    expect(lucet.getState().composer.attachments.map((a) => a.id)).toEqual(['a1'])
    expect(lucet.getState().composer.queuedAttachments).toHaveLength(0)
    lucet.abort()
  })

  it('Cancel queue drops the words and their files', async () => {
    const { lucet } = await adaRunningWithFile()
    lucet.store.dispatch({ type: 'composer/queue-cancelled' })
    expect(lucet.getState().composer).toMatchObject({ queued: null, queuedAttachments: [], attachments: [] })
    lucet.abort()
  })

  it('the handoff sends exactly the queued files, one copy each; a file staged since stays behind', async () => {
    const { lucet, run } = await adaRunningWithFile()
    lucet.store.dispatch({ type: 'attachment/added', id: 'b2', name: 'later.png', fileKind: 'image', sizeBytes: 900 })
    lucet.store.dispatch({ type: 'attachment/settled', id: 'b2', status: 'ready', reason: null })
    await run
    await settle()
    const turns = lucet.getState().turns
    expect(turns[1]?.prompt.authorId).toBe('you')
    const sent = turns[1]?.prompt.parts.flatMap((p) => (p.kind === 'attachment' ? [p.name] : []))
    expect(sent).toEqual(['brief.pdf'])
    expect(lucet.getState().composer.queuedAttachments).toHaveLength(0)
    expect(lucet.getState().composer.attachments.map((a) => a.id)).toEqual(['b2'])
  })

  it('the composer frees as the response settles, and the handoff takes the lock in the same tick', async () => {
    const { lucet, run } = await adaRunningWithFile()
    const types: string[] = []
    let frame: boolean | null = null
    lucet.store.subscribe((_state, logged) => {
      types.push(logged.event.type)
      if (logged.event.type === 'composer/unlocked' && frame === null) {
        /* If a microtask can see the composer unlocked with the queue still
           waiting, a render could have shown that frame. */
        queueMicrotask(() => {
          frame = !lucet.getState().composer.locked && lucet.getState().composer.queued !== null
        })
      }
    })
    await run
    await settle()
    const i = types.indexOf('composer/unlocked')
    expect(i).toBeGreaterThan(0)
    expect(types[i - 1]).toBe('response/settled')
    expect(types.slice(i, i + 4)).toEqual(['composer/unlocked', 'composer/dequeued', 'turn/submitted', 'composer/locked'])
    expect(frame).toBe(false)
  })

  it('a stop of your own run hands the files back with the words', async () => {
    const lucet = createLucet({ clock: createManualClock(0), scheduler: instantScheduler })
    const run = lucet.submit('Where do things stand?')
    await Promise.resolve()
    lucet.store.dispatch({ type: 'attachment/added', id: 'a1', name: 'brief.pdf', fileKind: 'document', sizeBytes: 1200 })
    lucet.store.dispatch({ type: 'attachment/settled', id: 'a1', status: 'ready', reason: null })
    lucet.store.dispatch({ type: 'composer/queued', text: 'And the appendix?' })
    lucet.abort()
    await run
    await settle()
    expect(lucet.getState().composer).toMatchObject({ queued: null, text: 'And the appendix?' })
    expect(lucet.getState().composer.attachments.map((a) => a.id)).toEqual(['a1'])
  })
})
