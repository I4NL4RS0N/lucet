import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { loadAppearance, saveAppearance } from '../lib/appearance'

/**
 * Theme, accent, and expression, applied to <html> as data attributes.
 *
 * Deliberately three separate axes. Light/dark is not a design decision, it is
 * a user preference. Accent is brand. Expression is intent. Collapsing them into
 * one "theme" picker is how design systems end up with twenty themes and no
 * system.
 */

export const ACCENTS = [
  'monochrome', 'slate', 'blue', 'indigo', 'violet', 'magenta',
  'rose', 'amber', 'green', 'teal', 'cyan',
] as const

/** The grey itself. Pure by default; the rest exist to harmonise with an accent. */
export const NEUTRALS = ['subtle', 'pure', 'cool', 'warm', 'accent'] as const

/**
 * Global geometry override.
 *
 * `default` sets no attribute at all, so the expression's own radius applies.
 * It has to be the default here: shipping this control preset to `medium` meant
 * an explicit override was always in force, which silently outranked
 * Expressive's geometry. Everything except the controls stayed at System's
 * radii and the two expressions looked half-applied.
 */
export const RADII = ['default', 'none', 'small', 'medium', 'large', 'full'] as const

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
export type Expression = 'paper' | 'glass'
const LEGACY_EXPRESSION: Record<string, Expression | undefined> = {
  system: 'paper',
  expressive: 'glass',
}

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
    /* Browser-chrome colour: the boot script owns the mapping. */
    ;(window as { lucetThemeColor?: (theme: string) => void }).lucetThemeColor?.(theme)
    root.setAttribute('data-accent', accent)
    root.setAttribute('data-neutral', neutral)
    /* Expression is NOT stamped on the root: the docs chrome pins to
       Paper, and each page stamps data-expression on its exhibits (the
       Konfabulator's app containers; the labs' page root). The library
       reads the attribute from any subtree root. */
    root.removeAttribute('data-expression')
    if (radius === 'default') root.removeAttribute('data-radius')
    else root.setAttribute('data-radius', radius)
    root.setAttribute('data-scale', scale)
    root.setAttribute('data-typeface', typeface)
  }, [theme, accent, neutral, expression, radius, scale, typeface])
}

export interface ThemeControlsProps extends ThemeState {
  onChange: (next: Partial<ThemeState>) => void
}

/**
 * One labelled control cell.
 *
 * The label sits ABOVE the field rather than beside it. With seven axes, inline
 * labels run together into a strip nobody can scan, and they force every cell
 * to a different width so nothing aligns. Stacked labels let the whole row sit
 * on a grid.
 */
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
    <label className="control">
      <span className="control__label">{name}</span>
      <span className="control__field">
        <select value={value} onChange={(e) => onSelect(e.target.value as T)}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </span>
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
        options={['paper', 'glass'] as const}
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
/**
 * The appearance, owned ONCE: full state seeded from storage (each page
 * passes only its resting fallback), applied to the root, persisted on
 * every change. Three pages had three copies of this wiring, and two of
 * them only knew about theme and accent — a typeface or grey chosen on
 * the Konfabulator silently did not follow you to the labs. One hook,
 * no drift.
 */
export function useAppearance(fallback: {
  theme: Theme
  accent: Accent
}): [ThemeState, (patch: Partial<ThemeState>) => void] {
  const [state, setState] = useState<ThemeState>(() => {
    const stored = loadAppearance()
    return {
      theme: (stored.theme as Theme) ?? fallback.theme,
      accent: (stored.accent as Accent) ?? fallback.accent,
      neutral: (stored.neutral as Neutral) ?? 'accent',
      /* Legacy migration: the axis was renamed from system/expressive to
         paper/glass when it became a material axis (2026-09-01). */
      expression: (LEGACY_EXPRESSION[stored.expression ?? ''] ?? (stored.expression as Expression)) ?? 'paper',
      radius: (stored.radius as Radius) ?? 'default',
      scale: (stored.scale as Scale) ?? '100',
      typeface: (stored.typeface as Typeface) ?? 'inter',
    }
  })
  useApplyTheme(state)
  useEffect(() => {
    saveAppearance(state)
  }, [state])
  const update = useCallback((patch: Partial<ThemeState>) => {
    /* THE EXPRESSION FLIP is the one moment no reference library can
       have: geometry is locked, so Paper and Glass can cross-dissolve
       with nothing moving — the whole material world changes while
       every element holds its position. A material event moves like
       Glass in both directions (duration-flip at ease-mass; the
       ::view-transition rules live in site-header.css). The dissolve
       starts from the control's own change event — no beat. Browsers
       without View Transitions, and reduced motion, get the instant
       swap: instant is a legitimate rendering of the same event. */
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    const flips = 'expression' in patch
    if (
      flips &&
      typeof doc.startViewTransition === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      /* The More panel CLOSES on the press that flips the expression —
         before the snapshot, so the dissolve carries no floating
         settings object and the press is acknowledged by the instant
         close. (This replaced a view-transition-name exemption on the
         panel, which was blamed for page text rendering through it;
         the real cause was the closed panel still displaying — see
         the panel's CSS. A menu closing on selection is also just
         what menus do.) */
      const panel = document.querySelector('.cfg__more-panel') as (HTMLElement & { hidePopover?: () => void; matches(s: string): boolean }) | null
      if (panel?.matches(':popover-open')) panel.hidePopover?.()
      doc.startViewTransition(() => {
        flushSync(() => setState((prev) => ({ ...prev, ...patch })))
      })
      return
    }
    setState((prev) => ({ ...prev, ...patch }))
  }, [])
  return [state, update]
}

