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
import { contrastRatio, flattenBackground, oklabLightness } from './contrast.mjs'

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
  { sec: 'Prompt input — every state', hover: '.lucet-tipwrap button', part: 'stop button' },
  /* The tooltip must ARRIVE: hover the wrap, watch the tip's opacity. */
  { sec: 'Prompt input — every state', hover: '.lucet-tipwrap', probe: '.lucet-tip', part: 'stop tooltip appears' },
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

    /* Deterministic sampling: every navigation drops injected styles,
       so stillness is re-applied after each goto — a check that reads
       an opacity mid-fade is measuring the race, not the design. */
    const still = () =>
      page.addStyleTag({
        content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
      })
    await still()
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

    /* THE CANVAS IS PART OF THE THEME (overscroll pass): the root's
       painted background must equal the page wrapper's ground — that is
       what overscroll and the area beyond a short page show — and
       color-scheme must agree with the theme so the browser's own
       surfaces do. Checked after every theme application so a restyled
       wrapper cannot silently reopen the seam. */
    /* NO FLOATING SURFACE MAY LOSE A STACKING FIGHT (stacking pass):
       open each chrome popover and library floating surface and probe
       points inside its rect — the hit must be the surface or its
       descendant, never page content. The regression this locks out:
       a view-transition-name atomised the appearance cluster and let
       thread content paint over the More panel. */
    const checkOcclusion = async (where, surfaceSel) => {
      const res = await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        if (!el) return 'surface missing'
        const r = el.getBoundingClientRect()
        if (r.width < 8 || r.height < 8) return 'surface not open'
        if (getComputedStyle(el).opacity === '0') return 'surface not shown'
        /* A tip is pointer-events: none by design; hit-testing skips
           such elements entirely, which reads as occlusion. Flip it
           for the probe — stacking is what is being measured — and
           restore before anyone can notice. */
        const hadPE = el.style.pointerEvents
        const peWasNone = getComputedStyle(el).pointerEvents === 'none'
        if (peWasNone) el.style.pointerEvents = 'auto'
        let bad = 0
        for (const [fx, fy] of [[0.5, 0.15], [0.5, 0.5], [0.5, 0.85], [0.15, 0.5], [0.85, 0.5]]) {
          const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy)
          if (!hit || !el.contains(hit)) bad++
        }
        if (peWasNone) el.style.pointerEvents = hadPE
        return bad === 0 ? 'ok' : `occluded at ${bad}/5 probe points`
      }, surfaceSel)
      checks++
      if (res !== 'ok') failures.push(`${where}  floating surface ${surfaceSel}: ${res}`)
    }

    /* THE VEIL: nothing behind a chrome popover may be readable
       through it. Enforced as computed-surface floors — Paper: fully
       opaque; Glass: at least a 75% mix with real blur. */
    const checkVeil = async (where, surfaceSel) => {
      const res = await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        if (!el) return 'surface missing'
        const cs = getComputedStyle(el)
        const bg = cs.backgroundColor
        const m = bg.match(/\/ ([\d.]+)\)/)
        const alpha = m ? parseFloat(m[1]) : bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' ? 0 : 1
        const blur = parseFloat((cs.backdropFilter.match(/blur\((\d+(?:\.\d+)?)px\)/) ?? [])[1] ?? '0')
        const glass = !!el.closest("[data-expression='glass']")
        if (glass) return alpha >= 0.75 && blur >= 8 ? 'ok' : `glass veil too thin (alpha ${alpha}, blur ${blur}px)`
        return alpha === 1 ? 'ok' : `paper surface not opaque (alpha ${alpha})`
      }, surfaceSel)
      checks++
      if (res !== 'ok') failures.push(`${where}  ${surfaceSel}: ${res}`)
    }

    /* CLOSED MEANS GONE. The UA hides a closed popover with a
       normal-weight display:none; one author `display` on the panel's
       selector re-shows it, closed, in page paint order — the bug the
       open-state probes above could never see. Asserted at rest,
       before the first press, and again after dismissal. */
    const checkClosed = async (where, surfaceSel) => {
      const res = await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        if (!el) return 'surface missing'
        if (el.matches(':popover-open')) return 'still open'
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        if (cs.display !== 'none')
          return `closed popover still displays as ${cs.display} (${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)})`
        return 'ok'
      }, surfaceSel)
      checks++
      if (res !== 'ok') failures.push(`${where}  ${surfaceSel}: ${res}`)
    }

    /* NATIVE CHROME LEAK: a <button> still wearing the UA's 2px outset
       border was never reset. Chrome drops the native look the moment
       an author styles the element, and the raw ButtonFace fill and
       ButtonBorder ring show through — the More trigger did this after
       its summary→button conversion. No house style uses outset/inset. */
    const checkNativeButtons = async (where) => {
      const leaks = await page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .filter((b) => {
            const cs = getComputedStyle(b)
            return cs.display !== 'none' && /^(outset|inset)$/.test(cs.borderTopStyle)
          })
          .map((b) => (b.className ? `button.${String(b.className).split(' ')[0]}` : 'button')),
      )
      checks++
      if (leaks.length) failures.push(`${where}  native button chrome on ${[...new Set(leaks)].join(', ')}`)
    }

    /* ONE CONTROL FAMILY (typography pass, 2026-09-02): the stage bar and
       the rail header are Paper chrome, so their type must not vary by
       theme, accent, or expression. Every clickable value computes to
       the CONTROL recipe (13/500/18, the sans stack, no tracking), the
       More panel's labels to META (12/400/18), and no interactive value
       wears muted ink unless disabled. Checked on every sweep so the
       family cannot drift apart again. */
    const checkControlFamily = async (where) => {
      const res = await page.evaluate(() => {
        const first = (v) => v.split(',')[0].replace(/['"]/g, '').trim()
        const sans = first(getComputedStyle(document.documentElement).getPropertyValue('--lucet-font-sans'))
        const probe = document.createElement('div')
        probe.style.color = 'var(--lucet-muted-foreground)'
        document.body.appendChild(probe)
        const muted = getComputedStyle(probe).color
        probe.remove()
        const control = [...document.querySelectorAll('.cfg__views button, .cfg__prefs select, .cfg__more-trigger, .cfg__more-row select, .cfg__stage-reset')]
        const meta = [...document.querySelectorAll('.cfg__more-row > span')]
        const bad = []
        const name = (el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '')
        for (const el of control) {
          const cs = getComputedStyle(el)
          const tracking = cs.letterSpacing === 'normal' || cs.letterSpacing === '0px'
          if (cs.fontSize !== '13px' || cs.fontWeight !== '500' || cs.lineHeight !== '18px' || !tracking || first(cs.fontFamily) !== sans)
            bad.push(`${name(el)} ${cs.fontSize}/${cs.fontWeight}/${cs.lineHeight}/${cs.letterSpacing}/${first(cs.fontFamily)}`)
          if (!el.disabled && cs.color === muted) bad.push(`${name(el)} wears muted ink`)
        }
        for (const el of meta) {
          const cs = getComputedStyle(el)
          if (cs.fontSize !== '12px' || cs.fontWeight !== '400' || cs.lineHeight !== '18px' || first(cs.fontFamily) !== sans)
            bad.push(`meta ${cs.fontSize}/${cs.fontWeight}/${cs.lineHeight}/${first(cs.fontFamily)}`)
        }
        return { n: control.length + meta.length, bad: [...new Set(bad)] }
      })
      checks++
      if (res.n === 0) failures.push(`${where}  control family: no members found`)
      else if (res.bad.length) failures.push(`${where}  control family drifts: ${res.bad.join('; ')}`)
    }

    /* THE LAB'S OWN FAMILY (audit round 01): specimen labels on the
       components page take the control recipe (13/500/18) and every
       Preview/Code tab the meta size at the control weight (12/500/18),
       in the sans stack, no tracking — so half-pixels cannot return. */
    const checkLabFamily = async (where) => {
      const res = await page.evaluate(() => {
        const first = (v) => v.split(',')[0].replace(/['"]/g, '').trim()
        const sans = first(getComputedStyle(document.documentElement).getPropertyValue('--lucet-font-sans'))
        const bad = []
        const check = (sel, size, weight) => {
          for (const el of document.querySelectorAll(sel)) {
            const cs = getComputedStyle(el)
            const tracking = cs.letterSpacing === 'normal' || cs.letterSpacing === '0px'
            if (cs.fontSize !== size || cs.fontWeight !== weight || cs.lineHeight !== '18px' || !tracking || first(cs.fontFamily) !== sans)
              bad.push(`${sel} ${cs.fontSize}/${cs.fontWeight}/${cs.lineHeight}/${cs.letterSpacing}/${first(cs.fontFamily)}`)
          }
        }
        check('.prim--comp .spec__label', '13px', '500')
        check('.spec__tabs button', '12px', '500')
        return { n: document.querySelectorAll('.prim--comp .spec__label, .spec__tabs button').length, bad: [...new Set(bad)] }
      })
      if (res.n === 0) return
      checks++
      if (res.bad.length) failures.push(`${where}  lab family drifts: ${res.bad.join('; ')}`)
    }

    /* THE SELF TURN (audit round 01): your own prompt sits right and
       carries no head — in a shared thread too. Other people's turns in a
       shared thread do carry the face. */
    const checkSelfTurns = async (where) => {
      const res = await page.evaluate(() => {
        const selfs = [...document.querySelectorAll('.lucet-thread__turn[data-self]')]
        const bad = []
        for (const t of selfs) {
          if (getComputedStyle(t).justifyItems !== 'end') bad.push('self turn aligns ' + getComputedStyle(t).justifyItems)
          if (t.querySelector('.lucet-thread__withface, .lucet-thread__author, .lucet-avatar')) bad.push('self turn carries a head')
        }
        const shared = [...document.querySelectorAll('.lucet-thread[data-shared]')]
        const others = shared.flatMap((th) => [...th.querySelectorAll('.lucet-thread__turn[data-role="user"]:not([data-self])')])
        for (const t of others) if (!t.querySelector('.lucet-thread__withface')) bad.push('another person in a shared thread has no face')
        return { selfs: selfs.length, shared: shared.length, others: others.length, bad: [...new Set(bad)] }
      })
      checks++
      if (res.selfs === 0 || res.shared === 0) failures.push(`${where}  self turns: no self turn or no shared thread found to judge`)
      else if (res.bad.length) failures.push(`${where}  self turns: ${res.bad.join('; ')}`)
    }

    /* TARGET SIZE INSIDE CHIPS AND STRIPS (audit round 02): the a11y audit
       counted a 24px pseudo region honestly and passed an 18px box — the
       site's own floor for these actions is 28. Every interactive element
       inside an attachment chip or a status strip must present an
       effective region (its box, or its ::before hit area) of at least
       24x24 (2.5.8), chip actions at least 28x28, and sibling regions must
       sit at least 4px apart without overlapping. */
    const checkChipTargets = async (where) => {
      const res = await page.evaluate(() => {
        const region = (el) => {
          const r = el.getBoundingClientRect()
          const ps = getComputedStyle(el, '::before')
          const pw = parseFloat(ps.width), ph = parseFloat(ps.height)
          const usesPseudo = ps.position === 'absolute' && ps.content !== 'none' && pw > 0
          const w = usesPseudo ? Math.max(r.width, pw) : r.width
          const h = usesPseudo ? Math.max(r.height, ph) : r.height
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2
          return { w, h, left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 }
        }
        const bad = []
        let n = 0
        for (const host of document.querySelectorAll('.lucet-prompt__att, .lucet-att, .lucet-prompt__status, .lucet-notice')) {
          const targets = [...host.querySelectorAll('button, a')].filter((t) => t.getClientRects().length)
          const regions = targets.map(region)
          const min = host.matches('.lucet-prompt__att, .lucet-att') ? 28 : 24
          regions.forEach((g, i) => {
            n++
            if (g.w < min - 0.5 || g.h < min - 0.5) bad.push(`${host.className.split(' ')[0]} action ${i + 1} region ${Math.round(g.w)}x${Math.round(g.h)} < ${min}`)
            for (let j = i + 1; j < regions.length; j++) {
              const o = regions[j]
              const overlap = g.right > o.left && o.right > g.left && g.bottom > o.top && o.bottom > g.top
              const apart = Math.max(o.left - g.right, g.left - o.right)
              if (overlap) bad.push(`${host.className.split(' ')[0]} actions ${i + 1} and ${j + 1} overlap`)
              else if (apart < 4 - 0.5) bad.push(`${host.className.split(' ')[0]} actions ${i + 1} and ${j + 1} only ${apart.toFixed(1)}px apart`)
            }
          })
        }
        return { n, bad: [...new Set(bad)] }
      })
      checks++
      if (res.n === 0) failures.push(`${where}  chip targets: no chip or strip actions found`)
      else if (res.bad.length) failures.push(`${where}  chip targets: ${res.bad.join('; ')}`)
    }

    const checkCanvas = async (where, theme) => {
      await page.waitForTimeout(50)
      const r = await page.evaluate(() => {
        const html = getComputedStyle(document.documentElement)
        const wrapper = document.querySelector('.prim') ?? document.body
        return {
          htmlBg: html.backgroundColor,
          ground: getComputedStyle(wrapper).backgroundColor,
          scheme: html.colorScheme,
        }
      })
      checks++
      if (r.htmlBg !== r.ground)
        failures.push(`${where}  canvas: root paints ${r.htmlBg}, page ground is ${r.ground}`)
      checks++
      if ((theme === 'dark') !== /dark/.test(r.scheme))
        failures.push(`${where}  color-scheme is "${r.scheme}" under ${theme} theme`)
    }

    const sweep = async (theme, accent, probes, all = PROBES) => {
      await setState(theme, accent)
      await checkCanvas(`canvas ${theme}/${accent}`, theme)
      await checkNativeButtons(`buttons ${theme}/${accent}`)
      await checkControlFamily(`family ${theme}/${accent}`)
      await checkLabFamily(`lab family ${theme}/${accent}`)
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
    await still()
    await page.waitForSelector('.lucet-prompt', { timeout: 15000 })
    await tagProbes(COMPONENT_PROBES)
    await checkSelfTurns('registers components')
    await checkChipTargets('targets components')
    for (const theme of ['dark', 'light']) await sweep(theme, 'monochrome', COMPONENT_PROBES, COMPONENT_PROBES)

    /* Occlusion, all four cells on the components page: the chrome
       popover plus every library floating surface it exhibits. */
    for (const theme of ['dark', 'light']) {
      for (const expression of ['paper', 'glass']) {
        await setState(theme, 'monochrome')
        await page.evaluate((e) => document.querySelector('.prim')?.setAttribute('data-expression', e), expression)
        await page.waitForTimeout(60)
        const cell = `occlusion components/${theme}/${expression}`
        await checkClosed(cell, '.cfg__more-panel')
        await page.click('.cfg__more-trigger')
        await page.waitForTimeout(120)
        await checkOcclusion(cell, '.cfg__more-panel')
        await checkVeil(cell, '.cfg__more-panel')
        await page.keyboard.press('Escape')
        await page.waitForTimeout(60)
        await checkClosed(cell, '.cfg__more-panel')
        await page.click('.lucet-budget__button')
        await page.waitForTimeout(120)
        await checkOcclusion(cell, '.lucet-budget__panel')
        await page.keyboard.press('Escape')
        await page.click('.lucet-scope__button')
        await page.waitForTimeout(120)
        await checkOcclusion(cell, '.lucet-scope__panel')
        await page.keyboard.press('Escape')
        await page.evaluate(() => {
          const b = document.querySelector('.lucet-tipwrap button')
          b?.focus()
        })
        await page.waitForTimeout(160)
        await checkOcclusion(cell, '.lucet-tipwrap:focus-within .lucet-tip')
        await page.evaluate(() => document.querySelector('.prim')?.setAttribute('data-expression', 'paper'))
      }
    }

    /*
     * Menu keyboard grammar, asserted with REAL key events (the shared
     * disclosure hook behind both the scope control and the budget
     * meter). Open lands focus on the pressed row; ArrowDown roves off
     * it; Escape closes and hands focus back to the trigger. A panel
     * only a pointer can drive is a menu in costume.
     */
    const kbdOpen = await page.evaluate(() => {
      const sec = [...document.querySelectorAll('.sec')].find(
        (s) => s.querySelector('.sec__name')?.textContent === 'Budget meter — the price before you spend it',
      )
      const details = sec?.querySelector('.lucet-budget')
      if (!details) return null
      details.scrollIntoView({ block: 'center' })
      details.open = true
      return true
    })
    checks++
    if (!kbdOpen) failures.push('menu grammar: budget meter section or its details not found')
    await page.waitForTimeout(80)
    const kbdFocused = await page.evaluate(() => ({
      cls: document.activeElement?.className ?? '',
      pressed: document.activeElement?.getAttribute('aria-pressed') ?? '',
    }))
    checks++
    if (!kbdFocused.cls.includes('lucet-budget__row') || kbdFocused.pressed !== 'true')
      failures.push(`menu grammar: opening did not focus the pressed row (got ${kbdFocused.cls || 'nothing'})`)
    await page.keyboard.press('ArrowDown')
    const kbdRoved = await page.evaluate(() => document.activeElement?.getAttribute('aria-pressed') ?? '')
    checks++
    if (kbdRoved !== 'false') failures.push('menu grammar: ArrowDown did not rove off the pressed row')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(40)
    const kbdClosed = await page.evaluate(() => {
      const sec = [...document.querySelectorAll('.sec')].find(
        (s) => s.querySelector('.sec__name')?.textContent === 'Budget meter — the price before you spend it',
      )
      const details = sec?.querySelector('.lucet-budget')
      return { open: details?.open ?? true, cls: document.activeElement?.className ?? '' }
    })
    checks++
    if (kbdClosed.open || !kbdClosed.cls.includes('lucet-budget__button'))
      failures.push('menu grammar: Escape must close the panel and return focus to the trigger')

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
    /*
     * THE COST STATES, reached through the runtime (review: the meter's
     * caution and spent states were designed, built — and unreachable
     * from the States rail, so no review ever saw them). Both fire as
     * deep links and must DERIVE: real usage through the real
     * projection, never a flagged chip. The magnitude rule rides along:
     * tone colour marks state relative to a limit, never raw price —
     * so at rest no figure may wear the caution ink, and in caution
     * only the threshold surfaces may.
     */
    for (const theme of ['dark', 'light']) {
      await page.emulateMedia({ colorScheme: theme })
      for (const [state, expected] of [
        ['budget-low', 'caution'],
        ['budget-spent', 'spent'],
      ]) {
        await page.goto(url.replace('primitives.html', `index.html?state=${state}`))
          await still()
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
        await page.waitForFunction(
          () =>
            document.querySelector('.lucet-budget__button') &&
            !document.querySelector('.lucet-thread__caret') &&
            ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Stop'),
          { timeout: 20000 },
        )
        const meter = await page.evaluate((exp) => {
          const chips = [...document.querySelectorAll('.lucet-budget')].filter(
            (c) => c.getBoundingClientRect().width > 0,
          )
          const chip = chips[0]
          if (!chip) return null
          const summary = chip.querySelector('.lucet-budget__button')
          chip.open = true
          const note = chip.querySelector('.lucet-budget__note')?.textContent ?? ''
          const bar = chip.querySelector('.lucet-budget__bar')
          const fill = chip.querySelector('.lucet-budget__bar-fill')
          const figs = [...chip.querySelectorAll('.lucet-budget__fig')].map(
            (f) => getComputedStyle(f).color,
          )
          const caution = getComputedStyle(document.documentElement).getPropertyValue('color')
          const probe = document.createElement('i')
          probe.style.color = 'var(--lucet-tone-caution-foreground)'
          document.body.appendChild(probe)
          const cautionColor = getComputedStyle(probe).color
          probe.remove()
          const out = {
            chipState: summary?.getAttribute('data-state') ?? null,
            mark: !!chip.querySelector('.lucet-budget__mark'),
            note,
            barState: bar?.getAttribute('data-state') ?? null,
            fillColor: fill ? getComputedStyle(fill).backgroundColor : null,
            trackColor: bar ? getComputedStyle(bar).backgroundColor : null,
            figs,
            cautionColor,
          }
          chip.open = false
          return out
        }, expected)
        checks++
        if (!meter) {
          failures.push(`cost states (${theme}/${state}): no visible budget chip found`)
          continue
        }
        if (meter.chipState !== expected)
          failures.push(`cost states (${theme}/${state}): chip data-state is ${meter.chipState}, expected ${expected}`)
        checks++
        if (!meter.mark) failures.push(`cost states (${theme}/${state}): the triangle mark is missing — colour alone is not a state`)
        if (state === 'budget-low') {
          checks++
          if (!/still fits/.test(meter.note))
            failures.push(`cost states (${theme}/${state}): the caution note names no exit (got "${meter.note}")`)
        }
        checks++
        if (meter.barState !== expected)
          failures.push(`cost states (${theme}/${state}): the bar disagrees with the chip (${meter.barState} vs ${expected})`)
        checks++
        if (meter.fillColor && meter.trackColor) {
          const ratio = contrastRatio(meter.fillColor, meter.trackColor)
          if (ratio < 3)
            failures.push(`cost states (${theme}/${state}): bar fill vs track is ${ratio.toFixed(2)}:1 — 1.4.11 needs 3:1`)
        } else failures.push(`cost states (${theme}/${state}): bar or fill missing from the ledger`)
        checks++
        if (meter.figs.some((c) => c === meter.cautionColor))
          failures.push(`cost states (${theme}/${state}): a figure wears the caution ink — tone marks the threshold, never magnitude`)
      }

      /* At rest: no threshold state, no tone anywhere on the meter. */
      await page.goto(url.replace('primitives.html', 'index.html'))
      await still()
      await page.waitForFunction(
        () => document.querySelector('.lucet-budget__button') && !document.querySelector('.lucet-thread__caret'),
        { timeout: 20000 },
      )

      /* Occlusion on the KONFABULATOR — the page whose ancestor chain
         actually lost the fight (the exemption's stacking context sat
         beside the frame): the chrome popover and the budget panel,
         both themes. */
      for (const t of ['dark', 'light']) {
        await page.evaluate((th) => document.documentElement.setAttribute('data-theme', th), t)
        await page.waitForTimeout(60)
        await checkClosed(`occlusion konfabulator/${t}`, '.cfg__more-panel')
        await page.click('.cfg__more-trigger')
        await page.waitForTimeout(120)
        await checkOcclusion(`occlusion konfabulator/${t}`, '.cfg__more-panel')
        await checkVeil(`occlusion konfabulator/${t}`, '.cfg__more-panel')
        await page.keyboard.press('Escape')
        await page.waitForTimeout(60)
        await checkClosed(`occlusion konfabulator/${t}`, '.cfg__more-panel')
        await page.click('.lucet-budget__button')
        await page.waitForTimeout(120)
        await checkOcclusion(`occlusion konfabulator/${t}`, '.lucet-budget__panel')
        await page.keyboard.press('Escape')
        await page.waitForTimeout(80)
      }
      const rest = await page.evaluate(() => {
        const chips = [...document.querySelectorAll('.lucet-budget')].filter(
          (c) => c.getBoundingClientRect().width > 0,
        )
        const chip = chips[0]
        if (!chip) return null
        chip.open = true
        const probe = document.createElement('i')
        probe.style.color = 'var(--lucet-tone-caution-foreground)'
        document.body.appendChild(probe)
        const cautionColor = getComputedStyle(probe).color
        probe.remove()
        const out = {
          chipState: chip.querySelector('.lucet-budget__button')?.getAttribute('data-state') ?? null,
          barState: chip.querySelector('.lucet-budget__bar')?.getAttribute('data-state') ?? null,
          tinted: [...chip.querySelectorAll('.lucet-budget__fig, .lucet-budget__price, .lucet-budget__row')].some(
            (el) => getComputedStyle(el).color === cautionColor,
          ),
        }
        chip.open = false
        return out
      })
      checks++
      if (!rest) failures.push(`magnitude audit (${theme}): no budget chip at rest`)
      else if (rest.chipState !== null || rest.barState !== null || rest.tinted)
        failures.push(
          `magnitude audit (${theme}): tone colour at rest (chip ${rest.chipState}, bar ${rest.barState}, tinted ${rest.tinted})`,
        )
    }

    /*
     * THE THREAD'S REGISTERS + THE LAB STAGE (register pass). Three
     * assertions per theme x expression cell:
     *   1. bubble-vs-plane — the utterance is a SURFACE: its tint must
     *      step >= 0.03 L from the thread plane (it rendered white on
     *      white in the light cells when it borrowed the control
     *      token);
     *   2. the receipt is the ONLY elevated object in the thread. Light
     *      on everything, shadow only on objects (dark-Glass pass,
     *      2026-09-01): in Glass the bubble wears exactly the lit top
     *      edge — the same --lucet-edge-top the receipt catches — and
     *      nothing else: no rim, no cast. In Paper it wears nothing.
     *      The receipt's pseudo carries the material, and in Glass that
     *      material must include a cast (a non-inset layer);
     *   3. stage-vs-page on the primitives lab — the well must step
     *      >= 0.03 from the ground (dark Glass had 0.02 and no ring).
     */
    for (const theme of ['dark', 'light']) {
      await page.emulateMedia({ colorScheme: theme })
      await page.goto(url.replace('primitives.html', 'index.html'))
      await still()
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
      await page.waitForSelector('.lucet-thread__prompt', { timeout: 15000 })
      for (const expression of ['paper', 'glass']) {
        await page.evaluate((e) => {
          for (const el of document.querySelectorAll('[data-expression]')) el.setAttribute('data-expression', e)
        }, expression)
        await page.waitForTimeout(60)
        const reg = await page.evaluate(() => {
          const frame = document.querySelector('.cfg__frame')
          const bubble = frame.querySelector('.lucet-thread__prompt')
          const plane = getComputedStyle(frame).backgroundColor
          const tools = [...frame.querySelectorAll('.lucet-tool')]
          /* The lit edge, resolved where the bubble lives: a probe inside
             the frame painting --lucet-edge-top gives the exact string
             the bubble must match in Glass. */
          const probe = document.createElement('div')
          probe.style.boxShadow = 'var(--lucet-edge-top)'
          frame.appendChild(probe)
          const edgeTop = getComputedStyle(probe).boxShadow
          probe.remove()
          return {
            bubble: getComputedStyle(bubble).backgroundColor,
            plane,
            bubbleShadow: getComputedStyle(bubble).boxShadow,
            edgeTop,
            toolMaterial: tools.length
              ? getComputedStyle(tools[0], '::after').boxShadow
              : null,
          }
        })
        /* THE FLOOR, RENDERED (ruling, 2026-09-01): the frame floats on
           the stage floor, which follows the exhibit. Measured where it
           paints — the first painted background just left of the frame
           — and judged theme-relative like the token ladder in
           audit-theme-parity: dark Glass, sidebar and card ≥ 0.03 L
           above the floor; dark Paper, above it, with the frame's
           hairline present; light Glass, the card above the floor;
           light Paper, the hairline. Recesses may sit below in light. */
        const floor = await page.evaluate(() => {
          const frame = document.querySelector('.cfg__frame')
          const r = frame.getBoundingClientRect()
          /* elementsFromPoint, plural: the floor sits at z -1 beneath
             transparent layout boxes, so the topmost hit is not what
             paints — the first element in paint order with a fill is. */
          const e = document
            .elementsFromPoint(Math.max(1, r.left - 12), r.top + r.height / 2)
            .find((el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)')
          const side = document.querySelector('.cfg__side')
          return {
            on: e ? (e.className ? String(e.className).split(' ')[0] : e.tagName.toLowerCase()) : null,
            floorBg: e ? getComputedStyle(e).backgroundColor : null,
            sidebar: side ? getComputedStyle(side).backgroundColor : null,
            card: getComputedStyle(frame).backgroundColor,
            frameShadow: getComputedStyle(frame).boxShadow,
          }
        })
        const lit = (c) => oklabLightness(flattenBackground([c, 'rgb(255,255,255)']))
        const lFloor = floor.floorBg ? lit(floor.floorBg) : null
        const dSide = lFloor !== null && floor.sidebar ? lit(floor.sidebar) - lFloor : null
        const dCard = lFloor !== null ? lit(floor.card) - lFloor : null
        const fmt = (d) => (d === null ? 'n/a' : (d >= 0 ? '+' : '') + d.toFixed(3))
        await checkControlFamily(`family konfabulator ${theme}/${expression}`)
        checks++
        if (floor.on !== 'cfg__stage-floor')
          failures.push(`floor (${theme}/${expression}): the frame floats on ${floor.on ?? 'nothing'} (${floor.floorBg}) — the stage floor must paint under it`)
        checks++
        if (theme === 'dark') {
          const min = expression === 'glass' ? 0.03 : 0
          const bad = [['sidebar', dSide], ['card', dCard]].filter(([, d]) => d === null || d < min - 0.0005)
          if (bad.length)
            failures.push(`floor (${theme}/${expression}): ${bad.map(([n, d]) => `${n} ${fmt(d)}`).join(', ')} vs the floor — inside must sit ${min ? `≥ ${min} L ` : ''}above the page it floats on`)
        } else if (expression === 'glass' && (dCard === null || dCard < -0.0005)) {
          failures.push(`floor (${theme}/glass): card ${fmt(dCard)} vs the floor — the card must sit above its page`)
        }
        if (expression === 'paper') {
          checks++
          if (!/0px 0px 0px 1px/.test(floor.frameShadow))
            failures.push(`floor (${theme}/paper): the frame's hairline is missing (${floor.frameShadow}) — Paper separates the window by line`)
        }
        checks++
        const dl = Math.abs(
          oklabLightness(flattenBackground([reg.bubble, reg.plane, 'rgb(255,255,255)'])) -
            oklabLightness(flattenBackground([reg.plane, 'rgb(255,255,255)'])),
        )
        if (dl < 0.03 - 0.0005)
          failures.push(`registers (${theme}/${expression}): bubble-vs-plane is ${dl.toFixed(3)} L — the utterance must read as a surface (>= 0.03)`)
        checks++
        if (expression === 'glass') {
          if (reg.bubbleShadow !== reg.edgeTop)
            failures.push(`registers (${theme}/${expression}): the utterance must wear exactly the lit edge (${reg.edgeTop}), not (${reg.bubbleShadow}) — light on everything, shadow only on objects`)
        } else if (reg.bubbleShadow !== 'none') {
          failures.push(`registers (${theme}/${expression}): the utterance wears material (${reg.bubbleShadow}) — Paper separates with lines`)
        }
        checks++
        if (!reg.toolMaterial || reg.toolMaterial === 'none')
          failures.push(`registers (${theme}/${expression}): the receipt's material pseudo is missing — nothing is elevated`)
        else if (
          expression === 'glass' &&
          /* Computed layers read "<color> x y blur spread [inset]", comma-
             separated; split where a colour function starts a new layer. */
          !reg.toolMaterial.split(/,\s*(?=(?:oklch|oklab|rgba?|hsla?|color)\()/).some((layer) => !/\binset\b/.test(layer))
        )
          failures.push(`registers (${theme}/${expression}): the receipt casts no shadow (${reg.toolMaterial}) — the object is a lit surface that also casts`)
      }

      /* the lab stage */
      await page.goto(url)
      await still()
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
      await page.waitForSelector('.stage', { timeout: 15000 })
      for (const expression of ['paper', 'glass']) {
        await page.evaluate((e) => document.querySelector('.prim')?.setAttribute('data-expression', e), expression)
        await page.waitForTimeout(60)
        const lab = await page.evaluate(() => ({
          stage: getComputedStyle(document.querySelector('.stage')).backgroundColor,
          stageRing: getComputedStyle(document.querySelector('.stage')).boxShadow,
          pageBg: getComputedStyle(document.querySelector('.prim')).backgroundColor,
          bodyBg: getComputedStyle(document.body).backgroundColor,
        }))
        checks++
        const ground = lab.pageBg === 'rgba(0, 0, 0, 0)' ? lab.bodyBg : lab.pageBg
        if (expression === 'glass') {
          /* Glass separates with value: the well needs its own step. */
          const dls = Math.abs(
            oklabLightness(flattenBackground([lab.stage, ground, 'rgb(255,255,255)'])) -
              oklabLightness(flattenBackground([ground, 'rgb(255,255,255)'])),
          )
          if (dls < 0.03 - 0.0005)
            failures.push(`lab stage (${theme}/glass): stage-vs-page is ${dls.toFixed(3)} L — the well needs its own step (>= 0.03)`)
        } else if (lab.stageRing === 'none') {
          /* Paper separates with a line: the ring must exist. */
          failures.push(`lab stage (${theme}/paper): the stage ring is gone — Paper's grammar is the line`)
        }
      }
    }

    /* NOTHING CLIPS, AT MOBILE WIDTHS TOO (audit round 02): the components
       page scrolled sideways at 390 for weeks — a sources grid track sized
       to an unbreakable label, a code floor that did not yield to its
       column, a chip and a panel with fixed minimums — and no instrument
       measured it, because every audit ran at 1280. Every page at 390 and
       320 must have zero horizontal document overflow. On a failure the
       outermost element that extends the document is named, skipping
       anything already contained by a scrolling ancestor. */
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      for (const path of ['primitives.html', 'components.html', 'index.html']) {
        await page.goto(url.replace('primitives.html', path))
        await still()
        await page.waitForSelector(path === 'index.html' ? '.cfg__frame' : '.sec', { timeout: 15000 })
        await page.waitForTimeout(500)
        const res = await page.evaluate(() => {
          const over = document.documentElement.scrollWidth - document.documentElement.clientWidth
          if (over <= 0) return { over }
          const contained = (e) => {
            let a = e.parentElement
            while (a && a !== document.documentElement) {
              if (getComputedStyle(a).overflowX !== 'visible' && a.getBoundingClientRect().right <= innerWidth + 1) return true
              a = a.parentElement
            }
            return false
          }
          const wide = [...document.querySelectorAll('body *')].filter((e) => {
            const r = e.getBoundingClientRect()
            return r.right > innerWidth + 1 && r.width > 0 && !contained(e)
          })
          const roots = wide.filter((e) => !wide.some((o) => o !== e && o.contains(e)))
          const name = (e) => (e.className && e.className.toString().split(' ')[0]) || e.tagName.toLowerCase()
          return { over, culprits: [...new Set(roots.map((e) => `${name(e)} ${Math.round(e.getBoundingClientRect().width)}px wide`))].slice(0, 4) }
        })
        checks++
        if (res.over > 0) failures.push(`mobile overflow  ${path} at ${width}px scrolls sideways by ${res.over}px: ${res.culprits.join(', ')}`)
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 })

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
  console.log(`State audit passed: ${checks} checks (hover travel, disabled inertness, hit areas, tooltip arrival, cost thresholds, zero horizontal overflow at 390 and 320) across three pages, both themes, ${ACCENTS.length + 1} accents.`)
}

main()
