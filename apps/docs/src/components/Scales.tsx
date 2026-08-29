import { REFERENCE } from '../lib/reference-palettes'
import type { ReferenceHue } from '../lib/reference-palettes'
import type { ThemeState } from './ThemeControls'

/**
 * Generated scale versus the field.
 *
 * Lucet's twelve steps are computed live from the shared curve. Radix and
 * Tailwind are their real shipped values, fetched rather than remembered.
 *
 * The point is not to win. It is to see exactly where a one-line-per-accent
 * generator falls short of a hand-tuned palette, and decide whether that gap is
 * worth the cost of adopting one.
 */

const STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
const HUES: readonly ReferenceHue[] = ['blue', 'amber', 'green']

function swatchStyle(background: string): React.CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    height: '2.75rem',
    background,
  }
}

const label: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontFamily: 'var(--lucet-font-mono)',
  color: 'var(--lucet-muted-foreground)',
  width: '5.5rem',
  flex: 'none',
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--lucet-space-2)' }}>
      <span style={label}>{name}</span>
      <div
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          borderRadius: 'var(--lucet-radius-md)',
          overflow: 'hidden',
          border: '1px solid var(--lucet-border)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function Scales({ theme }: Pick<ThemeState, 'theme'>) {
  // Radix ships designed dark counterparts. Tailwind does not, which is part of
  // what the comparison is meant to show.
  const prefersDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  const mode = prefersDark ? 'dark' : 'light'

  return (
    <section aria-label="Scale comparison" style={{ maxWidth: '60rem' }}>
      <h2>Scales</h2>
      <p style={{ maxWidth: '40rem' }}>
        Our generated twelve steps against what Radix and Tailwind actually ship.
        Ours is computed live from one shared chroma curve, so an accent costs a
        hue and a peak chroma. Theirs are hand-tuned per hue.
      </p>
      <p style={{ maxWidth: '40rem' }}>
        <strong>Amber is the honest test.</strong> On the shared curve it came out
        tan and muddy, because the curve forced every solid step to L 0.62 and
        yellow at that lightness is mud. It needed a second curve, the
        light-solid variant, where the solid stays pale and takes dark text.
        Radix draws the same distinction.
      </p>
      <p style={{ maxWidth: '40rem' }}>
        What we still give up: Tailwind shifts amber&rsquo;s hue from 95° to 46°,
        warming it toward orange as it darkens. A single-hue generator cannot do
        that, so our dark steps stay gold where theirs turn brown. That is the
        remaining gap, and it is the price of one line per accent.
      </p>

      {HUES.map((hue) => (
        <section key={hue} style={{ marginBottom: 'var(--lucet-space-8)' }}>
          <h3>{hue}</h3>

          <div style={{ display: 'grid', gap: 'var(--lucet-space-2)' }}>
            <div data-accent={hue}>
              <Row name="lucet 1-12">
                {STEPS.map((n) => (
                  <span
                    key={n}
                    title={`--lucet-accent-${n}`}
                    style={swatchStyle(
                      `oklch(var(--lucet-al-${n}) calc(var(--lucet-accent-c) * var(--lucet-ac-${n})) var(--lucet-accent-h))`,
                    )}
                  />
                ))}
              </Row>
            </div>

            <Row name={`radix ${mode}`}>
              {REFERENCE.radix[hue][mode].map((value, i) => (
                <span key={i} title={value} style={swatchStyle(value)} />
              ))}
            </Row>

            <Row name="tailwind">
              {REFERENCE.tailwind[hue].map((value, i) => (
                <span key={i} title={value} style={swatchStyle(value)} />
              ))}
            </Row>
          </div>
        </section>
      ))}

      <p style={{ maxWidth: '40rem', color: 'var(--lucet-muted-foreground)' }}>
        Radix and Tailwind values are fetched verbatim from their published
        packages, both MIT. Nothing in the library consumes them; this view exists
        to be argued with.
      </p>
    </section>
  )
}
