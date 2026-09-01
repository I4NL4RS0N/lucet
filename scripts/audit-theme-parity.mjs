/**
 * Theme parity: the two ways of reaching a theme must produce the same tokens.
 *
 * Dark is declared twice throughout the stylesheets -- once under
 * prefers-color-scheme for people who never touch a toggle, once under
 * [data-theme] for people who do -- because CSS gives no way to share one
 * declaration body across a media query and an attribute selector. Five files
 * do this: accent-scale, materials, semantic, surfaces, tones.
 *
 * Hand-duplicated blocks drift. materials.css already did: the contact shadow
 * that gives Expressive its thickness lived only in the media-query copy, so
 * the toggle path -- the one the Konfabulator actually uses -- rendered flat.
 *
 * Nothing else catches this class of bug. The contrast audit measures colour,
 * and the two paths are identical in colour. The eye cannot either, because the
 * two paths never render side by side.
 *
 * scripts/materials.test.mjs guards materials.css by comparing SOURCE text.
 * This guards all five by comparing what actually RENDERS, which is stronger:
 * it reads every --lucet-* custom property off :root down both paths and
 * asserts they resolve identically, so it catches cascade and specificity
 * drift that source comparison cannot see.
 */

import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { flattenBackground, oklabLightness } from './contrast.mjs'

const EXPRESSIONS = ['paper', 'glass']
const ACCENTS = [
  'monochrome', 'slate', 'blue', 'indigo', 'violet', 'magenta',
  'rose', 'amber', 'green', 'teal', 'cyan',
]

const PORT = 4342
const URL = process.env.AUDIT_URL ?? `http://localhost:${PORT}/`

/**
 * Every --lucet-* custom property resolved on :root.
 *
 * Read from the stylesheets rather than guessed, because a property only shows
 * up in getComputedStyle if you already know its name.
 */
function dumpTokens() {
  const names = new Set()
  for (const sheet of document.styleSheets) {
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    const walk = (list) => {
      for (const rule of list ?? []) {
        if (rule.style) for (const p of rule.style) if (p.startsWith('--lucet-')) names.add(p)
        if (rule.cssRules) walk(rule.cssRules)
      }
    }
    walk(rules)
  }
  const cs = getComputedStyle(document.documentElement)
  const out = {}
  for (const n of [...names].sort()) out[n] = cs.getPropertyValue(n).trim().replace(/\s+/g, ' ')
  return out
}

