import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Dark has to be declared twice in materials.css: once under
 * prefers-color-scheme for people who never touch a toggle, once under
 * [data-theme='dark'] for people who do. CSS gives no way to share one body
 * across a media query and an attribute selector, so the values are duplicated.
 *
 * Duplication drifts. It already did: the contact shadow -- the half-pixel
 * first stop that materials.css itself calls the difference between "has a
 * shadow" and "has thickness" -- lived only in the media-query copy. Expressive
 * dark had thickness by OS preference and none by toggle, and the toggle is the
 * path the Konfabulator uses.
 *
 * Nothing else could catch it. The contrast audit measures colour, and the two
 * paths are identical in colour. The eye cannot catch it either, because the
 * two dark paths never render side by side.
 *
 * So: each pair is fenced with @paired-begin/@paired-end markers, and this
 * asserts the two halves declare exactly the same properties with exactly the
 * same values. Edit one half and this fails until you edit the other.
 */

const css = readFileSync(
  fileURLToPath(new URL('../packages/core/styles/materials.css', import.meta.url)),
  'utf8',
)

/** Pull the declarations inside a fenced region, ignoring selectors and comments. */
function declarationsIn(marker) {
  const region = css.match(
    new RegExp(`/\\* @paired-begin ${marker} \\*/([\\s\\S]*?)/\\* @paired-end ${marker} \\*/`),
  )
  if (!region) throw new Error(`no @paired region named "${marker}" in materials.css`)

  const body = region[1].replace(/\/\*[\s\S]*?\*\//g, '')
  const decls = new Map()
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    // Collapse whitespace so indentation differences between the media-query
    // copy and the attribute copy are not reported as drift.
    decls.set(m[1], m[2].replace(/\s+/g, ' ').trim())
  }
  if (decls.size === 0) throw new Error(`@paired region "${marker}" declares nothing`)
  return decls
}

const PAIRS = [
  ['dark-system-media', 'dark-system-attr'],
  ['dark-glass-media', 'dark-glass-attr'],
]

describe('materials.css paired dark blocks', () => {
  for (const [a, b] of PAIRS) {
    it(`${a} and ${b} declare the same properties`, () => {
      expect([...declarationsIn(a).keys()].sort()).toEqual([...declarationsIn(b).keys()].sort())
    })

    it(`${a} and ${b} declare the same values`, () => {
      expect(Object.fromEntries(declarationsIn(a))).toEqual(Object.fromEntries(declarationsIn(b)))
    })
  }

  it('the glass dark pair keeps the contact shadow, which is what drifted', () => {
    for (const marker of ['dark-glass-media', 'dark-glass-attr']) {
      const shade1 = declarationsIn(marker).get('--lucet-shade-1')
      expect(shade1, `${marker} --lucet-shade-1`).toMatch(/^0 0\.5px 0 /)
    }
  })
})
