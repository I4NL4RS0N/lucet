/**
 * Visual QA capture: one command, deterministic screenshots of all three
 * pages across the appearance axes that change the design.
 *
 *   node scripts/capture-shots.mjs        (expects packages built)
 *
 * Boots the docs dev server on :4346, captures, shuts it down. Output goes
 * to shots/ (gitignored — artifacts, not source).
 *
 * THE MATRIX — one variable at a time from a single baseline, not the
 * cross-product (36+ shots per page, most telling nothing):
 *
 *   baseline    dark  · system     · violet     · 1440
 *   theme       light · system     · violet     · 1440   (flip theme)
 *   expression  dark  · expressive · violet     · 1440   (flip expression)
 *   accent      dark  · system     · monochrome · 1440   (flip accent)
 *   tablet      dark  · system     · violet     ·  768   (flip viewport)
 *   phone       dark  · system     · violet     ·  320   (flip viewport)
 *
 * The baseline is the site's resting look (dark/violet). Every variant
 * differs from it in exactly one axis, so any visual difference in a pair
 * of shots is attributable to that axis. Light/expressive/monochrome at
 * other widths, or combined, are deliberately not captured.
 *
 * Appearance is set by writing `lucet-docs-appearance` into localStorage
 * before first paint — the same key and shape the shells' pre-paint boot
 * script reads. No screenshot-only query API.
 *
 * Long pages are captured PER SECTION (.sec), named to sort:
 *   primitives__01-button__dark-system-1440.png
 * The accent token appears in the name only when it is the flipped axis.
 * The Konfabulator is one screen, so it gets one viewport shot per combo.
 *
 * Determinism: prefers-reduced-motion is emulated (the design's own
 * static forms apply) and any literal-duration animation left is killed
 * outright; fonts are awaited before every shot.
 */

import { mkdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const DEV_PORT = 4346
const OUT = 'shots'

const COMBOS = [
  { name: 'dark-system-1440', theme: 'dark', expression: 'system', accent: 'violet', width: 1440 },
  { name: 'light-system-1440', theme: 'light', expression: 'system', accent: 'violet', width: 1440 },
  { name: 'dark-expressive-1440', theme: 'dark', expression: 'expressive', accent: 'violet', width: 1440 },
  { name: 'dark-system-1440-monochrome', theme: 'dark', expression: 'system', accent: 'monochrome', width: 1440 },
  { name: 'dark-system-768', theme: 'dark', expression: 'system', accent: 'violet', width: 768 },
  { name: 'dark-system-320', theme: 'dark', expression: 'system', accent: 'violet', width: 320 },
  /* The expression matrix in full: an axis that only reads on desktop
     is not one, and light is where Expressive has the least to work
     with (spec: verify both expressions at three widths, both themes). */
  { name: 'light-expressive-1440', theme: 'light', expression: 'expressive', accent: 'violet', width: 1440 },
  { name: 'dark-expressive-768', theme: 'dark', expression: 'expressive', accent: 'violet', width: 768 },
  { name: 'dark-expressive-320', theme: 'dark', expression: 'expressive', accent: 'violet', width: 320 },
  { name: 'light-expressive-768', theme: 'light', expression: 'expressive', accent: 'violet', width: 768 },
  { name: 'light-expressive-320', theme: 'light', expression: 'expressive', accent: 'violet', width: 320 },
]

const PAGES = [
  { file: 'index.html', slug: 'konfabulator', sectioned: false },
  { file: 'primitives.html', slug: 'primitives', sectioned: true },
  { file: 'components.html', slug: 'components', sectioned: true },
]

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/—.*$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

async function main() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const dev = spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], {
    cwd: 'apps/docs',
    stdio: 'ignore',
  })
  const browser = await chromium.launch()
  let shots = 0

  try {
    const probe = await browser.newPage()
    let reached = false
    for (let i = 0; i < 40 && !reached; i++) {
      try {
        await probe.goto(`http://localhost:${DEV_PORT}/`, { timeout: 2000 })
        reached = true
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    await probe.close()
    if (!reached) throw new Error('dev server never came up')

    for (const combo of COMBOS) {
      const context = await browser.newContext({
        viewport: { width: combo.width, height: 900 },
        reducedMotion: 'reduce',
      })
      await context.addInitScript(
        ({ theme, accent, expression }) => {
          localStorage.setItem(
            'lucet-docs-appearance',
            JSON.stringify({
              theme,
              accent,
              expression,
              neutral: 'accent',
              radius: 'default',
              scale: '100',
              typeface: 'inter',
            }),
          )
        },
        combo,
      )
      const page = await context.newPage()
      for (const p of PAGES) {
        await page.goto(`http://localhost:${DEV_PORT}/${p.file}`, { waitUntil: 'networkidle' })
        /* Belt over the reduced-motion braces: literal-duration animations
           (the caret blink on the streaming fixture) die outright. */
        await page.addStyleTag({
          content: [
            '*, *::before, *::after { animation: none !important; transition: none !important; }',
            /* Scroll-DRIVEN animations are position-based, not time-based:
               deterministic, and they carry the scroll-fade cue the review
               needs to see. The blanket kill above must not erase them. */
            '@supports (animation-timeline: scroll()) {',
            '  .cfg__scroll, .cfg__rail-flow {',
            '    animation: cfg-scroll-fade linear both !important;',
            '    animation-timeline: scroll(self block) !important;',
            '  }',
            '}',
          ].join('\n'),
        })
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(150)

        if (!p.sectioned) {
          await page.screenshot({ path: `${OUT}/${p.slug}__${combo.name}.png` })
          shots++
          continue
        }
        await page.waitForSelector('.sec', { timeout: 15000 })
        const count = await page.locator('.sec').count()
        for (let i = 0; i < count; i++) {
          const sec = page.locator('.sec').nth(i)
          const name = slugify(await sec.locator('.sec__name').innerText())
          await sec.scrollIntoViewIfNeeded()
          await page.waitForTimeout(30)
          await sec.screenshot({
            path: `${OUT}/${p.slug}__${String(i + 1).padStart(2, '0')}-${name}__${combo.name}.png`,
          })
          shots++
        }
      }
      await context.close()
    }
  } finally {
    await browser.close()
    dev.kill()
  }
  console.log(`captured ${shots} shots into ${OUT}/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
