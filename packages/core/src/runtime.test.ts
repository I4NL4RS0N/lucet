import { describe, expect, it } from 'vitest'
import {
  createLucet,
  createManualClock,
  createStore,
  instantScheduler,
  reduce,
  createInitialState,
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
})
