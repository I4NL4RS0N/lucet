/**
 * The overlay test, as a permanent gate: PAPER AND GLASS SHARE EVERY
 * MEASUREMENT. The expression axis is material — switching may move
 * NOTHING. This audit renders the Konfabulator (all three container
 * views) and the components stage in both expressions and diffs every
 * element's box. Any positional difference is a bug; any element present
 * in one and missing in the other is the old failure mode (Glass losing
 * content rather than restyling it) and fails the same way.
 *
 * Rects are compared at 0.5px tolerance (subpixel paint rounding).
 * Geometry is theme-independent by construction, so one theme suffices.
 */

import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const DEV_PORT = 4347

const collect = () =>
  [...document.querySelectorAll('body *')]
    .filter((el) => {
      /* The appearance controls themselves display the current VALUE —
         the Expression select reads "paper" in one and "glass" in the
         other, and the two words render 2px apart. Content difference,
         not a style leak; the pickers are excluded. */
      if (el.closest('.cfg__prefs')) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 || r.height > 0
    })
    .map((el) => {
      const r = el.getBoundingClientRect()
      const path = []
      let node = el
      while (node && node !== document.body) {
        const parent = node.parentElement
        const idx = parent ? [...parent.children].indexOf(node) : 0
        path.unshift(`${node.tagName}:${idx}`)
        node = parent
      }
      return { key: path.join('>'), x: r.x, y: r.y, w: r.width, h: r.height }
    })

async function snapshot(page, expression, view) {
  await page.evaluate((expr) => {
    localStorage.setItem(
      'lucet-docs-appearance',
      JSON.stringify({
        theme: 'dark',
        expression: expr,
        accent: 'violet',
        neutral: 'accent',
        radius: 'default',
        scale: '100',
        typeface: 'inter',
      }),
    )
  }, expression)
  await page.reload({ waitUntil: 'networkidle' })
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  })
  await page.evaluate(() => document.fonts.ready)
  if (view) {
    await page.getByRole('button', { name: view, exact: true }).click()
    await page.waitForTimeout(200)
  }
  return page.evaluate(collect)
}

function diff(paper, glass, where, failures) {
  const gm = new Map(glass.map((e) => [e.key, e]))
  const pm = new Map(paper.map((e) => [e.key, e]))
  for (const p of paper) {
    const g = gm.get(p.key)
    if (!g) {
      failures.push(`${where}  element in Paper only: ${p.key.split('>').slice(-3).join('>')}`)
      continue
    }
    for (const axis of ['x', 'y', 'w', 'h']) {
      if (Math.abs(p[axis] - g[axis]) > 0.5) {
        failures.push(
          `${where}  ${p.key.split('>').slice(-3).join('>')} moved: ${axis} ${p[axis].toFixed(1)} -> ${g[axis].toFixed(1)}`,
        )
        break
      }
    }
  }
  for (const g of glass) {
    if (!pm.has(g.key))
      failures.push(`${where}  element in Glass only: ${g.key.split('>').slice(-3).join('>')}`)
  }
}

async function main() {
  const dev = spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], {
    cwd: 'apps/docs',
    stdio: 'ignore',
  })
  const browser = await chromium.launch()
  const failures = []
  let elements = 0

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    let reached = false
    for (let i = 0; i < 40 && !reached; i++) {
      try {
        await page.goto(`http://localhost:${DEV_PORT}/index.html`, { timeout: 2000 })
        reached = true
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    if (!reached) throw new Error('dev server never came up')

    for (const view of ['Full page', 'Drawer', 'Mobile']) {
      const paper = await snapshot(page, 'paper', view)
      const glass = await snapshot(page, 'glass', view)
      elements += paper.length
      diff(paper, glass, `konfabulator/${view}`, failures)
    }

    await page.goto(`http://localhost:${DEV_PORT}/components.html`, { waitUntil: 'networkidle' })
    const paperC = await snapshot(page, 'paper', null)
    const glassC = await snapshot(page, 'glass', null)
    elements += paperC.length
    diff(paperC, glassC, 'components', failures)
  } finally {
    await browser.close()
    dev.kill()
  }

  if (elements < 800) {
    throw new Error(`geometry audit collected only ${elements} elements -- the pages and its collector drifted apart`)
  }
  if (failures.length > 0) {
    console.error(`\nExpression geometry FAILED: ${failures.length} difference(s) between Paper and Glass.\n`)
    for (const f of failures.slice(0, 20)) console.error(`  ${f}`)
    if (failures.length > 20) console.error(`  ...and ${failures.length - 20} more`)
    process.exit(1)
  }
  console.log(
    `Expression geometry passed: ${elements} elements identical between Paper and Glass across four surfaces.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
