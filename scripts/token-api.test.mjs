import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * docs/tokens.md is the token API contract, and this keeps it honest.
 *
 * Two failure modes, both silent without a test. A token documented as public
 * that no longer exists sends readers looking for something that is gone. A
 * token added to the CSS and never classified joins the public surface by
 * default, because nobody said it was internal -- which is how a 243-property
 * stylesheet ends up with all 243 frozen by implication.
 *
 * So: every name in the doc must exist, and every name in the CSS must appear
 * in exactly one of the two sections. Adding a token now forces the decision.
 */

const STYLES = fileURLToPath(new URL('../packages/core/styles/', import.meta.url))
const DOC = fileURLToPath(new URL('../docs/tokens.md', import.meta.url))

/** Every --lucet-* property DECLARED across the stylesheets. */
function declaredTokens() {
  const names = new Set()
  for (const file of readdirSync(STYLES).filter((f) => f.endsWith('.css'))) {
    const css = readFileSync(STYLES + file, 'utf8')
    for (const m of css.matchAll(/^\s*(--lucet-[a-z0-9-]+)\s*:/gm)) names.add(m[1])
  }
  return names
}

/**
 * Names claimed by one section of the doc, as literals and as `-*` families.
 * Families are kept separate so a family can be matched against real tokens
 * rather than expanded from a guess about how many members it has.
 */
function claimed(section) {
  const doc = readFileSync(DOC, 'utf8')
  const start = doc.indexOf(`\n## ${section}\n`)
  expect(start, `no "## ${section}" section in docs/tokens.md`).toBeGreaterThan(-1)
  const rest = doc.slice(start + 1)
  const end = rest.indexOf('\n## ')
  const body = end === -1 ? rest : rest.slice(0, end)

  const exact = new Set()
  const prefixes = []
  const numeric = []
  for (const line of body.split('\n')) {
    if (!line.startsWith('- ')) continue
    // Only the names BEFORE the em dash are claims. Everything after it is
    // explanation, and explanations cross-reference tokens that belong to the
    // other section -- the internal entry for the accent steps points readers
    // at --lucet-primary, which is public.
    const head = line.split(' \u2014 ')[0]
    for (const m of head.matchAll(/`(--lucet-[a-z0-9-]*[*#]?)`/g)) {
      const name = m[1]
      if (name.endsWith('*')) prefixes.push(name.slice(0, -1))
      else if (name.endsWith('#')) numeric.push(name.slice(0, -1))
      else exact.add(name)
    }
  }
  return { exact, prefixes, numeric }
}

const matches = ({ exact, prefixes, numeric }, token) =>
  exact.has(token) ||
  prefixes.some((prefix) => token.startsWith(prefix)) ||
  numeric.some((prefix) => token.startsWith(prefix) && /^\d+$/.test(token.slice(prefix.length)))

describe('token API contract', () => {
  const declared = declaredTokens()
  const pub = claimed('Public')
  const internal = claimed('Internal')

  it('finds tokens to check', () => {
    expect(declared.size).toBeGreaterThan(200)
  })

  it('documents no token that does not exist', () => {
    const ghosts = [...pub.exact, ...internal.exact].filter((t) => !declared.has(t))
    expect(ghosts, 'listed in docs/tokens.md but declared nowhere').toEqual([])
  })

  it('has no family in the doc that matches nothing', () => {
    const allFamilies = [
      ...pub.prefixes, ...pub.numeric, ...internal.prefixes, ...internal.numeric,
    ]
    const empty = allFamilies.filter(
      (prefix) => ![...declared].some((t) => t.startsWith(prefix)),
    )
    expect(empty, 'family listed in docs/tokens.md matching no token').toEqual([])
  })

  it('classifies every declared token', () => {
    const unclassified = [...declared]
      .filter((t) => !matches(pub, t) && !matches(internal, t))
      .sort()
    expect(
      unclassified,
      'declared but in neither section of docs/tokens.md -- decide public or internal',
    ).toEqual([])
  })

  it('classifies no token as both public and internal', () => {
    const both = [...declared].filter((t) => matches(pub, t) && matches(internal, t)).sort()
    expect(both, 'in both sections of docs/tokens.md').toEqual([])
  })
})
