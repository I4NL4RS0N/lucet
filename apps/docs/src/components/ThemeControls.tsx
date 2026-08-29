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
  'gray', 'slate', 'blue', 'indigo', 'violet', 'magenta',
  'rose', 'amber', 'green', 'teal', 'cyan',
] as const

/** The grey itself. Pure by default; the rest exist to harmonise with an accent. */
export const NEUTRALS = ['subtle', 'pure', 'cool', 'warm', 'accent'] as const

/** Global geometry. Overrides the expression default and a host's --radius. */
export const RADII = ['none', 'small', 'medium', 'large', 'full'] as const

/** One multiplier over spacing and type. Narrow on purpose. */
export const SCALES = ['90', '95', '100', '105', '110'] as const

/** Typefaces. The library names stacks; the docs site loads the faces. */
export const TYPEFACES = ['inter', 'plex', 'instrument', 'reading', 'system'] as const

/*
 * Loaded on demand rather than all five up front, so choosing the default
 * costs one family instead of five. `system` loads nothing at all, which is
 * also the proof that the components need no webfont.
 */
const FONT_HREF: Record<(typeof TYPEFACES)[number], string | null> = {
  inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap',
  plex:
    'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap',
  instrument:
    'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
  reading:
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap',
  system: null,
}

function ensureTypeface(name: (typeof TYPEFACES)[number]): void {
  const href = FONT_HREF[name]
  if (!href || document.querySelector(`link[data-typeface="${name}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.typeface = name
  document.head.appendChild(link)
}

export type Theme = 'system' | 'light' | 'dark'
export type Accent = (typeof ACCENTS)[number]
export type Neutral = (typeof NEUTRALS)[number]
export type Radius = (typeof RADII)[number]
export type Scale = (typeof SCALES)[number]
export type Typeface = (typeof TYPEFACES)[number]
export type Expression = 'system' | 'expressive'

export interface ThemeState {
  theme: Theme
  accent: Accent
  neutral: Neutral
  expression: Expression
  radius: Radius
  scale: Scale
  typeface: Typeface
}

export function useApplyTheme({
  theme,
  accent,
  neutral,
  expression,
  radius,
  scale,
  typeface,
}: ThemeState): void {
  useEffect(() => {
    ensureTypeface(typeface)
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    root.setAttribute('data-accent', accent)
    root.setAttribute('data-neutral', neutral)
    root.setAttribute('data-expression', expression)
    root.setAttribute('data-radius', radius)
    root.setAttribute('data-scale', scale)
    root.setAttribute('data-typeface', typeface)
  }, [theme, accent, neutral, expression, radius, scale, typeface])
}

export interface ThemeControlsProps extends ThemeState {
  onChange: (next: Partial<ThemeState>) => void
}

function Select<T extends string>({
  name,
  value,
  options,
  onSelect,
}: {
  name: string
  value: T
  options: readonly T[]
  onSelect: (value: T) => void
}) {
  return (
    <label>
      {name}{' '}
      <select value={value} onChange={(e) => onSelect(e.target.value as T)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ThemeControls({
  theme,
  accent,
  neutral,
  expression,
  radius,
  scale,
  typeface,
  onChange,
}: ThemeControlsProps) {
  return (
    <>
      <Select
        name="Theme"
        value={theme}
        options={['system', 'light', 'dark'] as const}
        onSelect={(v) => onChange({ theme: v })}
      />{' '}
      <Select
        name="Accent"
        value={accent}
        options={ACCENTS}
        onSelect={(v) => onChange({ accent: v })}
      />{' '}
      <Select
        name="Grey"
        value={neutral}
        options={NEUTRALS}
        onSelect={(v) => onChange({ neutral: v })}
      />{' '}
      <Select
        name="Expression"
        value={expression}
        options={['system', 'expressive'] as const}
        onSelect={(v) => onChange({ expression: v })}
      />{' '}
      <Select
        name="Typeface"
        value={typeface}
        options={TYPEFACES}
        onSelect={(v) => onChange({ typeface: v })}
      />{' '}
      <Select
        name="Radius"
        value={radius}
        options={RADII}
        onSelect={(v) => onChange({ radius: v })}
      />{' '}
      <Select
        name="Scale"
        value={scale}
        options={SCALES}
        onSelect={(v) => onChange({ scale: v })}
      />
    </>
  )
}