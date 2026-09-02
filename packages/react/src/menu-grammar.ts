import { useCallback } from 'react'

/**
 * The disclosure-menu keyboard grammar, shared by every composer panel
 * built on <details> (the scope control, the budget meter). The pattern
 * follows the menu-button contract without claiming the menu role — rows
 * are real buttons with aria-pressed, which screen readers already handle
 * honestly.
 *
 * - Opening moves focus to the pressed row, or the first.
 * - ArrowDown / ArrowUp rove with wrap; Home / End jump.
 * - Escape closes and returns focus to the trigger.
 * - A pointer down outside closes, the way every menu closes.
 *
 * One hook on purpose: two components each growing their own half of
 * this grammar is how keyboard support drifts. Attach the returned ref
 * to the <details> element.
 */
export function useMenuGrammar(): (el: HTMLDetailsElement | null) => void | (() => void) {
  return useCallback((el: HTMLDetailsElement | null) => {
    if (!el) return
    const rows = () => Array.from(el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))

    const onToggle = () => {
      if (!el.open) {
        /* Closed while focus was still inside (a row was chosen by
           keyboard): hand focus back to the trigger. An outside click
           has already moved focus elsewhere and keeps it. */
        if (el.contains(document.activeElement) && document.activeElement?.tagName !== 'SUMMARY')
          el.querySelector<HTMLElement>('summary')?.focus()
        return
      }
      const all = rows()
      /* A row marked data-first takes focus over the pressed one: the
         decision a panel opened FOR (the budget hold's cheaper model)
         beats the state it happens to be in. */
      const target =
        all.find((r) => r.hasAttribute('data-first')) ??
        all.find((r) => r.getAttribute('aria-pressed') === 'true') ??
        all[0]
      target?.focus()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!el.open) return
      /* 'Down'/'Up' are the legacy names some synthetic drivers still send. */
      const key = e.key === 'Down' ? 'ArrowDown' : e.key === 'Up' ? 'ArrowUp' : e.key
      if (key === 'Escape') {
        e.preventDefault()
        el.open = false
        el.querySelector<HTMLElement>('summary')?.focus()
        return
      }
      if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return
      const all = rows()
      if (all.length === 0) return
      const i = all.indexOf(document.activeElement as HTMLButtonElement)
      const next =
        key === 'Home'
          ? 0
          : key === 'End'
            ? all.length - 1
            : key === 'ArrowDown'
              ? i < 0
                ? 0
                : (i + 1) % all.length
              : i < 0
                ? all.length - 1
                : (i - 1 + all.length) % all.length
      e.preventDefault()
      all[next]?.focus()
    }
    const onPointerDown = (e: PointerEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false
    }

    el.addEventListener('toggle', onToggle)
    el.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      el.removeEventListener('toggle', onToggle)
      el.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])
}
