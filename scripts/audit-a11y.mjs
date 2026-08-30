/**
 * WCAG 2.2 AA audit, across the whole appearance matrix.
 *
 * WHY THIS DRIVES A REAL BROWSER
 *
 * It would be cheaper to parse the token files and do the maths. It would also
 * have missed three of the four failures found by hand:
 *
 *   - a gradient overlay lightening a button under its own label
 *   - a theme block outranking an accent's curve on specificity
 *   - a focus indicator that never appeared because one rule outranked another
 *
 * All three are cascade or paint behaviour. Only a browser resolving the real
 * cascade sees them, so the audit renders the real Sheet and reads back what is
 * actually painted.
 *
 * Colour maths lives in ./contrast.mjs, which is unit tested separately: the
 * audit reads colours out of the page and computes nothing itself.
 */

import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { AA_NON_TEXT, AA_TEXT, MIN_TARGET_PX, contrastRatio } from './contrast.mjs'

const THEMES = ['light', 'dark']
const EXPRESSIONS = ['system', 'expressive']
const ACCENTS = [
  'monochrome', 'slate', 'blue', 'indigo', 'violet', 'magenta',
  'rose', 'amber', 'green', 'teal', 'cyan',
]

const PORT = 4341
const DEV_PORT = 4343
const URL = process.env.AUDIT_URL ?? `http://localhost:${PORT}/`

/** Collects raw colour strings and geometry. No maths happens in here. */
function collect() {
  const bgOf = (el) => {
    let node = el
    while (node) {
      const c = getComputedStyle(node).backgroundColor
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c
      node = node.parentElement
    }
    return 'rgb(255, 255, 255)'
  }

  const text = []
  const nonText = []
  const targets = []

  const add = (list, label, fg, bg) => list.push({ label, fg, bg })

  for (const el of document.querySelectorAll('.lucet-notice')) {
    add(text, `notice:${el.dataset.state}`, getComputedStyle(el).color, bgOf(el))
  }
  for (const el of document.querySelectorAll('.lucet-tool')) {
    add(text, `tool:${el.dataset.status}`, getComputedStyle(el).color, bgOf(el))
  }
  for (const [label, sel] of Object.entries({
    body: 'body',
    'muted note': '.sheet__note',
    'reasoning summary': '.lucet-reasoning__summary',
    'message author': '.lucet-message__author',
    'tool status label': '.lucet-tool__status',
    'version marker': '.lucet-message__version',
    'control label': '.control__label',
    'segment (unselected)': '.segment input:not(:checked) + span',
  })) {
    const el = document.querySelector(sel)
    if (el) add(text, label, getComputedStyle(el).color, bgOf(el))
  }

  // The primary button is measured at its base AND at every gradient stop,
  // because the lightest stop is what sits under the label.
  const primary = [...document.querySelectorAll('.lucet-button[data-variant="primary"]')]
    .find((b) => !b.disabled)
  if (primary) {
    const cs = getComputedStyle(primary)
    add(text, 'primary button (base)', cs.color, cs.backgroundColor)
    const stops = cs.backgroundImage.match(/oklch\([^)]+\)|oklab\([^)]+\)|rgba?\([^)]+\)/g) ?? []
    stops.forEach((stop, i) => add(text, `primary button (gradient stop ${i})`, cs.color, stop))
  }

  for (const el of document.querySelectorAll('.lucet-button, .control__field select, .segment')) {
    const r = el.getBoundingClientRect()
    if (r.width && r.height && (r.width < 24 || r.height < 24)) {
      targets.push({ label: el.textContent.trim().slice(0, 20) || el.tagName, w: Math.round(r.width), h: Math.round(r.height) })
    }
  }

  return { text, nonText, targets }
}

/**
 * Focus has to be driven through Playwright, not element.focus() inside the
 * page: in headless Chromium an in-page focus() does not activate the document,
 * so :focus-within never matches and the audit reports a phantom "no focus
 * indicator" for every combination.
 */
