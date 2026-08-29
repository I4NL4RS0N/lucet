import { useEffect } from 'react'

/**
 * Theme, accent, and expression, applied to <html> as data attributes.
 *
 * Deliberately three separate axes. Light/dark is not a design decision, it is
 * a user preference. Accent is brand. Expression is intent. Collapsing them into
 * one "theme" picker is how design systems end up with twenty themes and no
 * system.
 */

export const ACCENTS = [
  'slate', 'blue', 'indigo', 'violet', 'magenta',
  'rose', 'amber', 'green', 'teal', 'cyan',
] as const

export type Theme = 'system' | 'light' | 'dark'
export type Accent = (typeof ACCENTS)[number]
export type Expression = 'system' | 'expressive'

export interface ThemeState {
  theme: Theme
  accent: Accent
  expression: Expression
}

export function useApplyTheme({ theme, accent, expression }: ThemeState): void {
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    root.setAttribute('data-accent', accent)
    root.setAttribute('data-expression', expression)
  }, [theme, accent, expression])
}

export interface ThemeControlsProps extends ThemeState {
  onChange: (next: Partial<ThemeState>) => void
}

export function ThemeControls({ theme, accent, expression, onChange }: ThemeControlsProps) {
  return (
    <>
      <label>
        Theme{' '}
        <select value={theme} onChange={(e) => onChange({ theme: e.target.value as Theme })}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>{' '}
      <label>
        Accent{' '}
        <select value={accent} onChange={(e) => onChange({ accent: e.target.value as Accent })}>
          {ACCENTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        Expression{' '}
        <select
          value={expression}
          onChange={(e) => onChange({ expression: e.target.value as Expression })}
        >
          <option value="system">System</option>
          <option value="expressive">Expressive</option>
        </select>
      </label>
    </>
  )
}
