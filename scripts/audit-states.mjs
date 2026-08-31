/*
 * State-transition audit: drives a REAL pointer over every interactive control
 * on the primitives page and asserts the states actually happen.
 *
 * The contrast audit checks what each state looks like. This checks that the
 * state ARRIVES -- a different failure mode, and historically the more common
 * one: three separate hover bugs shipped while every static check was green,
 * because a dead hover computes to a perfectly legal colour. Measured with a
 * pointer, the page at its worst had a 5x spread in hover travel between
 * neighbouring controls, one hover that was invisible in light, a disabled
 * select that still reacted, and a hit area that removed a file when its
 * FILENAME was clicked.
 *
 * Assertions, per theme (and across every accent for the accent-coloured
 * controls):
 *
 *   1. Everything expected to respond must visibly respond: >= MIN_DL of
 *      composited-background travel, or a box-shadow / text colour /
 *      decoration change. Real hover via mouse, never a forced class.
 *   2. Everything disabled must change NOTHING under the pointer.
 *   3. A click at the centre of an attachment filename must hit the name,
 *      never the remove button (the hit-area pseudo-element regression).
 *   4. The disabled-checked checkbox stays FLAT (no inset shadow) and its
 *      tick stays >= 0.15 L from its own box.
 *
 * A run that finds too few probes fails: a selector that stops matching the
 * page must never report success.
 *
 * Usage: node scripts/audit-states.mjs [url]
 *        (default: spawns the docs dev server on :4344)
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { flattenBackground, oklabLightness } from './contrast.mjs'

const DEV_PORT = 4344
const URL_ARG = process.argv[2] ?? process.env.AUDIT_URL ?? null
const MIN_DL = 0.03
const ACCENTS = ['slate', 'blue', 'indigo', 'violet', 'magenta', 'rose', 'green', 'teal', 'cyan', 'amber']

/*
 * { sec, hover: selector within that section, probe: what to MEASURE (defaults
 *   to the hover target), part: label, expect: 'change' | 'none' }
 *
 * 'none' covers two different intents: disabled controls, and the segment
 * control's SELECTED cell, whose stillness under the pointer is a decision --
 * it is already at its destination -- rather than an omission. If that
 * decision is ever reversed, flip the expectation here with it.
 */
/*
 * The components stage gets its own probe set: the prompt input's small
 * controls are exactly the kind that die quietly (a ghost select, 18px chip
 * buttons, a tooltip that must APPEAR). Swept in both themes; the accent
 * sweep stays on the primitives page, which already proves the accent axis.
 */
const COMPONENT_PROBES = [
  { sec: 'The app, live', hover: '.lucet-prompt__tool', part: 'attach tool', bg: true },
  { sec: 'The app, live', hover: '.lucet-budget__button', part: 'budget meter trigger', bg: true },
  { sec: 'The app, live', hover: '[aria-label="Send"][disabled]', part: 'send disabled', expect: 'none' },
  { sec: 'Prompt input — every state', hover: '[aria-label="Send"]:not([disabled])', part: 'send enabled' },
  { sec: 'Prompt input — every state', hover: '[aria-label^="Try uploading"]', part: 'chip retry', bg: true },
  { sec: 'Prompt input — every state', hover: '.lucet-prompt__att [aria-label^="Remove"]', part: 'chip remove', bg: true },
  { sec: 'Prompt input — multiplayer', hover: 'button.lucet-button:not([disabled])', part: 'queue button' },
  { sec: 'Prompt input — streaming', hover: '.lucet-tipwrap button', part: 'stop button' },
  /* The tooltip must ARRIVE: hover the wrap, watch the tip's opacity. */
  { sec: 'Prompt input — streaming', hover: '.lucet-tipwrap', probe: '.lucet-tip', part: 'stop tooltip appears' },
  /* The reasoning row is a real control now; its veil must land like any
     other. (Its predecessor was a dead div that said "expand".) */
  { sec: 'Thread — every ending', hover: 'details.lucet-reasoning:not([data-streaming]) .lucet-reasoning__summary', part: 'reasoning summary', bg: true },
  { sec: 'Thread — every ending', hover: 'details.lucet-tool .lucet-tool__row--summary', part: 'tool summary', bg: true },
  { sec: 'Citations & sources', hover: '.lucet-sources__row--summary', part: 'source summary', bg: true },
  { sec: 'Scope control — the breadcrumb is the ladder', hover: '.lucet-scope__button', part: 'scope button', bg: true },
  { sec: 'Budget meter — the price before you spend it', hover: '.lucet-budget__button', part: 'budget trigger', bg: true },
  { sec: 'Suggestion chips — the cold start', hover: '.lucet-chips__chip:not(:disabled)', part: 'suggestion chip' },
  { sec: 'Suggestion chips — the cold start', hover: '.lucet-chips__chip:disabled', part: 'suggestion chip disabled', expect: 'none' },
  { sec: 'Thread — every ending', hover: '[data-latest] .lucet-actions__btn', part: 'message action', bg: true },
]

