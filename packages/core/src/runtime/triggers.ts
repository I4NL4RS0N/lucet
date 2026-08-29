/**
 * The trigger registry backing the docs site rail.
 *
 * Every trigger is addressable by id so any state is deep-linkable. Sending
 * someone a link that lands them on a partial tool failure, mid-thread, is the
 * whole point.
 */

import type { Scenario } from './scenario.js'

export interface TriggerGroup {
  readonly group: string
  readonly scenarios: readonly Scenario[]
}

export interface TriggerRegistry {
  list(): readonly Scenario[]
  groups(): readonly TriggerGroup[]
  get(id: string): Scenario | null
  register(scenario: Scenario): void
}

export function createTriggerRegistry(initial: readonly Scenario[] = []): TriggerRegistry {
  const byId = new Map<string, Scenario>()
  for (const scenario of initial) byId.set(scenario.id, scenario)

  return {
    list: () => [...byId.values()],
    groups() {
      const grouped = new Map<string, Scenario[]>()
      for (const scenario of byId.values()) {
        const bucket = grouped.get(scenario.group)
        if (bucket) bucket.push(scenario)
        else grouped.set(scenario.group, [scenario])
      }
      return [...grouped].map(([group, scenarios]) => ({ group, scenarios }))
    },
    get: (id) => byId.get(id) ?? null,
    register(scenario) {
      byId.set(scenario.id, scenario)
    },
  }
}

/** Reads a trigger id out of a URL. String in, string out: no DOM assumed. */
export function readTriggerId(url: string, param = 'state'): string | null {
  try {
    return new URL(url).searchParams.get(param)
  } catch {
    return null
  }
}

/** Writes a trigger id into a URL, for the rail's copy-link affordance. */
export function writeTriggerId(url: string, id: string, param = 'state'): string {
  const next = new URL(url)
  next.searchParams.set(param, id)
  return next.toString()
}