async function probeFocus(page) {
  const composer = page.locator('.lucet-composer').first()
  const field = composer.locator('textarea').first()
  const read = () =>
    composer.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { shadow: cs.boxShadow, border: cs.borderColor, outline: cs.outlineStyle, bg: cs.backgroundColor }
    })

  // Start from a known-unfocused state. Without this the previous iteration's
  // focus leaks into `before`, `changed` comes out false, and the audit reports
  // a missing indicator that is actually present.
  const clearFocus = () =>
    page.evaluate(() => {
      const el = document.activeElement
      if (el instanceof HTMLElement) el.blur()
    })

  await clearFocus()
  await page.waitForTimeout(20)
  const before = await read()

  await field.focus()
  await page.waitForTimeout(20)
  const after = await read()

  await clearFocus()

  const changed =
    after.shadow !== before.shadow ||
    after.border !== before.border ||
    after.outline !== before.outline

  // The indicator is a border in System and a shadow in Expressive, so read
  // whichever actually moved.
  const pick = /oklch\([^)]+\)|oklab\([^)]+\)|rgba?\([^)]+\)/
  const ring =
    after.border !== before.border ? after.border : ((after.shadow.match(pick) ?? [])[0] ?? null)

  return { changed, ring, surface: after.bg }
}


/**
 * The primitives page has none of the docs site's classes, so collect() found
 * exactly one element there -- body -- and the pass reported two checks on a
 * page with twenty-five sections. A collector keyed to one page's markup is a
 * collector that silently stops working when pointed at another.
 *
 * Disabled controls are skipped throughout: 1.4.3 exempts them, and measuring
 * them would force the palette to keep a disabled state legible enough to look
 * enabled.
 */
function collectPrimitives() {
  const bgOf = (el) => {
    let node = el
    while (node) {
      const c = getComputedStyle(node).backgroundColor
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c
      node = node.parentElement
    }
    return 'rgb(255, 255, 255)'
  }

  const text = []
  const targets = []
  const isOff = (el) =>
    el.closest('[disabled], .is-disabled') !== null ||
    el.matches('[disabled], .is-disabled') ||
    (el.querySelector && el.querySelector('input:disabled') !== null)

  const TEXT = {
    'page body': '.prim',
    lede: '.prim__lede',
    'section note': '.sec__note',
    'spec label': '.spec__label',
    'state label': '.states__label',
    prose: '.prose',
    'prose heading': '.prose h3',
    'inline code': '.prose code',
    link: '.link',
    kbd: 'kbd',
    'menu item': '.menu__item',
    'menu shortcut': '.menu__item kbd',
    'disclosure head': '.disc__head',
    'disclosure meta': '.disc__meta',
    'disclosure body': '.disc__body',
    'dialog title': '.dialog__title',
    'dialog body': '.dialog__body',
    'codeblock bar': '.codeblock__bar',
    'codeblock body': '.codeblock pre',
    tooltip: '.tip',
    'meter readout': '.meter-row span',
    'orb label': '.orb-row__label',
    'orb elapsed': '.orb-row__time',
    'segment selected': '.seg input:checked + span',
    'segment unselected': '.seg input:not(:checked) + span',
    'field value': '.field',
    avatar: '.avatar',
  }
  for (const [label, sel] of Object.entries(TEXT)) {
    const el = [...document.querySelectorAll(sel)].find((e) => !isOff(e))
    if (el) text.push({ label, fg: getComputedStyle(el).color, bg: bgOf(el) })
  }

  // Every button variant, and every badge, measured on its own fill.
  for (const el of document.querySelectorAll('.btn')) {
    if (isOff(el)) continue
    const cs = getComputedStyle(el)
    const variant = [...el.classList].find((c) => c.startsWith('btn--')) ?? 'btn'
    const state = [...el.classList].find((c) => c.startsWith('is-')) ?? 'rest'
    text.push({ label: `button ${variant} ${state}`, fg: cs.color, bg: bgOf(el) })
  }
  for (const el of document.querySelectorAll('.badge')) {
    const cs = getComputedStyle(el)
    const variant = [...el.classList].find((c) => c.startsWith('badge--')) ?? 'badge'
    text.push({ label: `badge ${variant}`, fg: cs.color, bg: bgOf(el) })
  }

  /*
   * 2.5.8, measured HONESTLY.
   *
   * A bounding box is not the target. The small controls extend their hit area
   * with an absolutely-positioned pseudo-element, which getBoundingClientRect
   * cannot see -- so the first version of this check reported every checkbox in
   * the states rows as 17px wide when the thing you can actually click is 40.
   *
   * The effective target is the larger of the element's own box and any hit-area
   * pseudo-element it or its control child declares. Under-reporting a target
   * would be a false failure; over-reporting one would hide a real one, so both
   * halves are measured rather than assumed.
   */
  const pseudoBox = (el) => {
    let best = { w: 0, h: 0 }
    const nodes = [el, el.querySelector('.check__box'), el.querySelector('.switch__track')]
    for (const n of nodes) {
      if (!n) continue
      for (const pe of ['::before', '::after']) {
        const cs = getComputedStyle(n, pe)
        if (cs.content === 'none') continue
        const w = parseFloat(cs.width)
        const h = parseFloat(cs.height)
        if (Number.isFinite(w) && Number.isFinite(h) && w * h > best.w * best.h) best = { w, h }
      }
    }
    return best
  }

  for (const el of document.querySelectorAll('.btn, .seg label, .check, .switch, .select select')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const p = pseudoBox(el)
    const w = Math.max(r.width, p.w)
    const h = Math.max(r.height, p.h)
    if (w < 24 || h < 24) {
      targets.push({
        label: el.textContent.trim().slice(0, 20) || el.className,
        w: Math.round(w),
        h: Math.round(h),
      })
    }
  }

  return { text, targets }
}