const PROBES = [
  { sec: 'Button', hover: '.row .btn--primary', part: 'primary' },
  { sec: 'Button', hover: '.row .btn:not([class*="--"])', part: 'secondary' },
  { sec: 'Button', hover: '.row .btn--ghost', part: 'ghost', bg: true },
  { sec: 'Button', hover: '.row .btn--danger', part: 'danger' },
  { sec: 'Button', hover: '.states .btn--primary[disabled]', part: 'primary disabled', expect: 'none' },
  { sec: 'Input', hover: 'input.field[placeholder]', part: 'empty field' },
  { sec: 'Input', hover: '.states input.field[disabled]', part: 'field disabled', expect: 'none' },
  { sec: 'Select', hover: '.row .select select', part: 'select' },
  { sec: 'Select', hover: '.states .select select[disabled]', part: 'select disabled', expect: 'none' },
  { sec: 'Checkbox', hover: '.row .check:nth-child(1)', probe: '.check__box', part: 'checkbox on' },
  { sec: 'Checkbox', hover: '.row .check:nth-child(2)', probe: '.check__box', part: 'checkbox off' },
  { sec: 'Checkbox', hover: '.states .check:has(input[disabled])', probe: '.check__box', part: 'checkbox disabled', expect: 'none' },
  { sec: 'Radio', hover: '.row .check:nth-child(2)', probe: '.check__box', part: 'radio unselected' },
  { sec: 'Radio', hover: '.states .check:has(input[disabled])', probe: '.check__box', part: 'radio disabled', expect: 'none' },
  { sec: 'Switch', hover: '.row .switch:nth-child(1)', probe: '.switch__track', part: 'switch on' },
  { sec: 'Switch', hover: '.row .switch:nth-child(2)', probe: '.switch__track', part: 'switch off' },
  { sec: 'Switch', hover: '.states .switch:has(input[disabled])', probe: '.switch__track', part: 'switch disabled', expect: 'none' },
  { sec: 'Segmented control', hover: '.seg[role="group"] label:nth-child(2)', probe: 'span', part: 'seg unselected', bg: true },
  { sec: 'Segmented control', hover: '.seg[role="group"] label:nth-child(1)', probe: 'span', part: 'seg selected', expect: 'none' },
  { sec: 'Avatar', hover: 'button.avatar:not([disabled])', part: 'avatar' },
  { sec: 'Avatar', hover: 'button.avatar[disabled]', part: 'avatar disabled', expect: 'none' },
  { sec: 'Menu', hover: '.menu__item:nth-child(2)', part: 'menu item', bg: true },
  { sec: 'Menu', hover: '.menu__item--danger', part: 'menu danger item', bg: true },
  { sec: 'Dialog', hover: '.dialog .btn--ghost', part: 'dialog ghost', bg: true },
  { sec: 'Dialog', hover: '.dialog .btn--danger', part: 'dialog danger' },
  { sec: 'Link', hover: '.link:not(.is-hover)', part: 'link' },
  { sec: 'Disclosure', hover: '.disc__head:not(.is-hover)', part: 'disc head', bg: true },
  { sec: 'Code', hover: '.codeblock__bar .btn', part: 'copy btn' },
  { sec: 'Attachments', hover: '.atts--inline .att:nth-child(1) .att__remove', part: 'att remove' },
  { sec: 'Attachments', hover: '.atts--list .att:not(.is-hover)', part: 'att row', bg: true },
  /* min 0.02: the row veil is DELIBERATELY half strength -- a full-width row
     is the largest hover surface on the page and the standard step read as a
     selection stripe. The floor drops with it; dead still fails. */
  { sec: 'Table', hover: 'tbody tr:nth-child(1)', probe: 'td', part: 'table row', bg: true, min: 0.02 },
]

