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

const EXPRESSIONS = ['system', 'expressive']
const ACCENTS = [
  'gray', 'slate', 'blue', 'indigo', 'violet', 'magenta',
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
  let compared = 0

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

          // Path B: the OS preference, with no attribute to override it.
          await page.emulateMedia({ colorScheme: theme })
          await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))
          const viaPreference = await page.evaluate(dumpTokens)

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
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