/**
 * The canvas mirror (overscroll pass): a page whose ground is
 * expression-scoped on its wrapper paints that computed ground onto
 * the root, so overscroll and the area beyond a short page show the
 * page's own surface — one ground from the canvas inward. rAF waits
 * for the wrapper's re-derived tokens to resolve.
 */
export function useCanvasGround(ref: React.RefObject<HTMLElement | null>, state: unknown) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const sync = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        document.documentElement.style.backgroundColor = getComputedStyle(el).backgroundColor
      })
    }
    sync()
    /* The theme can also arrive as a bare attribute swap — devtools, the
       audits — so the mirror watches the root, not only React state. */
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-accent', 'data-neutral'],
    })
    return () => {
      mo.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [ref, state])
}

/**
 * The pickers — theme, accent, and every other axis behind "More" — as one
 * component, so each page offers ALL of the appearance, not the two pieces
 * it remembered to wire.
 *
 * "Greys", not "Neutral": Neutral is the token word, and beside an Accent
 * picker it read as a synonym answering a question nobody asked (Ian). The
 * axis picks which grey family the interface is mixed from; its `accent`
 * option leans the greys toward the current accent, Radix-style.
 */
export function AppearancePrefs({
  state,
  onChange,
}: {
  state: ThemeState
  onChange: (patch: Partial<ThemeState>) => void
}) {
  /* THE PANEL LIVES IN THE TOP LAYER (stacking pass). The appearance
     cluster's view-transition-name — needed so the pressed control
     answers on the flip's first frame — also forces a stacking
     context, which atomised the cluster at z-auto and let the
     Konfabulator's frame content paint over the open panel. A bigger
     z-index would be the next regression; the native Popover API is
     immune by construction: the top layer outranks every page
     stacking context. Light dismiss and Escape come with popover=auto,
     replacing the hand-rolled listeners this block used to hold. The
     top layer ignores anchor positioning, so the panel is placed from
     the trigger's rect on each open. */
  const moreRef = useRef<HTMLDivElement | null>(null)
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const panel = moreRef.current
    if (!panel) return
    const place = () => {
      const t = moreTriggerRef.current
      if (!t) return
      const r = t.getBoundingClientRect()
      panel.style.top = `${Math.round(r.bottom + 6)}px`
      panel.style.left = 'auto'
      panel.style.right = `${Math.round(window.innerWidth - r.right)}px`
    }
    const onToggle = () => {
      if ((panel as HTMLElement & { matches(s: string): boolean }).matches(':popover-open')) place()
    }
    panel.addEventListener('toggle', onToggle)
    window.addEventListener('resize', place)
    return () => {
      panel.removeEventListener('toggle', onToggle)
      window.removeEventListener('resize', place)
    }
  }, [])

  return (
    <div className="cfg__prefs">
      <span className="cfg__pick">
        <select
          aria-label="Theme"
          value={state.theme}
          onChange={(e) => onChange({ theme: e.target.value as Theme })}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </span>
      <span className="cfg__pick">
        <select
          aria-label="Accent"
          value={state.accent}
          onChange={(e) => onChange({ accent: e.target.value as Accent })}
        >
          {ACCENTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </span>
      {/*
       * The rest of the appearance axes — expression, greys, radius, scale,
       * typeface — are real and audited, but four more pickers on the bar
       * would bury the two that carry the pitch. They wait behind one word.
       */}
      <span className="cfg__more">
        <button type="button" className="cfg__more-trigger" popoverTarget="lucet-more-panel" ref={moreTriggerRef}>
          More
        </button>
        <div id="lucet-more-panel" popover="auto" className="cfg__more-panel" ref={moreRef}>
          {(
            [
              ['Expression', 'expression', ['paper', 'glass'], undefined],
              [
                'Greys',
                'neutral',
                NEUTRALS,
                "Which grey family the interface is mixed from. 'accent' leans the greys toward the current accent.",
              ],
              ['Radius', 'radius', RADII, undefined],
              ['Scale', 'scale', SCALES, undefined],
              ['Typeface', 'typeface', TYPEFACES, undefined],
            ] as const
          ).map(([label, key, options, title]) => (
            <label className="cfg__more-row" key={key} title={title}>
              <span>{label}</span>
              <select
                value={state[key]}
                onChange={(e) => onChange({ [key]: e.target.value } as Partial<ThemeState>)}
              >
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </span>
    </div>
  )
}
