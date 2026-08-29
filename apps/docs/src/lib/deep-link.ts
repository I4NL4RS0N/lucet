/**
 * Every trigger is deep-linkable. Sending someone straight to a partial tool
 * failure, mid-thread, is the point.
 */

const PARAM = 'state'

export function readStateParam(): string | null {
  if (typeof window === 'undefined') return null
  return new URL(window.location.href).searchParams.get(PARAM)
}

export function writeStateParam(id: string): void {
  const url = new URL(window.location.href)
  url.searchParams.set(PARAM, id)
  window.history.replaceState(null, '', url.toString())
}

export function linkForState(id: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set(PARAM, id)
  return url.toString()
}