async function main() {
  const preview = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: 'apps/docs', stdio: 'ignore' },
  )
  const browser = await chromium.launch()
  const failures = []
  let checks = 0

  try {
    const page = await browser.newPage()

    /*
     * Freeze all motion before measuring anything.
     *
     * getComputedStyle returns the CURRENT animated value, so reading a colour
     * immediately after focus returns the mid-transition value, not the target.
     * That produced a phantom "no visible focus indicator" for every System
     * combination while the CSS was entirely correct. An audit that animates is
     * an audit that lies.
     */
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (let i = 0; i < 40; i++) {
      try {
        await page.goto(URL, { timeout: 2000 })
        break
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    // Belt and braces. emulateMedia alone relies on the page honouring the
    // preference; this guarantees it, because getComputedStyle returns the
    // CURRENT animated value and a moving value is an unmeasurable one.
    await page.addStyleTag({
      content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
    })

    // The Sheet renders every component in every state, which is exactly the
    // surface the audit needs.
    // The segment's input overlays its label by design, so target the control
    // itself rather than the text on top of it.
    await page.getByRole('radio', { name: 'Sheet' }).check()
    await page.waitForTimeout(400)

    for (const theme of THEMES) {
      for (const expression of EXPRESSIONS) {
        for (const accent of ACCENTS) {
          await page.evaluate(
            ({ theme, expression, accent }) => {
              const root = document.documentElement
              root.setAttribute('data-theme', theme)
              root.setAttribute('data-expression', expression)
              root.setAttribute('data-accent', accent)
            },
            { theme, expression, accent },
          )
          await page.waitForTimeout(80)

          const where = `${theme}/${expression}/${accent}`
          const { text, targets } = await page.evaluate(collect)
          const focus = await probeFocus(page)

          for (const { label, fg, bg } of text) {
            checks++
            const ratio = contrastRatio(fg, bg)
            if (ratio === null) {
              failures.push(`${where}  ${label}: could not resolve (${fg} on ${bg})`)
            } else if (ratio < AA_TEXT) {
              failures.push(
                `${where}  ${label}: ${ratio}:1 (needs ${AA_TEXT}, 1.4.3)\n      ${fg} on ${bg}`,
              )
            }
          }

          if (focus) {
            checks += 2
            if (!focus.changed) {
              failures.push(`${where}  composer: no visible focus indicator (2.4.7)`)
            }
            const ring = contrastRatio(focus.ring, focus.surface)
            if (ring !== null && ring < AA_NON_TEXT) {
              failures.push(
                `${where}  focus ring: ${ring}:1 (needs ${AA_NON_TEXT}, 1.4.11)\n      ${focus.ring} on ${focus.surface}`,
              )
            }
          }

          for (const t of targets) {
            checks++
            failures.push(`${where}  target "${t.label}" is ${t.w}x${t.h} (needs ${MIN_TARGET_PX}, 2.5.8)`)
          }
        }
      }
    }

    /*
     * THE PRIMITIVES PAGE, unaudited until it shipped a white label on a pale
     * red destructive button at 1.72:1.
     *
     * It is dev-only and never deployed, so it is easy to argue it does not
     * need auditing. Wrong twice over: it is where the look is decided BEFORE
     * anything is promoted into the library, and it is the only place every
     * control appears in every state at once. A failure there becomes a failure
     * everywhere, one promotion later.
     *
     * It needs a DEV server rather than the preview, because the page is
     * deliberately absent from the production build -- `vite preview` answers
     * /primitives.html with the SPA fallback, so the pass would measure the
     * docs site instead and report a green audit that audited nothing.
     */
    const dev = spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], {
      cwd: 'apps/docs',
      stdio: 'ignore',
    })
    let primitivesChecks = 0
    try {
      let reached = false
      for (let i = 0; i < 40; i++) {
        try {
          await page.goto(`http://localhost:${DEV_PORT}/primitives.html`, { timeout: 2000 })
          reached = true
          break
        } catch {
          await new Promise((r) => setTimeout(r, 500))
        }
      }
      if (!reached) throw new Error('primitives dev server never came up')

      await page.waitForSelector('.sec', { timeout: 15000 })
      await page.addStyleTag({
        content:
          '*, *::before, *::after { transition: none !important; animation: none !important; }',
      })

      for (const theme of THEMES) {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
        await page.waitForTimeout(120)

        const where = `primitives/${theme}`
        const { text, targets } = await page.evaluate(collectPrimitives)
        primitivesChecks += text.length + targets.length

        for (const { label, fg, bg } of text) {
          checks++
          const ratio = contrastRatio(fg, bg)
          if (ratio === null) {
            failures.push(`${where}  ${label}: could not resolve (${fg} on ${bg})`)
          } else if (ratio < AA_TEXT) {
            failures.push(
              `${where}  ${label}: ${ratio}:1 (needs ${AA_TEXT}, 1.4.3)\n      ${fg} on ${bg}`,
            )
          }
        }
        for (const t of targets) {
          checks++
          failures.push(
            `${where}  target "${t.label}" is ${t.w}x${t.h} (needs ${MIN_TARGET_PX}, 2.5.8)`,
          )
        }
      }
    } finally {
      dev.kill()
    }

    // A pass that measures nothing must never report success.
    if (primitivesChecks < 40) {
      throw new Error(
        `the primitives pass collected only ${primitivesChecks} elements across both themes -- ` +
          'it has stopped matching the page, which is how the first version reported two',
      )
    }
  } finally {
    await browser.close()
    preview.kill()
  }

  const combos = THEMES.length * EXPRESSIONS.length * ACCENTS.length
  if (failures.length) {
    console.error(`\nWCAG 2.2 AA audit FAILED\n${'-'.repeat(48)}`)
    for (const f of failures) console.error(`  ${f}`)
    console.error(`\n${failures.length} failure(s) across ${checks} checks in ${combos} combinations.\n`)
    process.exit(1)
  }
  console.log(`WCAG 2.2 AA audit passed: ${checks} checks across ${combos} combinations.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
