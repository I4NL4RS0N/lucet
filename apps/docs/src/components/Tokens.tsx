import { useEffect, useState } from 'react'
import { ACCENTS } from './ThemeControls'
import type { Accent, ThemeState } from './ThemeControls'

/**
 * The token specimen sheet.
 *
 * Not a debug table. Everything here is rendered USING the tokens it documents,
 * so the page is simultaneously the specification and the proof that the
 * specification works. If a token is wrong, it looks wrong here.
 *
 * Raw values are available underneath each specimen, on the same progressive
 * disclosure principle as the Audit Trail: legible on top, exact underneath.
 */

const NEUTRALS = [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950, 1000]

const STATES: readonly { id: string; label: string; why: string }[] = [
  { id: 'refused', label: 'Refused', why: 'A boundary held on purpose. Not a malfunction, so not red.' },
  { id: 'interrupted', label: 'Interrupted', why: 'Usually the user stopped it. What arrived is still good.' },
  { id: 'partial', label: 'Partial', why: 'Something came back. The answer is real but incomplete.' },
  { id: 'degraded', label: 'Degraded', why: 'Slower than usual. Wait, or switch models.' },
  { id: 'down', label: 'Down', why: 'Different from degraded. Protect the draft.' },
  { id: 'failed', label: 'Failed', why: 'It broke.' },
  { id: 'rate-limited', label: 'Rate limited', why: 'Temporary and expected. The copy carries when it lifts.' },
  { id: 'stale', label: 'Stale', why: 'Freshness is information about the answer, not a warning.' },
  { id: 'uncertain', label: 'Uncertain', why: 'Must not read as an error, or the answer gets discounted entirely.' },
  { id: 'queued', label: 'Queued', why: 'Waiting on another person. Normal, never alarming.' },
]

const TYPE = [
  { token: '--lucet-text-2xl', label: '2xl' },
  { token: '--lucet-text-xl', label: 'xl' },
  { token: '--lucet-text-lg', label: 'lg' },
  { token: '--lucet-text-base', label: 'base' },
  { token: '--lucet-text-sm', label: 'sm' },
  { token: '--lucet-text-xs', label: 'xs' },
]

const SPACE = ['1', '2', '3', '4', '6', '8', '12', '16']
const RADII = ['sm', 'md', 'lg', 'xl']
const ELEVATION = ['1', '2', '3']

function useResolved(names: readonly string[], signal: string): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({})
  useEffect(() => {
    const computed = getComputedStyle(document.documentElement)
    const next: Record<string, string> = {}
    for (const name of names) next[name] = computed.getPropertyValue(name).trim()
    setValues(next)
    // names is a module constant; signal is what actually changes.
  }, [signal])
  return values
}

const ALL_NAMES = [
  ...NEUTRALS.map((n) => `--lucet-neutral-${n}`),
  ...TYPE.map((t) => t.token),
  ...SPACE.map((s) => `--lucet-space-${s}`),
  ...RADII.map((r) => `--lucet-radius-${r}`),
  '--lucet-primary',
  '--lucet-space-unit',
  '--lucet-radius-root',
  '--lucet-duration-normal',
]

const caption: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontFamily: 'var(--lucet-font-mono)',
  opacity: 0.6,
}

export interface TokensProps extends ThemeState {
  onChange: (next: Partial<ThemeState>) => void
}

