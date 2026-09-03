import { describe, expect, it } from 'vitest'
import { announcementPlan } from './announce.js'

/**
 * The announcer's whole value is one invariant: as text grows, the plan
 * only appends. The property test replays a document that exercises every
 * construct, chunk by chunk at several sizes, and fails on the first unit
 * that changes or disappears. If this suite is green, a renderer can
 * announce plan[n..] on every state change with no timers and no diffing.
 */

const TOUR = [
  '## The plan',
  '',
  'Three steps, smallest first. The dates come from the [timeline](https://example.com/t), not the draft.',
  '',
  '1. **Freeze the template** — nothing merges after Tuesday.',
  '2. Move the review to Thursday. It was drifting anyway.',
  '',
  '| Workstream | Owner |',
  '| --- | --- |',
  '| Template | Jennifer |',
  '| Review | Sam |',
  '',
  'The folder layout stays flat:',
  '',
  '```text',
  'plan/',
  '  brief.md',
  '```',
  '',
  '> One rule: if a step slips, say so the day it slips. Not on Friday.',
].join('\n')

describe('announcementPlan', () => {
  it('speaks sentences, not chunks', () => {
    expect(announcementPlan('First point made. Second point still arriv', false)).toEqual([
      'First point made.',
    ])
  })

  it('flushes the remainder at settle', () => {
    expect(announcementPlan('First point made. Second point cut of', true)).toEqual([
      'First point made.',
      'Second point cut of',
    ])
  })

  it('a heading announces whole, once its line has company', () => {
    expect(announcementPlan('## The pl', false)).toEqual([])
    expect(announcementPlan('## The plan\n\nWords arriv', false)).toEqual(['Heading: The plan'])
  })

  it('describes code instead of spelling it', () => {
    expect(announcementPlan('```ts\nconst a = 1\nconst b = 2\n```\n\nAfter', false)).toEqual([
      'Code, ts, 2 lines.',
    ])
  })

  it('an open fence stays quiet — it announces when it closes', () => {
    expect(announcementPlan('```ts\nconst a = 1', false)).toEqual([])
  })

  it('speaks a table as its header, then rows as they finish', () => {
    expect(
      announcementPlan('| Workstream | Owner |\n| --- | --- |\n| Template | Jennifer |\n| Rev', false),
    ).toEqual(['Table: Workstream, Owner.', 'Template, Jennifer.'])
  })

  it('speaks the words, never the syntax', () => {
    const plan = announcementPlan(TOUR, true)
    for (const unit of plan) {
      expect(unit).not.toMatch(/[*_`#>]|\]\(/)
    }
    expect(plan).toContain('Heading: The plan')
    expect(plan).toContain('Code, text, 2 lines.')
    expect(plan).toContain('Freeze the template — nothing merges after Tuesday.')
  })

  it('THE INVARIANT: the plan for a prefix is a prefix of the plan', () => {
    for (const step of [1, 3, 7, 11]) {
      let previous: readonly string[] = []
      for (let cut = 0; cut <= TOUR.length; cut += step) {
        const plan = announcementPlan(TOUR.slice(0, cut), false)
        expect(
          plan.slice(0, previous.length),
          `at cut ${cut} (step ${step}): earlier units changed`,
        ).toEqual(previous)
        previous = plan
      }
      const final = announcementPlan(TOUR, true)
      expect(final.slice(0, previous.length)).toEqual(previous)
    }
  })
})
