/**
 * The entire React binding surface.
 *
 * If this file ever grows logic of its own, that logic belongs in the core
 * instead. Wrappers for other frameworks should be able to mirror this in a
 * couple of hundred lines.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { LoggedEvent, ThreadState, TriggerGroup } from '@lucet/core'
import { useLucet } from './context.js'

export function useThread(): ThreadState {
  const lucet = useLucet()
  const subscribe = useCallback(
    (onChange: () => void) => lucet.subscribe(onChange),
    [lucet],
  )
  return useSyncExternalStore(subscribe, lucet.getState, lucet.getState)
}

/**
 * The event log, for the state inspector.
 *
 * The core appends in place, so the snapshot is the length and the array is
 * derived from it. Copying the whole log on every streamed chunk would be
 * quietly expensive during a long response.
 */
export function useEventLog(): readonly LoggedEvent[] {
  const lucet = useLucet()
  const subscribe = useCallback(
    (onChange: () => void) => lucet.subscribe(onChange),
    [lucet],
  )
  const size = useSyncExternalStore(
    subscribe,
    () => lucet.getLog().length,
    () => 0,
  )
  return useMemo(() => lucet.getLog().slice(), [lucet, size])
}

export function useTriggerGroups(): readonly TriggerGroup[] {
  const lucet = useLucet()
  return useMemo(() => lucet.triggers.groups(), [lucet])
}