async function main() {
  const preview = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: 'apps/docs', stdio: 'ignore' },
  )
  const browser = await chromium.launch()
  const failures = []
  const roleFailures = []
  let compared = 0

  /*
   * ROLE DISTINCTNESS.
   *
   * Parity proves a theme is the same down both paths. It does not prove the
   * theme is any good -- and it happily passed while --lucet-hover was the same
   * value as --lucet-secondary in both themes, which made hover a no-op on
   * every secondary control in the library. muted sat on secondary too, and
   * subtle on card, so a field and a raised control were one colour and a quiet
   * surface and a card were another.
   *
   * A role that resolves to another role's value is not a role. These pairs
   * must differ, and by enough to see.
   */
  /*
   * Each pair carries the SURFACE it is judged over. The hover tokens are
   * translucent ink now, so their lightness only exists once they are
   * composited over something -- and the honest something is the surface the
   * role actually acts on. Opaque pairs pass through compositing unchanged,
   * so one rule covers both kinds.
   *
   * border/input joined the list after the fifth collision of this exact
   * kind: both resolved to --lucet-line in every theme, so "line-strong" was
   * a fiction -- the Separator specimen showed Default and Strong as two
   * identical rules and nobody could see the difference because there was
   * none.
   */
  const DISTINCT = [
    ['--lucet-secondary', '--lucet-hover', 0.02, '--lucet-secondary'],
    ['--lucet-hover', '--lucet-hover-strong', 0.015, '--lucet-secondary'],
    ['--lucet-hover', '--lucet-press', 0.015, '--lucet-secondary'],
    ['--lucet-muted', '--lucet-secondary', 0.015, null],
    ['--lucet-card', '--lucet-subtle', 0.01, null],
    ['--lucet-border', '--lucet-input', 0.02, '--lucet-card'],
  ]

  /*
   * Resolve tokens to CONCRETE colours by painting them: a probe div's
   * computed backgroundColor is the browser's own evaluation of the token,
   * color-mix and all. Reading the custom property returns the unresolved
   * expression, which cannot be compared numerically.
   */
  function resolveDistinctColors(names) {
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    const out = {}
    for (const n of names) {
      probe.style.backgroundColor = ''
      probe.style.backgroundColor = `var(${n})`
      out[n] = getComputedStyle(probe).backgroundColor
    }
    probe.remove()
    return out
  }
  const DISTINCT_NAMES = [...new Set(DISTINCT.flatMap(([a, b, , base]) => [a, b, base]).filter(Boolean))]

  /*
   * SURFACES ARE NOT ON THIS LIST, and that is deliberate.
   *
   * background, card and popover are all pure white in Light + System, and the
   * first version of this check failed them. It was wrong to. That expression's
   * stated position is that depth is a LINE -- a card is defined by its
   * hairline, not by a fill -- and Light + Expressive already recedes the page
   * so cards can come forward. An overlay above a white card cannot be lighter
   * than white either; separating it is the overlay material's job.
   *
   * So the rule is scoped to what is universally true: an INTERACTION state
   * must differ from the state it acts on. A hover that computes to its own
   * resting colour is broken in every expression, at every elevation.
   *
   * ...AND IN GLASS, SURFACES ARE ON THE LIST (addendum, 2026-09-01, the
   * Paper/Glass axis). Glass has no borders: adjacent surface levels
   * separate by value or they do not separate at all. The exact
   * complement of the exception above, checked only under
   * data-expression=glass, both themes.
   */
  /* The minimums grew with the ladder (the "make Glass commit" pass):
   * the first cut proved 0.012 steps EXIST but not that they READ, and
   * dark Glass sat nearly on Paper's values. These floors encode the
   * widened ladder — page, well, card, and overlay each a stride apart —
   * so a future tweak cannot quietly converge the two expressions. */
  const GLASS_DISTINCT = [
    ['--lucet-background', '--lucet-card', 0.05],
    ['--lucet-card', '--lucet-popover', 0.025],
    ['--lucet-card', '--lucet-surface-sunken', 0.06],
    ['--lucet-background', '--lucet-surface-sunken', 0.015],
  ]



  try {
    const page = await browser.newPage()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (let i = 0; i < 40; i++) {
      try {
        await page.goto(URL, { timeout: 2000 })
        break
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    await page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
    })

    for (const theme of ['dark', 'light']) {
      for (const expression of EXPRESSIONS) {
        for (const accent of ACCENTS) {
          // Path A: the explicit attribute. Media preference set to the
          // OPPOSITE, so a token that only exists in the media block cannot
          // leak in and mask a difference.
          await page.emulateMedia({ colorScheme: theme === 'dark' ? 'light' : 'dark' })
          await page.evaluate(
            ({ theme, expression, accent }) => {
              const r = document.documentElement
              r.setAttribute('data-theme', theme)
              r.setAttribute('data-expression', expression)
              r.setAttribute('data-accent', accent)
            },
            { theme, expression, accent },
          )
          const viaAttribute = await page.evaluate(dumpTokens)
          // Resolved HERE, while the attribute path is live: the pairs are
          // judged against the same state the dump describes.
          const resolvedDistinct =
            accent === ACCENTS[0] && expression === EXPRESSIONS[0]
              ? await page.evaluate(resolveDistinctColors, DISTINCT_NAMES)
              : null

          // Path B: the OS preference, with no attribute to override it.
          await page.emulateMedia({ colorScheme: theme })
          await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))
          const viaPreference = await page.evaluate(dumpTokens)

          if (resolvedDistinct) {
            const resolved = resolvedDistinct
            for (const [a, b, min] of expression === 'glass' ? GLASS_DISTINCT : []) {
              const la = oklabLightness(flattenBackground([resolved[a], 'rgb(255, 255, 255)']))
              const lb = oklabLightness(flattenBackground([resolved[b], 'rgb(255, 255, 255)']))
              const delta = la !== null && lb !== null ? Math.abs(la - lb) : null
              if (delta === null || delta < min - 0.0005) {
                roleFailures.push({ theme: `${theme}/glass`, a, b, av: resolved[a], bv: resolved[b], delta: delta?.toFixed(3) ?? 'n/a', min })
              }
            }
            for (const [a, b, min, base] of DISTINCT) {
              const av = viaAttribute[a]
              const bv = viaAttribute[b]
              const under = base ? [resolved[base], 'rgb(255, 255, 255)'] : ['rgb(255, 255, 255)']
              const la = oklabLightness(flattenBackground([resolved[a], ...under]))
              const lb = oklabLightness(flattenBackground([resolved[b], ...under]))
              const delta = la !== null && lb !== null ? Math.abs(la - lb) : null
              // A pair may sit exactly at its minimum by design; the sRGB
              // roundtrip costs ~1e-4 of L, so the comparison carries that
              // tolerance rather than failing on float noise.
              if (av === bv || delta === null || delta < min - 0.0005) {
                roleFailures.push({ theme, a, b, av, bv, delta: delta?.toFixed(3) ?? 'n/a', min })
              }
            }
          }

          compared += 1
          for (const name of Object.keys(viaAttribute)) {
            if (viaAttribute[name] !== viaPreference[name]) {
              failures.push({
                combo: `${theme} / ${expression} / ${accent}`,
                token: name,
                viaAttribute: viaAttribute[name],
                viaPreference: viaPreference[name],
              })
            }
          }
        }
      }
    }
  } finally {
    await browser.close()
    preview.kill()
  }

  if (failures.length > 0) {
    console.error(`\nTheme parity FAILED: ${failures.length} token(s) differ by path.\n`)
    // Group by token: one drifted declaration usually shows up across many
    // combos, and listing it once per combo buries the actual cause.
    const byToken = new Map()
    for (const f of failures) {
      if (!byToken.has(f.token)) byToken.set(f.token, [])
      byToken.get(f.token).push(f)
    }
    for (const [token, list] of byToken) {
      const first = list[0]
      console.error(`  ${token}  (${list.length} combo${list.length === 1 ? '' : 's'}, e.g. ${first.combo})`)
      console.error(`    [data-theme]           ${first.viaAttribute}`)
      console.error(`    prefers-color-scheme   ${first.viaPreference}`)
      console.error('')
    }
    console.error('A theme must not depend on how the reader arrived at it.')
    console.error('Fix the two copies so they declare the same values.\n')
    process.exit(1)
  }

  console.log(
    `Theme parity passed: ${compared} combinations, both paths identical on every --lucet-* token.`,
  )

  if (roleFailures.length > 0) {
    console.error(`\nRole distinctness FAILED: ${roleFailures.length} pair(s) collide.\n`)
    for (const f of roleFailures) {
      console.error(`  ${f.theme}  ${f.a} and ${f.b}`)
      console.error(`    ${f.av}`)
      console.error(`    ${f.bv}`)
      console.error(`    lightness apart: ${f.delta} (needs ${f.min})\n`)
    }
    console.error('A role that resolves to another role\'s value is not a role.\n')
    process.exit(1)
  }
  console.log(
    `Role distinctness passed: ${DISTINCT.length} pairs apart in both themes; ${GLASS_DISTINCT.length} glass surface steps read without borders.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
