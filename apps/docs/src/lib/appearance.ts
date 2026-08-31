/**
 * One appearance, three pages. Theme and accent chosen anywhere carry
 * everywhere: the Configurator, the primitives lab, and the components
 * stage read and write the same stored choice, and each page's pre-paint
 * script applies it before first paint so navigation never flashes.
 *
 * The stored choice always wins; each page keeps its own FALLBACK (the
 * site rests dark/violet, the labs rest monochrome so primitives are
 * judged without accent seduction).
 */

const KEY = 'lucet-docs-appearance'

export interface StoredAppearance {
  theme?: string
  accent?: string
  neutral?: string
  expression?: string
  radius?: string
  scale?: string
  typeface?: string
}

export function loadAppearance(): StoredAppearance {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as StoredAppearance) : {}
  } catch {
    return {}
  }
}

export function saveAppearance(patch: StoredAppearance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadAppearance(), ...patch }))
  } catch {
    /* Private windows and blocked storage lose persistence, nothing else. */
  }
}