/* Signals that count as a visible response. outlineColor is NOT here: it
   tracks currentColor on elements whose outline-style is none, so it changes
   without painting a pixel. opacity IS: it is how the tooltip arrives. */
const SIGNALS = ['boxShadow', 'color', 'textDecorationColor', 'opacity']
const STYLE_KEYS = ['backgroundColor', 'boxShadow', 'color', 'textDecorationColor', 'transform', 'opacity', 'scale']

async function snapshot(page, id, probeSel) {
  return page.evaluate(
    ([id, probeSel]) => {
      const host = document.querySelector(`[data-crit="${id}"]`)
      if (!host) return null
      const el = probeSel ? (host.querySelector(probeSel) ?? host) : host
      const cs = getComputedStyle(el)
      const out = {}
      for (const k of ['backgroundColor', 'boxShadow', 'color', 'textDecorationColor', 'transform', 'opacity', 'scale'])
        out[k] = cs[k]
      const chain = []
      let n = el
      while (n && n !== document.documentElement) {
        chain.push(getComputedStyle(n).backgroundColor)
        n = n.parentElement
      }
      chain.push(getComputedStyle(document.documentElement).backgroundColor)
      out.bgChain = chain
      return out
    },
    [id, probeSel ?? null],
  )
}

const effL = (chain) => {
  const flat = flattenBackground(chain)
  return flat === null ? null : oklabLightness(flat)
}

