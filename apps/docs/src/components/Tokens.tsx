import { useEffect, useState } from 'react'

/**
 * The token readout.
 *
 * Every token, resolved live from the document, so it reacts to theme, accent,
 * and expression exactly as a component would. This is a design surface, not a
 * debug view: it is where the placeholder values get argued with.
 */

interface Group {
  title: string
  note: string
  tokens: readonly string[]
}

const SEMANTIC = [
  'background', 'foreground', 'card', 'card-foreground', 'popover',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
  'muted', 'muted-foreground', 'subtle', 'subtle-foreground',
  'border', 'input', 'ring',
].map((t) => `--lucet-${t}`)

const TONES = ['neutral', 'info', 'caution', 'danger', 'unknown'].flatMap((tone) =>
  ['surface', 'foreground', 'border'].map((slot) => `--lucet-tone-${tone}-${slot}`),
)

const STATES = [
  'refused', 'interrupted', 'partial', 'degraded', 'down',
  'failed', 'rate-limited', 'stale', 'uncertain', 'queued',
].flatMap((state) =>
  ['surface', 'foreground', 'border'].map((slot) => `--lucet-state-${state}-${slot}`),
)

const SCALES = [
  '--lucet-space-1', '--lucet-space-2', '--lucet-space-3', '--lucet-space-4',
  '--lucet-space-6', '--lucet-space-8', '--lucet-space-12', '--lucet-space-16',
  '--lucet-text-xs', '--lucet-text-sm', '--lucet-text-base', '--lucet-text-lg',
  '--lucet-text-xl', '--lucet-text-2xl',
  '--lucet-radius-sm', '--lucet-radius-md', '--lucet-radius-lg', '--lucet-radius-xl',
  '--lucet-leading-prose', '--lucet-tracking-tight',
  '--lucet-duration-fast', '--lucet-duration-normal', '--lucet-duration-slow',
]

const GROUPS: readonly Group[] = [
  {
    title: 'Semantic',
    note: 'What components read. Each falls back to shadcn’s variable when the host defines one.',
    tokens: SEMANTIC,
  },
  {
    title: 'Tones',
    note: 'Five tones. Uncertainty gets its own so it cannot be mistaken for a warning.',
    tokens: TONES,
  },
  {
    title: 'States',
    note: 'The map from state to tone. Each assignment is a design decision, written down in tones.css.',
    tokens: STATES,
  },
  { title: 'Scales', note: 'Space, type, radius, and motion. Density moves the space unit, not the scale.', tokens: SCALES },
]

function isColor(value: string): boolean {
  return /^(oklch|rgb|hsl|#)/.test(value.trim())
}

export function Tokens({ signal }: { signal: string }) {
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    // Resolved from the document so the readout reflects the cascade, not a
    // second copy of the values that could drift from it.
    const computed = getComputedStyle(document.documentElement)
    const next: Record<string, string> = {}
    for (const group of GROUPS) {
      for (const token of group.tokens) {
        next[token] = computed.getPropertyValue(token).trim()
      }
    }
    setValues(next)
  }, [signal])

  return (
    <section aria-label="Design tokens">
      <h2>Tokens</h2>
      <p>
        Resolved live from the document. The architecture is settled; the values are
        placeholders, chosen to be neutral enough to argue with.
      </p>

      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3>{group.title}</h3>
          <p>{group.note}</p>
          <table>
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">Token</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {group.tokens.map((token) => {
                const value = values[token] ?? ''
                return (
                  <tr key={token}>
                    <td>
                      {isColor(value) ? (
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'inline-block',
                            width: '1.25rem',
                            height: '1.25rem',
                            background: value,
                            border: '1px solid var(--lucet-border)',
                            borderRadius: 'var(--lucet-radius-sm)',
                          }}
                        />
                      ) : null}
                    </td>
                    <th scope="row">
                      <code>{token}</code>
                    </th>
                    <td>
                      <code>{value || '—'}</code>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
    </section>
  )
}