export function Tokens({ theme, accent, neutral, expression, radius, scale, typeface, onChange }: TokensProps) {
  const signal = `${theme}:${accent}:${neutral}:${expression}:${radius}:${scale}:${typeface}`
  const v = useResolved(ALL_NAMES, signal)

  return (
    <section aria-label="Design tokens" style={{ maxWidth: '60rem' }}>
      <h2>Tokens</h2>
      <p style={{ maxWidth: '38rem' }}>
        The vocabulary every component gets built from. Everything below is drawn
        using the tokens it documents, so if a value is wrong it looks wrong here.
        <strong> All of these numbers are placeholders.</strong> They are
        deliberately dull so they are easy to argue with.
      </p>

      <h3>Accent</h3>
      <p style={{ maxWidth: '38rem' }}>
        The brand colour. Ten options, and each one is two numbers: a hue and a
        chroma. Click one. Notice that the state colours below do not move, which
        is the point. A failure should not turn violet because the brand did.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.75rem 0' }}>
        {ACCENTS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => onChange({ accent: a as Accent })}
            aria-pressed={accent === a}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.3rem 0.6rem',
              cursor: 'pointer',
              borderRadius: 'var(--lucet-radius-md)',
              border: `1px solid ${accent === a ? 'var(--lucet-primary)' : 'var(--lucet-border)'}`,
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
              fontSize: '0.8125rem',
            }}
          >
            <span
              aria-hidden="true"
              data-accent={a}
              style={{
                width: '1rem',
                height: '1rem',
                borderRadius: 'var(--lucet-radius-full)',
                // Computed here, not read from --lucet-primary. That token
                // resolves at :root, so re-declaring the hue on a child does
                // not reach it. Custom properties substitute where they are
                // declared, and inherit already-resolved.
                background: 'oklch(0.62 var(--lucet-accent-c) var(--lucet-accent-h))',
                border: '1px solid var(--lucet-border)',
              }}
            />
            {a}
          </button>
        ))}
      </div>
      <p style={caption}>--lucet-primary: {v['--lucet-primary']}</p>

      <h3>States</h3>
      <p style={{ maxWidth: '38rem' }}>
        The layer no other library has names for. Each of these is a design
        decision about how a moment should feel, not a colour picked once. Read
        the reasons: this is where the argument lives.
      </p>
      <div style={{ display: 'grid', gap: '0.5rem', margin: '0.75rem 0' }}>
        {STATES.map((state) => (
          <div
            key={state.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(7rem, 9rem) 1fr',
              gap: '0.75rem',
              alignItems: 'center',
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--lucet-radius-md)',
              background: `var(--lucet-state-${state.id}-surface)`,
              color: `var(--lucet-state-${state.id}-foreground)`,
              border: `1px solid var(--lucet-state-${state.id}-border)`,
            }}
          >
            <strong style={{ fontSize: '0.875rem' }}>{state.label}</strong>
            <span style={{ fontSize: '0.8125rem' }}>{state.why}</span>
          </div>
        ))}
      </div>

      <h3>Neutrals</h3>
      <p style={{ maxWidth: '38rem' }}>
        The only greyscale in the system. Every surface, border, and body text
        colour comes from here.
      </p>
      <div style={{ display: 'flex', margin: '0.75rem 0' }}>
        {NEUTRALS.map((n) => (
          <div key={n} style={{ flex: 1, minWidth: 0 }}>
            <div
              title={v[`--lucet-neutral-${n}`]}
              style={{
                height: '3rem',
                background: `var(--lucet-neutral-${n})`,
                borderTop: '1px solid var(--lucet-border)',
                borderBottom: '1px solid var(--lucet-border)',
              }}
            />
            <div style={{ ...caption, textAlign: 'center', paddingTop: '0.25rem' }}>{n}</div>
          </div>
        ))}
      </div>

      <h3>Type</h3>
      <p style={{ maxWidth: '38rem' }}>
        A conversation is mostly prose, so the body step carries the weight.
      </p>
      {TYPE.map((t) => (
        <div key={t.token} style={{ display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
          <span style={{ ...caption, width: '3rem' }}>{t.label}</span>
          <span style={{ fontSize: `var(${t.token})`, lineHeight: 'var(--lucet-leading-prose)' }}>
            Two of the three have widened
          </span>
          <span style={caption}>{v[t.token]}</span>
        </div>
      ))}

      <h3>Space</h3>
      <p style={{ maxWidth: '38rem' }}>
        Derived from one unit, so density is a single knob. Switch expression to
        Expressive at the top and watch every bar grow together.
      </p>
      {SPACE.map((s) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.25rem' }}>
          <span style={{ ...caption, width: '3rem' }}>{s}</span>
          <span
            style={{
              display: 'block',
              width: `var(--lucet-space-${s})`,
              height: '0.75rem',
              background: 'var(--lucet-primary)',
              borderRadius: '2px',
            }}
          />
          <span style={caption}>{v[`--lucet-space-${s}`]}</span>
        </div>
      ))}
      <p style={caption}>unit: {v['--lucet-space-unit']}</p>

      <h3>Radius and elevation</h3>
      <p style={{ maxWidth: '38rem' }}>
        Both move with expression. System uses a hairline border for depth;
        Expressive uses a soft shadow. That difference is the whole axis.
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
        {RADII.map((r) => (
          <div key={r} style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '4rem',
                height: '4rem',
                background: 'var(--lucet-muted)',
                border: '1px solid var(--lucet-border)',
                borderRadius: `var(--lucet-radius-${r})`,
              }}
            />
            <div style={caption}>{r}</div>
            <div style={caption}>{v[`--lucet-radius-${r}`]}</div>
          </div>
        ))}
        {ELEVATION.map((e) => (
          <div key={e} style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '4rem',
                height: '4rem',
                background: 'var(--lucet-card)',
                borderRadius: 'var(--lucet-radius-lg)',
                boxShadow: `var(--lucet-elevation-${e})`,
              }}
            />
            <div style={caption}>elev {e}</div>
          </div>
        ))}
      </div>

      <details style={{ marginTop: '2rem' }}>
        <summary>Raw values, for the record</summary>
        <pre style={{ fontSize: '0.6875rem' }}>
          {Object.entries(v)
            .map(([k, val]) => `${k}: ${val}`)
            .join('\n')}
        </pre>
      </details>
    </section>
  )
}