async function main() {
  let dev = null
  let url = URL_ARG
  const browser = await chromium.launch()
  const failures = []
  const warnings = []
  let checks = 0

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    if (!url) {
      dev = spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], {
        cwd: 'apps/docs',
        stdio: 'ignore',
      })
      url = `http://localhost:${DEV_PORT}/primitives.html`
    }
    let reached = false
    for (let i = 0; i < 40 && !reached; i++) {
      try {
        await page.goto(url, { timeout: 2000 })
        reached = true
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    if (!reached) throw new Error('primitives page never came up')
    await page.waitForSelector('.sec', { timeout: 15000 })

    const tagProbes = (list) =>
      page.evaluate((probes) => {
        for (const el of document.querySelectorAll('[data-crit]')) el.removeAttribute('data-crit')
        const secs = [...document.querySelectorAll('.sec')]
        const byName = (name) => secs.find((s) => s.querySelector('.sec__name')?.textContent === name)
        probes.forEach((p, i) => {
          const el = byName(p.sec)?.querySelector(p.hover)
          if (el) el.setAttribute('data-crit', String(i))
        })
      }, list)
    await tagProbes(PROBES)

    const setState = (theme, accent) =>
      page.evaluate(
        ([t, a]) => {
          document.documentElement.setAttribute('data-theme', t)
          document.documentElement.setAttribute('data-accent', a)
        },
        [theme, accent],
      )

    const sweep = async (theme, accent, probes, all = PROBES) => {
      await setState(theme, accent)
      await page.waitForTimeout(50)
      let found = 0
      for (let i = 0; i < all.length; i++) {
        const p = all[i]
        if (!probes.includes(p)) continue
        const where = `${theme}/${accent}`
        const loc = page.locator(`[data-crit="${i}"]`)
        if ((await loc.count()) === 0) {
          failures.push(`${where}  ${p.part}: probe selector matched nothing`)
          continue
        }
        found++
        checks++
        // Centre, never minimal: a minimal scroll can park the target under
        // the sticky bar, where a forced hover lands on the bar instead and
        // reads as a dead hover that is actually an occluded pointer.
        await loc.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        await page.mouse.move(2, 2)
        await page.waitForTimeout(130)
        const before = await snapshot(page, String(i), p.probe)
        await loc.hover({ force: true })
        await page.waitForTimeout(170)
        const after = await snapshot(page, String(i), p.probe)
        const bL = effL(before.bgChain)
        const aL = effL(after.bgChain)
        const dL = bL !== null && aL !== null ? aL - bL : null
        const changed = STYLE_KEYS.filter((k) => before[k] !== after[k])

        if ((p.expect ?? 'change') === 'none') {
          if (changed.length > 0 || (dL !== null && Math.abs(dL) > 0.005)) {
            failures.push(
              `${where}  ${p.part}: must not respond to hover, but changed [${changed.join(', ')}] (dL ${dL?.toFixed(4)})`,
            )
          }
        } else {
          const need = p.min ?? MIN_DL
          const moved = dL !== null && Math.abs(dL) >= need
          const signalled = SIGNALS.some((k) => changed.includes(k))
          // On a veil-carrying control the background wash IS the hover;
          // a text-colour nudge alone is how the light-theme segment shipped
          // an invisible hover while this audit's first draft passed it.
          if (p.bg ? !moved : !moved && !signalled) {
            failures.push(
              `${where}  ${p.part}: hover is dead -- dL ${dL === null ? 'unresolvable' : dL.toFixed(4)} (needs ${need})${p.bg ? ' and the background is the signal here' : ' and no shadow/colour/decoration change'}`,
            )
          }
          if (dL === null) warnings.push(`${where}  ${p.part}: background chain had an unparseable layer`)
        }
      }
      return found
    }

    // Full set under monochrome, both themes. Every probe that fails to match
    // is an individual failure, so selector rot can never pass silently.
    for (const theme of ['dark', 'light']) await sweep(theme, 'monochrome', PROBES)

    // The accent axis moves primary, so the accent-coloured controls get the
    // same assertion under every accent. This is the sweep that caught amber
    // hovering in the opposite direction from the other ten.
    const accented = PROBES.filter((p) => ['primary', 'checkbox on', 'switch on'].includes(p.part))
    for (const accent of ACCENTS) for (const theme of ['dark', 'light']) await sweep(theme, accent, accented)

    // Hit-area honesty: what does a click in the middle of a filename hit?
    await setState('dark', 'monochrome')
    const hits = await page.evaluate(() => {
      const out = []
      for (const att of document.querySelectorAll('.atts--inline .att, .atts--list .att')) {
        const name = att.querySelector('.att__name')
        if (!name) continue
        name.scrollIntoView({ block: 'center' })
        const r = name.getBoundingClientRect()
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        out.push({ file: name.textContent.slice(0, 30), hit: el?.className?.toString() ?? String(el?.tagName) })
      }
      return out
    })
    for (const h of hits) {
      checks++
      if (h.hit.includes('att__remove')) {
        failures.push(`hit-area  clicking the middle of "${h.file}" hits the REMOVE button`)
      }
    }
    if (hits.length < 4) failures.push(`hit-area: only ${hits.length} attachment names found (expected 4)`)

    // The disabled-checked checkbox regression, asserted directly.
    const anat = await page.evaluate(() => {
      const sec = [...document.querySelectorAll('.sec')].find(
        (s) => s.querySelector('.sec__name')?.textContent === 'Checkbox',
      )
      const cell = [...sec.querySelectorAll('.states__cell')].find(
        (c) => c.querySelector('.states__label')?.textContent === 'Disabled',
      )
      const box = cell.querySelector('.check__box')
      return {
        shadow: getComputedStyle(box).boxShadow,
        bg: getComputedStyle(box).backgroundColor,
        tick: getComputedStyle(box, '::after').backgroundColor,
      }
    })
    checks++
    if (anat.shadow.includes('inset')) {
      failures.push(`disabled checkbox: carries an inset shadow again (${anat.shadow}) -- it must stay flat`)
    }
    const bgL = oklabLightness(anat.bg)
    const tickL = oklabLightness(anat.tick)
    checks++
    if (bgL === null || tickL === null || Math.abs(bgL - tickL) < 0.15) {
      failures.push(
        `disabled checkbox: tick is ${Math.abs((bgL ?? 0) - (tickL ?? 0)).toFixed(3)} L from its box (needs 0.15)`,
      )
    }
    /*
     * PAGE TWO: the components stage, same server. Both themes, monochrome --
     * the accent behaviour of the shared tokens is already proven above.
     */
    await page.goto(url.replace('primitives.html', 'components.html'))
    await page.waitForSelector('.lucet-prompt', { timeout: 15000 })
    await tagProbes(COMPONENT_PROBES)
    for (const theme of ['dark', 'light']) await sweep(theme, 'monochrome', COMPONENT_PROBES, COMPONENT_PROBES)

    // Chip hit-area honesty: the middle of a chip's NAME must never hit the
    // remove or retry button -- the pseudo-anchor regression, guarded here too.
    const chipHits = await page.evaluate(() => {
      const out = []
      for (const name of document.querySelectorAll('.lucet-prompt__att-name')) {
        name.scrollIntoView({ block: 'center' })
        const r = name.getBoundingClientRect()
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        out.push({ file: name.textContent.slice(0, 30), hit: el?.closest('button') ? 'button' : 'name' })
      }
      return out
    })
    for (const h of chipHits) {
      checks++
      if (h.hit === 'button') failures.push(`components hit-area  the middle of "${h.file}" hits a BUTTON`)
    }
    if (chipHits.length < 6) failures.push(`components hit-area: only ${chipHits.length} chip names found (expected 6+)`)

    // The thread's non-negotiables, asserted by presence: every thread must
    // CONTAIN its announcer (the hidden role=log that speaks the stream --
    // the visible document is deliberately not live), the caret must ride
    // the streaming fixture, and every unhappy ending must exist with its
    // icon.
    const thread = await page.evaluate(() => ({
      threads: document.querySelectorAll('.lucet-thread').length,
      announced: document.querySelectorAll('.lucet-thread :is([role="log"])').length,
      carets: document.querySelectorAll('.lucet-thread__caret').length,
      endings: ['interrupted', 'failed', 'refused'].map(
        (k) => document.querySelectorAll(`.lucet-thread__ended[data-status="${k}"]`).length,
      ),
    }))
    checks += 3
    if (thread.threads === 0 || thread.announced < thread.threads)
      failures.push(
        `thread: ${thread.threads - thread.announced} of ${thread.threads} thread(s) missing the role="log" announcer -- streaming is silent to screen readers`,
      )
    if (thread.carets === 0) failures.push('thread: no streaming caret found on the streaming fixture')
    if (thread.endings.some((n) => n === 0))
      failures.push(`thread: an unhappy ending is missing from the stage (interrupted/failed/refused = ${thread.endings.join('/')})`)

    /*
     * Markdown non-negotiables, on the fixtures that exist to prove them.
     * The live-edge laws are unit-tested in core; what is asserted HERE is
     * that the rendered page keeps the contract: syntax never leaks, copy
     * waits for the fence, the caret rides inside the open block, links are
     * underlined and leave safely, wide tables stay keyboard-reachable.
     */
    const md = await page.evaluate(() => {
      const openBlock = document.querySelector('.lucet-codeblock[data-open]')
      const link = document.querySelector('a.lucet-md__link')
      const wrap = document.querySelector('.lucet-md__tablewrap')
      return {
        syntaxLeaks: [...document.querySelectorAll('.lucet-md')].filter((d) => {
          const prose = d.cloneNode(true)
          // ** inside a code block is content, not leaked syntax.
          for (const c of prose.querySelectorAll('pre, code')) c.remove()
          return /\*\*|^#{1,6} /m.test(prose.textContent)
        }).length,
        closedCopies: document.querySelectorAll(
          '.lucet-codeblock:not([data-open]) .lucet-codeblock__copy',
        ).length,
        openHasCopy: openBlock ? openBlock.querySelectorAll('.lucet-codeblock__copy').length : -1,
        openWriting: openBlock ? openBlock.querySelectorAll('.lucet-codeblock__writing').length : -1,
        openCaretInside: openBlock
          ? openBlock.querySelectorAll('code .lucet-thread__caret').length
          : -1,
        tables: document.querySelectorAll('.lucet-md__table').length,
        tableReachable: wrap ? wrap.tabIndex === 0 : false,
        linkUnderlined: link ? getComputedStyle(link).textDecorationLine === 'underline' : false,
        linkLeavesSafely: link
          ? link.target === '_blank' && /noopener/.test(link.rel) && /^https:/.test(link.href)
          : false,
      }
    })
    checks += 7
    if (md.syntaxLeaks > 0)
      failures.push(`markdown: raw ** or # visible in ${md.syntaxLeaks} rendered document(s)`)
    if (md.closedCopies < 2)
      failures.push(`markdown: only ${md.closedCopies} copy button(s) on closed code blocks (expected 2+)`)
    if (md.openHasCopy !== 0 || md.openWriting !== 1)
      failures.push(
        `markdown: the open code block must say writing… and hide copy (copy=${md.openHasCopy}, writing=${md.openWriting})`,
      )
    if (md.openCaretInside !== 1)
      failures.push('markdown: the caret is not riding inside the open code block')
    if (md.tables === 0 || !md.tableReachable)
      failures.push('markdown: no table, or its scroll region is not keyboard-reachable')
    if (!md.linkUnderlined)
      failures.push('markdown: links must be underlined -- colour alone is no signal (1.4.1)')
    if (!md.linkLeavesSafely)
      failures.push('markdown: the external link must open in a new tab with rel=noopener')

    /*
     * The reasoning disclosure must actually DISCLOSE: a real click on the
     * settled row opens it and the working becomes readable. This assertion
     * exists because its predecessor was a div that said "expand" and did
     * nothing -- found by eye, guarded by pointer forever after.
     */
    const summary = page
      .locator('details.lucet-reasoning:not([data-streaming]) .lucet-reasoning__summary')
      .first()
    await summary.scrollIntoViewIfNeeded()
    const closedWord = (await summary.textContent())?.trim()
    await summary.click()
    const reasoningOpen = await page.evaluate(() => {
      const d = document.querySelector('details.lucet-reasoning:not([data-streaming])')
      const body = d?.querySelector('.lucet-reasoning__body')
      return {
        open: d?.open === true,
        bodyVisible: body ? body.getBoundingClientRect().height > 0 : false,
        bodyWords: body?.textContent?.length ?? 0,
      }
    })
    await summary.click() // leave the stage as it was found
    checks += 2
    if (closedWord !== 'Thought about it')
      failures.push(`reasoning: settled row says "${closedWord}", expected "Thought about it"`)
    if (!reasoningOpen.open || !reasoningOpen.bodyVisible || reasoningOpen.bodyWords < 40)
      failures.push(
        `reasoning: clicking the row must open the working (open=${reasoningOpen.open}, visible=${reasoningOpen.bodyVisible}, ${reasoningOpen.bodyWords} chars)`,
      )

    /*
     * The tool receipt, and THE ANTI-DEAD-EXPAND LAW: every disclosure on
     * this page must have something behind it, and every payload-less tool
     * row must not be a disclosure at all. A chevron is a promise.
     */
    const toolSummary = page.locator('details.lucet-tool .lucet-tool__row--summary').first()
    await toolSummary.scrollIntoViewIfNeeded()
    await toolSummary.click()
    const tool = await page.evaluate(() => {
      const open = document.querySelector('details.lucet-tool[open]')
      const labels = open
        ? [...open.querySelectorAll('.lucet-tool__io-label')].map((l) => l.textContent)
        : []
      return {
        opened: open !== null,
        labels,
        receiptChars: open
          ? [...open.querySelectorAll('.lucet-tool__io-pre')].reduce(
              (n, p) => n + p.textContent.length,
              0,
            )
          : 0,
        emptyDisclosures: [...document.querySelectorAll('details.lucet-tool')].filter(
          (d) => d.querySelectorAll('.lucet-tool__io-pre').length === 0,
        ).length,
        plainRows: document.querySelectorAll('div.lucet-tool').length,
        plainRowsWithChevron: [...document.querySelectorAll('div.lucet-tool .lucet-tool__row')].filter(
          (r) => getComputedStyle(r, '::before').content !== 'none',
        ).length,
      }
    })
    await toolSummary.click()
    checks += 3
    if (!tool.opened || tool.receiptChars < 30 || !tool.labels.includes('What it was asked'))
      failures.push(
        `tool: clicking the row must open the receipt (opened=${tool.opened}, ${tool.receiptChars} chars, labels=${tool.labels.join('|')})`,
      )
    if (tool.emptyDisclosures > 0)
      failures.push(`tool: ${tool.emptyDisclosures} disclosure(s) with nothing behind them -- a chevron is a promise`)
    if (tool.plainRows === 0 || tool.plainRowsWithChevron > 0)
      failures.push(
        `tool: the payload-less row must exist and carry no chevron (plain=${tool.plainRows}, with chevron=${tool.plainRowsWithChevron})`,
      )

    /*
     * THE VISIBILITY LAW, measured: actions ride every settled response —
     * visible outright on the latest turn, hidden on older ones until
     * hover OR FOCUS. Hover-only reveal is the failure this guards against:
     * a keyboard Tab into an older turn's actions must reveal them too.
     */
    const multiplayerPair = page
      .locator('.spec', { hasText: 'Multiplayer' })
      .locator('.lucet-thread__pair')
      .first()
    await multiplayerPair.scrollIntoViewIfNeeded()
    const actionsBefore = await multiplayerPair.evaluate((el) => {
      const a = el.querySelector('.lucet-actions')
      return a ? Number(getComputedStyle(a).opacity) : null
    })
    await multiplayerPair.locator('.lucet-actions__btn').first().focus()
    // The reveal is a real transition; read it after it lands, not mid-flight.
    await page.waitForTimeout(300)
    const actionsFocused = await multiplayerPair.evaluate((el) => {
      const a = el.querySelector('.lucet-actions')
      return a ? Number(getComputedStyle(a).opacity) : null
    })
    const latestVisible = await page.evaluate(() => {
      const a = document.querySelector('[data-latest] .lucet-actions')
      return a ? Number(getComputedStyle(a).opacity) : null
    })
    // A recorded verdict renders as a PRESSED state with a silhouette (the
    // fixtures replay a feedback/given event; toggle semantics are pinned in
    // the core tests — static replays cannot dispatch).
    const pressed = await page.evaluate(() => {
      const btn = document.querySelector('.lucet-actions__btn[aria-pressed="true"]')
      return btn ? getComputedStyle(btn).boxShadow !== 'none' : null
    })
    checks += 3
    if (actionsBefore !== 0 || actionsFocused !== 1)
      failures.push(
        `actions: older turn must hide (got ${actionsBefore}) and reveal on FOCUS, not just hover (got ${actionsFocused})`,
      )
    if (latestVisible !== 1)
      failures.push(`actions: the latest turn's actions must be visible outright (opacity ${latestVisible})`)
    if (pressed !== true)
      failures.push(
        pressed === null
          ? 'actions: no recorded verdict on the stage (a fixture must replay feedback/given)'
          : 'actions: the pressed verdict must keep a silhouette, not just an ink change (1.4.1)',
      )
  } finally {
    await browser.close()
    dev?.kill()
  }

  for (const w of warnings) console.warn(`  warn  ${w}`)
  if (failures.length > 0) {
    console.error(`\nState audit FAILED: ${failures.length} problem(s) across ${checks} checks.\n`)
    for (const f of failures) console.error(`  ${f}`)
    console.error('')
    process.exit(1)
  }
  console.log(`State audit passed: ${checks} checks (hover travel, disabled inertness, hit areas, tooltip arrival) across two pages, both themes, ${ACCENTS.length + 1} accents.`)
}

main()
