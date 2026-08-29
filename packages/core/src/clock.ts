/**
 * Time, injected.
 *
 * The mock runtime has to be repeatable, and a demo that cannot be replayed
 * identically is not a demo. Real timers drive the browser; the manual scheduler
 * drives tests and any future step-through mode in the inspector.
 */

export interface Clock {
  now(): number
}

export interface Scheduler {
  sleep(ms: number, signal?: AbortSignal): Promise<void>
}

export const systemClock: Clock = {
  now: () => Date.now(),
}

/** A clock that only advances when told to. Deterministic by construction. */
export function createManualClock(start = 0): Clock & { advance(ms: number): void } {
  let t = start
  return {
    now: () => t,
    advance(ms) {
      t += ms
    },
  }
}

export const systemScheduler: Scheduler = {
  sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      const id = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      const onAbort = () => {
        clearTimeout(id)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  },
}

/** Resolves immediately. Used to replay a scenario as fast as it can run. */
export const instantScheduler: Scheduler = {
  async sleep(_ms, signal) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  },
}

/** Monotonic, prefixed ids. No randomness, so runs are comparable. */
export function createIdFactory(): (prefix: string) => string {
  const counters = new Map<string, number>()
  return (prefix) => {
    const next = (counters.get(prefix) ?? 0) + 1
    counters.set(prefix, next)
    return `${prefix}_${next}`
  }
}
