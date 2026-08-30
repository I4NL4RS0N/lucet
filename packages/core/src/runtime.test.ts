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

  it('promotes a queued prompt on unlock rather than discarding it', () => {
    const store = createStore({ id: 't' })
    store.dispatch({ type: 'composer/locked', by: 'ada' })
    store.dispatch({ type: 'composer/queued', text: 'next one' })
    store.dispatch({ type: 'composer/unlocked' })
    expect(store.getState().composer).toMatchObject({
      locked: false,
      queued: null,
      text: 'next one',
    })
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
