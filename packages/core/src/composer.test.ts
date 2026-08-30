import { describe, expect, it } from 'vitest'
import { createInitialState, defaultModels, reduce } from './reducer.js'
import { describeSubmitBlocker, submitBlocker } from './selectors.js'
import type { LucetEvent, ThreadState } from './index.js'

/**
 * The composer half of the contract: attachments, model choice, and the
 * submit blockers. Everything here is the behaviour the prompt-input
 * component will render, tested at the layer that owns it.
 */

const now = { now: 0 }
const play = (events: readonly LucetEvent[], from?: ThreadState): ThreadState =>
  events.reduce((s, e) => reduce(s, e, now), from ?? createInitialState('t'))

const add = (id: string): LucetEvent => ({
  type: 'attachment/added',
  id,
  name: `${id}.pdf`,
  fileKind: 'document',
  sizeBytes: 1000,
})
const settle = (id: string, status: 'ready' | 'failed', reason: string | null = null): LucetEvent => ({
  type: 'attachment/settled',
  id,
  status,
  reason,
})

describe('composer attachments', () => {
  it('an added attachment is UPLOADING, not instantly present', () => {
    const s = play([add('a1')])
    expect(s.composer.attachments).toMatchObject([{ id: 'a1', status: 'uploading', reason: null }])
  })

  it('settles to ready, or to failed with a reason', () => {
    const s = play([add('a1'), add('a2'), settle('a1', 'ready'), settle('a2', 'failed', 'Too large')])
    expect(s.composer.attachments).toMatchObject([
      { id: 'a1', status: 'ready' },
      { id: 'a2', status: 'failed', reason: 'Too large' },
    ])
  })

  it('a failed attachment can be retried: back to uploading, reason cleared', () => {
    const s = play([add('a1'), settle('a1', 'failed', 'Too large'), { type: 'attachment/retried', id: 'a1' }])
    expect(s.composer.attachments).toMatchObject([{ id: 'a1', status: 'uploading', reason: null }])
    // Retrying something that has not failed is a no-op, not a reset.
    const s2 = play([add('b1'), settle('b1', 'ready'), { type: 'attachment/retried', id: 'b1' }])
    expect(s2.composer.attachments).toMatchObject([{ id: 'b1', status: 'ready' }])
  })

  it('remove removes, and unknown ids are ignored', () => {
    const s = play([add('a1'), { type: 'attachment/removed', id: 'a1' }, { type: 'attachment/removed', id: 'nope' }])
    expect(s.composer.attachments).toEqual([])
  })

  it('submit takes the ready attachments and LEAVES the rest visible', () => {
    const s = play([
      add('ok'),
      settle('ok', 'ready'),
      add('slow'),
      add('bad'),
      settle('bad', 'failed', 'Too large'),
      {
        type: 'turn/submitted',
        turnId: 't1',
        versionId: 'v1',
        messageId: 'm1',
        text: 'go',
        authorId: 'ada',
        attachmentIds: ['ok'],
      },
    ])
    // Silently discarding a failed or in-flight attachment on submit would
    // send less than the person thinks they sent.
    expect(s.composer.attachments.map((a) => a.id)).toEqual(['slow', 'bad'])
  })
})

describe('model choice', () => {
  it('defaults to the first option of the capability-named set', () => {
    const s = createInitialState('t')
    expect(s.model.selectedId).toBe(defaultModels[0]!.id)
  })

  it('changes only to a model the thread offers', () => {
    const s = play([{ type: 'model/changed', modelId: 'deep' }])
    expect(s.model.selectedId).toBe('deep')
    const s2 = play([{ type: 'model/changed', modelId: 'gpt-imaginary' }], s)
    expect(s2.model.selectedId).toBe('deep')
  })

  it('survives thread/reset, because the choice was not part of the thread content', () => {
    const s = play([{ type: 'model/changed', modelId: 'fast' }, { type: 'thread/reset' }])
    expect(s.model.options).toEqual(defaultModels)
  })
})

describe('submit blockers', () => {
  it('empty composer blocks as empty; text clears it', () => {
    expect(submitBlocker(createInitialState('t'))).toBe('empty')
    expect(submitBlocker(play([{ type: 'composer/changed', text: 'hi' }]))).toBeNull()
    expect(submitBlocker(play([{ type: 'composer/changed', text: '   ' }]))).toBe('empty')
  })

  it('a ready attachment alone is enough to send', () => {
    expect(submitBlocker(play([add('a1'), settle('a1', 'ready')]))).toBeNull()
  })

  it('uploading blocks, and outranks empty', () => {
    expect(submitBlocker(play([add('a1')]))).toBe('attachment-uploading')
  })

  it('a failed attachment blocks until removed', () => {
    const s = play([{ type: 'composer/changed', text: 'hi' }, add('a1'), settle('a1', 'failed', 'Too large')])
    expect(submitBlocker(s)).toBe('attachment-failed')
    expect(submitBlocker(play([{ type: 'attachment/removed', id: 'a1' }], s))).toBeNull()
  })

  it('the lock outranks everything', () => {
    const s = play([{ type: 'composer/changed', text: 'hi' }, { type: 'composer/locked', by: 'ada' }])
    expect(submitBlocker(s)).toBe('locked')
  })

  it('down blocks; degraded does not', () => {
    const base = play([{ type: 'composer/changed', text: 'hi' }])
    const down = play([{ type: 'service/changed', status: 'down', message: 'outage' }], base)
    const degraded = play([{ type: 'service/changed', status: 'degraded', message: 'slow' }], base)
    expect(submitBlocker(down)).toBe('service-down')
    expect(submitBlocker(degraded)).toBeNull()
  })

  it('every blocker has words', () => {
    for (const b of ['locked', 'service-down', 'attachment-uploading', 'attachment-failed', 'empty'] as const) {
      expect(describeSubmitBlocker(b).length).toBeGreaterThan(10)
    }
  })
})
