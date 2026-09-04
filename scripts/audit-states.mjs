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
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { contrastRatio, flattenBackground, oklabLightness } from './contrast.mjs'

const DEV_PORT = 4344
const URL_ARG = process.argv[2] ?? process.env.AUDIT_URL ?? null
const MIN_DL = 0.03
/* The lab stage under Glass sits at least this far ABOVE its page: half
   the surface ladder's first stride (round 03 ruling). */
const PLATE_MIN_DL = 0.015
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
  { sec: 'Attachments — the files you bring to the request', hover: '[aria-label^="Try uploading"]', part: 'chip retry', bg: true },
  { sec: 'Attachments — the files you bring to the request', hover: '.lucet-prompt__att [aria-label^="Remove"]', part: 'chip remove', bg: true },
  { sec: 'Prompt input — multiplayer', hover: 'button.lucet-button:not([disabled])', part: 'queue button' },
  { sec: 'Prompt input — every state', hover: '.lucet-tipwrap button', part: 'stop button' },
  /* The tooltip must ARRIVE: hover the wrap, watch the tip's opacity. */
  { sec: 'Prompt input — every state', hover: '.lucet-tipwrap', probe: '.lucet-tip', part: 'stop tooltip appears' },
  /* The reasoning row is a real control now; its veil must land like any
     other. (Its predecessor was a dead div that said "expand".) */
  { sec: 'Thread — every ending', hover: 'details.lucet-reasoning:not([data-streaming]) .lucet-reasoning__summary', part: 'reasoning summary', bg: true },
  { sec: 'Thread — every ending', hover: 'details.lucet-tool .lucet-tool__row--summary', part: 'tool summary', bg: true },
  { sec: 'Sources and provenance', hover: '.lucet-sources__row--summary', part: 'source summary', bg: true },
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
          /* SETTLED BY HIT TEST (audit round 04): the region is a
             pseudo-element, which a bounding-rect measurement cannot see.
             The point 3px outside the glyph box on either side must hit
             the button itself — it does on the live build, both themes. */
          if (host.matches('.lucet-prompt__att, .lucet-att')) {
            host.scrollIntoView({ block: 'center' })
            targets.forEach((t, i) => {
              const r = t.getBoundingClientRect(), cy = r.top + r.height / 2
              for (const x of [r.left - 3, r.right + 3]) {
                const hit = document.elementFromPoint(x, cy)
                if (!(hit === t || t.contains(hit))) bad.push(`${host.className.split(' ')[0]} action ${i + 1}: the point 3px outside the glyph box hits ${hit ? (hit.className || hit.tagName).toString().split(' ')[0] : 'nothing'}, not the button`)
              }
            })
          }
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

    /* THE RESTORE PAIR (audit round 04): a control labelled Restore must
       restore. The older version's action is Preview version and carries
       its tip; the banner pairs a ghost Return to latest with a primary
       Restore version — hierarchy by silhouette (a fill against none),
       labels that never wrap, 32–36px visible and at least 40 effective.
       The commit says Restore this version; the preview says Preview version (component audit 05). */
    const checkRestoreLabels = async (where) => {
      const res = await page.evaluate(() => {
        const bad = []
        const previews = [...document.querySelectorAll('.lucet-actions__btn')].filter((b) => b.textContent.trim() === 'Preview version')
        if (!previews.length) bad.push('no Preview version action found')
        for (const p of previews) {
          const tip = document.getElementById(p.getAttribute('aria-describedby') || '')
          if (!tip || !/nothing changes until you restore/.test(tip.textContent)) { bad.push('Preview version lacks its tip'); break }
        }
        const banners = [...document.querySelectorAll('.lucet-thread__restored')]
        if (!banners.length) bad.push('no preview banner found')
        for (const banner of banners) {
          if (!/^Previewing version \d+ of \d+/.test((banner.querySelector('.lucet-thread__restored-text')?.textContent || '').trim())) bad.push('banner sentence does not begin "Previewing version n of n"')
          const ghost = banner.querySelector('.lucet-thread__return[data-variant="ghost"]')
          const primary = banner.querySelector('.lucet-thread__return[data-variant="primary"][data-commit]')
          if (!ghost || ghost.textContent.trim() !== 'Return to latest') bad.push('banner ghost is not "Return to latest"')
          if (!primary || primary.textContent.trim() !== 'Restore this version') bad.push('banner primary is not "Restore this version"')
          if (!ghost || !primary) continue
          if (getComputedStyle(ghost).backgroundColor === getComputedStyle(primary).backgroundColor) bad.push('primary and ghost share a fill — hierarchy would be hue alone')
          for (const [name, el] of [['ghost', ghost], ['primary', primary]]) {
            const cs = getComputedStyle(el), r = el.getBoundingClientRect(), ps = getComputedStyle(el, '::before')
            const ext = ps.position === 'absolute' && ps.content !== 'none' ? -(parseFloat(ps.top) || 0) - (parseFloat(ps.bottom) || 0) : 0
            if (cs.whiteSpace !== 'nowrap') bad.push(`${name} may wrap`)
            if (r.height < 31.5 || r.height > 36.5) bad.push(`${name} visible height ${r.height.toFixed(1)} outside 32–36`)
            if (r.height + ext < 39.5) bad.push(`${name} effective height ${(r.height + ext).toFixed(1)} < 40`)
            if (el.scrollWidth > el.clientWidth + 1) bad.push(`${name} label overflows its box`)
          }
        }
        return [...new Set(bad)]
      })
      checks++
      if (res.length) failures.push(`${where}  restore pair: ${res.join('; ')}`)
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
    await checkRestoreLabels('registers components')
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

    {
    /*
     * THE COST DECISION (component audit 03), on the lab's fixtures.
     * 1. Figures in a column align: every row reserves the check slot, so
     *    the selected row's price sits on the same right edge as the rest.
     * 2. The track is visible against the panel (it measured 1.0–1.2:1
     *    before), and the fill clears 3:1 against the track.
     * 3. A disabled trigger is disabled for the keyboard too, and says so.
     * 4. Under reduced motion the panel arrives with nothing running.
     */
    const BUDGET_SECTION = 'Budget meter — the price before you spend it'
    const column = await page.evaluate((name) => {
      const sec = [...document.querySelectorAll('.sec')].find((s) => s.querySelector('.sec__name')?.textContent === name)
      const details = sec?.querySelector('.lucet-budget')
      if (!details) return null
      details.scrollIntoView({ block: 'center' })
      details.open = true
      const rights = [...details.querySelectorAll('.lucet-budget__row .lucet-budget__fig')].map((f) => f.getBoundingClientRect().right)
      const slots = details.querySelectorAll('.lucet-budget__check-slot').length
      const rows = details.querySelectorAll('.lucet-budget__row').length
      const panel = details.querySelector('.lucet-budget__panel'), bar = details.querySelector('.lucet-budget__bar'), fill = details.querySelector('.lucet-budget__bar-fill')
      const probe = document.createElement('i'); probe.style.color = 'var(--lucet-card)'; panel.appendChild(probe); const card = getComputedStyle(probe).color; probe.remove()
      const out = { spread: Math.max(...rights) - Math.min(...rights), slots, rows, track: getComputedStyle(bar).backgroundColor, fill: getComputedStyle(fill).backgroundColor, card }
      document.activeElement?.blur()
      details.open = false
      return out
    }, BUDGET_SECTION)
    checks += 2
    if (!column || column.spread > 0.5 || column.slots !== column.rows)
      failures.push(`budget column: the prices do not share a right edge — ${JSON.stringify(column)}`)
    if (column && (contrastRatio(column.track, column.card) < 2.2 || contrastRatio(column.fill, column.track) < 3))
      failures.push(`budget bar: track vs panel ${contrastRatio(column.track, column.card).toFixed(2)}:1 (floor 2.2), fill vs track ${contrastRatio(column.fill, column.track).toFixed(2)}:1 (floor 3)`)
    const lockedTrigger = await page.evaluate(() => {
      const sec = [...document.querySelectorAll('.sec')].find((s) => s.querySelector('.sec__name')?.textContent === 'Prompt input — multiplayer')
      const details = sec?.querySelector('.lucet-budget')
      if (!details) return null
      details.scrollIntoView({ block: 'center' })
      const s = details.querySelector('summary')
      s.focus()
      return { disabled: s.dataset.disabled ?? null, ariaDisabled: s.getAttribute('aria-disabled'), tabIndex: s.tabIndex, focusable: document.activeElement === s }
    })
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    await page.waitForTimeout(80)
    const lockedAfter = await page.evaluate(() => {
      const sec = [...document.querySelectorAll('.sec')].find((s) => s.querySelector('.sec__name')?.textContent === 'Prompt input — multiplayer')
      const details = sec?.querySelector('.lucet-budget')
      details.querySelector('summary').click()
      return { open: details?.open ?? null }
    })
    checks++
    if (!lockedTrigger || lockedTrigger.disabled !== 'true' || lockedTrigger.ariaDisabled !== 'true' || lockedTrigger.tabIndex !== -1 || lockedAfter.open !== false)
      failures.push(`budget locked: the disabled trigger must be inert to keyboard and click and expose aria-disabled — ${JSON.stringify({ lockedTrigger, lockedAfter })}`)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const quietPanel = await page.evaluate((name) => {
      const sec = [...document.querySelectorAll('.sec')].find((s) => s.querySelector('.sec__name')?.textContent === name)
      const details = sec.querySelector('.lucet-budget')
      details.open = true
      const running = details.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length
      const visible = details.querySelector('.lucet-budget__panel').getBoundingClientRect().height > 40
      document.activeElement?.blur()
      details.open = false
      return { running, visible }
    }, BUDGET_SECTION)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    checks++
    if (quietPanel.running !== 0 || !quietPanel.visible) failures.push(`budget reduced motion: ${quietPanel.running} animation(s) running when the panel opens (visible=${quietPanel.visible})`)

    }

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
    if (closedWord !== 'Why this answer')
      failures.push(`reasoning: settled row says "${closedWord}", expected "Why this answer"`)
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
     * THE STATE'S OWN EXIT, ON THE SPECIMEN (component audit 02): the
     * partial receipt's fixture carries the P1 recovery verb, so its
     * actions must offer the verb -- never the generic "Ask again" -- with
     * the accessible name equal to the visible label. And the running
     * specimen's clock holds: a state on display does not age.
     */
    const readSpecimens = () =>
      page.evaluate(() => {
        const partial = document.querySelector('.lucet-tool[data-status="partial"]')
        const thread = partial?.closest('.lucet-thread') ?? null
        const verb = thread?.querySelector('.lucet-actions__btn[data-recovery]') ?? null
        return {
          verb: verb ? verb.textContent.trim() : null,
          verbName: verb ? (verb.getAttribute('aria-label') ?? verb.textContent.trim()) : null,
          askAgain: thread ? [...thread.querySelectorAll('.lucet-actions__btn')].some((b) => /Ask again/.test(b.textContent)) : null,
          elapsed: document.querySelector('.lucet-tool[data-status="running"] .lucet-tool__elapsed')?.textContent ?? null,
        }
      })
    const specimen = await readSpecimens()
    await page.waitForTimeout(400)
    const specimenLater = await readSpecimens()
    checks += 2
    if (specimen.verb !== 'Retry missing source' || specimen.verbName !== specimen.verb || specimen.askAgain !== false)
      failures.push(
        `tool: the partial specimen must offer its recovery verb (verb=${specimen.verb}, name=${specimen.verbName}, askAgain=${specimen.askAgain})`,
      )
    if (specimen.elapsed !== '1.2s' || specimenLater.elapsed !== '1.2s')
      failures.push(`tool: the running specimen's clock must hold at 1.2s (read ${specimen.elapsed}, then ${specimenLater.elapsed})`)

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
    /* The pointer rests wherever the last click left it; parked over this
       pair it would reveal the row by hover and fail the law for the
       wrong reason. Park it in the corner first. */
    await page.mouse.move(0, 0)
    await page.waitForTimeout(250)
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
        if (state === 'budget-spent') {
          /* THE RULE (component audit 03): a running turn is never stopped
             for cost. The ledger crossed mid-turn; the response settled
             complete, once, and the wall is for the next send. */
          const crossing = await page.evaluate(() => {
            const log = window.__lucet.getLog().map((entry) => entry.event), s = window.__lucet.getState()
            const crossedAt = log.findIndex((e) => e.type === 'usage/changed' && (e.patch?.monthlySpentUsd ?? 0) >= (s.usage.monthlyBudgetUsd ?? Infinity))
            /* A deep link replays the opener's history first: the crossing turn is the LAST one. */
            const settledAt = log.findLastIndex((e) => e.type === 'response/settled')
            const last = s.turns[s.turns.length - 1]
            return { crossedAt, settledAt, settles: log.filter((e) => e.type === 'response/settled').map((e) => e.status), status: last?.response?.status, words: last?.response?.parts.some((p) => p.kind === 'text' && p.text.length > 40) }
          })
          checks++
          if (crossing.crossedAt < 0 || crossing.crossedAt > crossing.settledAt || crossing.settles.some((x) => x !== 'complete') || crossing.status !== 'complete' || !crossing.words)
            failures.push(`cost states (${theme}/${state}): the crossing turn must land whole — ${JSON.stringify(crossing)}`)
        }
        if (state === 'budget-low') {
          checks++
          /* The exit is named either way: "Fast still fits (≈$…)" before
             round 05, "Use Fast (≈$…) or continue on Auto (≈$…)" since. */
          if (!/still fits|Use \w[\w ]* \(≈\$[\d.]+\) or continue on/.test(meter.note))
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
      await page.goto(url.replace('primitives.html', 'index.html?instant=1'))
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
      await page.goto(url.replace('primitives.html', 'index.html?instant=1'))
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
          /* RULING (audit round 03): in Glass a stage is a PLATE, not a
             well — the Konfabulator's grammar, a raised specimen on the
             host's floor. The assertion is directional: the stage sits
             ABOVE the page by at least half the ladder's first stride
             (0.125 on 0.105 in dark; white on .965 in light) and wears
             the raised material. Until this round the check accepted
             either direction at a 0.03 step, which is how a 0.065 well
             passed under the expression that raises every other specimen. */
          const d =
            oklabLightness(flattenBackground([lab.stage, ground, 'rgb(255,255,255)'])) -
            oklabLightness(flattenBackground([ground, 'rgb(255,255,255)']))
          if (d < PLATE_MIN_DL - 0.0005)
            failures.push(`lab stage (${theme}/glass): stage-vs-page is ${d >= 0 ? '+' : ''}${d.toFixed(3)} L — under Glass the stage is a plate above the page (>= +${PLATE_MIN_DL})`)
          if (lab.stageRing === 'none' || !/\binset\b/.test(lab.stageRing))
            failures.push(`lab stage (${theme}/glass): the plate wears no raised material (${lab.stageRing}) — rim, edge-top and contact are the grammar`)
        } else if (lab.stageRing === 'none') {
          /* Paper separates with a line: the ring must exist. */
          failures.push(`lab stage (${theme}/paper): the stage ring is gone — Paper's grammar is the line`)
        }
      }
    }

    /* THE HOST'S MARK AND THE HOST'S HARDWARE (0.2 coherence pass). The brand
       tile wears the host's accent — a dark plate tinted from the shared
       curve — and the A glyph must stay legible on it under every accent,
       both themes; amber and green are the warm, light hues where a tinted
       dark can drift. The window bar's divider is hardware: a low-alpha
       neutral line, never the application's border token, never the
       accent, present in every expression. */
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(url.replace('primitives.html', 'index.html?instant=1'))
    await still()
    await page.waitForSelector('.cfg__mock-logo', { timeout: 15000 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
      for (const accent of [...ACCENTS, 'monochrome']) {
        await page.evaluate((a) => document.documentElement.setAttribute('data-accent', a), accent)
        await page.waitForTimeout(30)
        const tile = await page.evaluate(() => {
          const svg = document.querySelector('.cfg__mock-logo')
          const probe = document.createElement('i')
          probe.style.backgroundColor = getComputedStyle(svg).getPropertyValue('--cfg-tile-1')
          svg.parentElement.appendChild(probe)
          const plate = getComputedStyle(probe).backgroundColor
          probe.remove()
          /* The glyph's stroke as the browser computes it (rgb), not the
             hex literal — the contrast helper parses rgb() and oklch(). */
          return { plate, glyph: getComputedStyle(svg.querySelector('g[stroke]')).stroke }
        })
        checks++
        const ratio = contrastRatio(tile.glyph, tile.plate)
        if (!ratio || ratio < 4.5)
          failures.push(`brand tile (${theme}/${accent}): glyph on plate is ${ratio ? ratio.toFixed(2) : 'unmeasurable'}:1 (plate ${tile.plate}) — the host's mark must stay legible under every accent`)
      }
      await page.evaluate(() => document.documentElement.setAttribute('data-accent', 'violet'))
      for (const expression of ['paper', 'glass']) {
        await page.evaluate((e) => document.querySelector('.cfg__frame')?.setAttribute('data-expression', e), expression)
        await page.waitForTimeout(30)
        const bar = await page.evaluate(() => {
          const el = document.querySelector('.cfg__frame-bar')
          const cs = getComputedStyle(el)
          const probe = (name) => { const i = document.createElement('i'); i.style.color = `var(${name})`; el.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c }
          return { line: cs.borderBottomColor, width: cs.borderBottomWidth, style: cs.borderBottomStyle, border: probe('--lucet-border'), primary: probe('--lucet-primary') }
        })
        checks++
        const alpha = (() => { const m = bar.line.match(/\/\s*([\d.]+)\)$/) || bar.line.match(/rgba\([^)]*,\s*([\d.]+)\)/); return m ? parseFloat(m[1]) : 1 })()
        if (bar.width !== '1px' || bar.style !== 'solid') failures.push(`window bar (${theme}/${expression}): the divider is ${bar.width} ${bar.style}, not a 1px line`)
        else if (bar.line === bar.border || bar.line === bar.primary) failures.push(`window bar (${theme}/${expression}): the divider borrows ${bar.line === bar.primary ? 'the accent' : 'the application border token'} — hardware stays neutral`)
        else if (alpha > 0.2) failures.push(`window bar (${theme}/${expression}): the divider is opaque (${bar.line}) — hardware is a low-alpha neutral line`)
      }
    }

    /* EVERY TRIGGER DOES WHAT IT SAYS, AND RESET UNDOES IT (audit round 05).
       Five triggers are driven through the running app from a clean cold
       start — the rail's own buttons, the way a person fires them — and
       judged by what the runtime actually did: real events, real reducer.
       Then Reset is pressed and the instrument behind it must read empty:
       no timers, no queue, no pending reply, no lock, and no transient
       banner left. (A deep-linked load replays the opener's two turns
       first, so counts are taken from the cold start, not from a link.) */
    await page.setViewportSize({ width: 1280, height: 900 })
    const coldStart = async () => {
      await page.goto(url.replace('primitives.html', 'index.html?state=cold-start'))
      await still()
      await page.waitForSelector('.cfg__frame', { timeout: 15000 })
      await page.waitForFunction(() => window.__lucet && window.__lucet.getState().turns.length === 0, null, { timeout: 15000 })
      await page.waitForTimeout(300)
    }
    const fireFromRail = async (label, tab) => {
      await page.locator('.cfg__views--rail button', { hasText: tab }).first().click()
      await page.waitForTimeout(100)
      await page.locator('nav[aria-label="State triggers"] button', { hasText: label }).first().click()
    }
    const settled = () =>
      page.waitForFunction(
        () => window.__lucet && !window.__lucet.inspect().running && !document.querySelector('.lucet-thread__caret'),
        null,
        { timeout: 25000 },
      )
    const resetAndInspect = async (where) => {
      const resetButton = page.locator('.cfg__rail-top button', { hasText: 'Reset' }).first()
      if (await resetButton.isEnabled()) await resetButton.click()
      else failures.push(`reset (${where}): Reset is disarmed while there is state to wipe`)
      await page.waitForTimeout(200)
      const r = await page.evaluate(() => ({
        ...window.__lucet.inspect(),
        turns: document.querySelectorAll('.lucet-thread__pair').length,
        banners: document.querySelectorAll('.lucet-notice, .lucet-thread__restored, .lucet-prompt__status').length,
      }))
      checks++
      if (r.pendingTimers !== 0 || r.running || r.pendingReply !== null || r.queued !== null || r.locked || r.turns !== 0 || r.banners !== 0)
        failures.push(`reset (${where}): not clean after Reset — ${JSON.stringify(r)}`)
    }
    /* 0. One source (round 06, §0 B): the rail's two tabs list exactly the
       registry's scenarios of each kind, same labels, same order. A stale
       duplicate entry could never hide here. */
    await coldStart()
    const railLabels = async (tab) => {
      await page.locator('.cfg__views--rail button', { hasText: tab }).first().click()
      await page.waitForTimeout(120)
      return page.evaluate(() => [...document.querySelectorAll('nav[aria-label="State triggers"] .cfg__trigger')].map((b) => b.textContent.trim()))
    }
    const railStates = await railLabels('States')
    const railFeatures = await railLabels('Features')
    await page.locator('.cfg__views--rail button', { hasText: 'States' }).first().click()
    const registry = await page.evaluate(() => {
      const all = window.__lucet.triggers.groups().flatMap((g) => g.scenarios)
      return { states: all.filter((x) => (x.kind ?? 'state') === 'state').map((x) => x.label), features: all.filter((x) => x.kind === 'feature').map((x) => x.label) }
    })
    checks++
    /* The rail's own cold start rides with the Baseline group, wherever that
       group sits; everything else is the registry, in the registry's order. */
    if (railStates.filter((l) => l === 'Empty & cold start').length !== 1
      || railStates.filter((l) => l !== 'Empty & cold start').join('|') !== registry.states.join('|')
      || railFeatures.join('|') !== registry.features.join('|'))
      failures.push(`rail: the tabs do not mirror the registry — ${JSON.stringify({ railStates, railFeatures, registry })}`)
    /* 1. Do visibly does — and STAGES it (round 06): every receipt enters
       pending, one runs at a time, the answer waits for the last. Sampled
       mid-sequence, not only at rest: the clock starts when the click has
       landed, so the samples sit between the group's own boundaries
       (250 → 730 → 1180 → 1700 ms). */
    await coldStart()
    await page.locator('.lucet-chips__chip', { hasText: 'Turn my notes into a short plan' }).first().click()
    const doT0 = Date.now()
    const sampleDo = async (at) => {
      const wait = at - (Date.now() - doT0)
      if (wait > 0) await page.waitForTimeout(wait)
      return page.evaluate(() => {
        const turn = [...document.querySelectorAll('.lucet-thread__pair')].at(-1)
        const tools = turn ? [...turn.querySelectorAll('.lucet-tool')] : []
        return {
          statuses: tools.map((t) => t.dataset.status),
          marks: tools.map((t) => t.querySelector('.lucet-tool__mark')?.dataset.status),
          words: tools.map((t) => t.querySelector('.lucet-tool__state-word')?.textContent.trim() ?? (t.querySelector('.lucet-tool__detail')?.textContent.trim() ?? null)),
          markBoxes: tools.map((t) => { const r = t.querySelector('.lucet-tool__mark')?.getBoundingClientRect(); return r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null }),
          nameX: tools.map((t) => Math.round(t.querySelector('.lucet-tool__name')?.getBoundingClientRect().left ?? 0)),
          answer: !!turn?.querySelector('.lucet-md'),
        }
      })
    }
    const s1 = await sampleDo(480)
    const s2 = await sampleDo(950)
    const s3 = await sampleDo(1450)
    checks++
    if (s1.statuses.join() !== 'running,pending,pending' || s1.words.join('|') !== 'Running|Waiting to run|Waiting to run' || s1.marks.join() !== s1.statuses.join() || s1.answer
      || s1.markBoxes.some((b) => b !== '16x16')
      || s2.statuses.join() !== 'succeeded,running,pending' || s2.answer || s2.words[0] !== '4 sections from 2 notes' || s2.words[1] !== 'Running'
      || s3.statuses.join() !== 'succeeded,succeeded,running' || s3.answer
      || s1.nameX.join() !== s3.nameX.join())
      failures.push(`do-plan: the receipts are not staged, or a mark moved the name — ${JSON.stringify({ s1, s2, s3 })}`)
    await settled()
    await page.waitForTimeout(150)
    const did = await page.evaluate(() => {
      const turn = [...document.querySelectorAll('.lucet-thread__pair')].at(-1)
      const order = [...turn.querySelectorAll('.lucet-tool, .lucet-md, .lucet-sources')].map((e) => e.className.split(' ')[0])
      const created = turn.querySelector('.lucet-sources')
      const steps = window.__lucet.triggers.get('do-plan').steps
      return { turns: document.querySelectorAll('.lucet-thread__pair').length, order, label: created?.querySelector('.lucet-sources__label')?.textContent.trim(), rows: created ? created.querySelectorAll('details.lucet-source').length : 0, ms: steps.reduce((a, s) => a + (s.type === 'tools' ? s.items.reduce((x, i) => x + i.ms, 0) : s.type === 'tool' ? s.ms : 0), 0), staged: steps.some((s) => s.type === 'tools' && s.items.length === 3) }
    })
    checks++
    if (did.turns !== 1 || did.order.slice(0, 3).join() !== 'lucet-tool,lucet-tool,lucet-tool' || did.order.indexOf('lucet-md') !== 3 || did.label !== 'Created' || did.rows !== 3 || did.ms < 1300 || did.ms > 1800 || !did.staged)
      failures.push(`do-plan: receipts, summary and created rows are not in order — ${JSON.stringify(did)}`)
    await resetAndInspect('do-plan')
    /* 1a. The same staging from the OTHER entry points (the timing review,
       2026-09-03): the rail trigger and the deep link must run the sequence
       exactly as the cold-start suggestion does — no entry point presents a
       settled state in place of it. The deep link opens on two settled
       history turns first, so the samples read the LAST turn. */
    const stagedFrom = async (name, t0) => {
      const at = async (ms) => {
        const wait = ms - (Date.now() - t0)
        if (wait > 0) await page.waitForTimeout(wait)
        return page.evaluate(() => {
          const turn = [...document.querySelectorAll('.lucet-thread__pair')].at(-1)
          return { statuses: turn ? [...turn.querySelectorAll('.lucet-tool')].map((e) => e.dataset.status) : [], answer: !!turn?.querySelector('.lucet-md'), firstOnPage: document.querySelector('.lucet-tool')?.dataset.status ?? null }
        })
      }
      const r1 = await at(480), r2 = await at(950), r3 = await at(1450)
      checks++
      if (r1.statuses.join() !== 'running,pending,pending' || r1.answer || r2.statuses.join() !== 'succeeded,running,pending' || r2.answer || r3.statuses.join() !== 'succeeded,succeeded,running' || r3.answer)
        failures.push(`do-plan (${name}): the receipts are not staged from this entry point — ${JSON.stringify({ r1, r2, r3 })}`)
      await settled()
      await page.waitForTimeout(150)
    }
    await coldStart()
    await fireFromRail('Do —', 'States')
    await stagedFrom('rail trigger', Date.now())
    await resetAndInspect('do-plan via the rail')
    await page.goto(url.replace('primitives.html', 'index.html?state=do-plan'))
    await still()
    await page.waitForFunction(() => window.__lucet && window.__lucet.getState().turns.length === 3, null, { timeout: 15000 })
    await stagedFrom('deep link', Date.now())
    await resetAndInspect('do-plan via the deep link')
    /* 1b. Reset mid-group cancels what remains. */
    await coldStart()
    await page.locator('.lucet-chips__chip', { hasText: 'Turn my notes into a short plan' }).first().click()
    await page.waitForTimeout(600)
    await resetAndInspect('do-plan mid-group')
    /* 2. Fallback model, told plainly: model, reason and impact without the rail. */
    await coldStart()
    await fireFromRail('Fallback model used', 'States')
    await settled()
    await page.waitForTimeout(150)
    const told = await page.evaluate(() => {
      const turn = [...document.querySelectorAll('.lucet-thread__pair')].at(-1)
      const notice = turn.querySelector('.lucet-notice')
      const answer = turn.querySelector('.lucet-md')
      const model = document.querySelector('.lucet-budget__button')?.textContent || ''
      return { state: notice?.dataset.state, tone: notice?.dataset.tone, label: notice?.querySelector('.lucet-notice__label')?.textContent, text: notice?.querySelector('.lucet-notice__text')?.textContent || '', beforeAnswer: notice && answer ? !!(notice.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING) : false, action: notice?.querySelector('button')?.textContent.trim(), model: /Fast/.test(model), euphemism: /faster and less careful/.test(document.body.textContent) }
    })
    checks++
    if (told.state !== 'degraded' || told.tone !== 'info' || told.label !== 'Using Fast instead of Auto.' || !/^Auto is temporarily unavailable/.test(told.text) || !told.beforeAnswer || told.action !== 'Retry on Auto' || !told.model || told.euphemism)
      failures.push(`degraded-model: the fallback is not told plainly — ${JSON.stringify(told)}`)
    await resetAndInspect('degraded-model')
    /* 3. Another person's turn: ownership visible, typed input queued, then
       sent — sampled LIVE (round 06): at 300 ms her prompt is new and her
       answer empty; at 1500 ms it is streaming; the queue sends itself
       when she lands; Send comes back when nothing was queued; Reset
       cancels a run and its queue. */
    await coldStart()
    await fireFromRail('Another person', 'Features')
    const adaT0 = Date.now()
    const sampleAda = async (at) => {
      const wait = at - (Date.now() - adaT0)
      if (wait > 0) await page.waitForTimeout(wait)
      return page.evaluate(() => {
        const s = window.__lucet.getState()
        const last = s.turns.at(-1)
        const text = last?.response?.parts.filter((p) => p.kind === 'text').map((p) => p.text).join('') ?? ''
        const strip = document.querySelector('.lucet-prompt__status')
        const f = document.querySelector('.lucet-prompt__field')
        return { turns: s.turns.length, author: last?.prompt.authorId ?? null, locked: s.composer.locked, by: s.composer.lockedBy, strip: strip?.textContent.includes('Responding to Jennifer — you can queue a message'), stripRole: strip?.getAttribute('role'), face: !!strip?.querySelector('.lucet-avatar'), typeable: !!f && !f.disabled && !f.readOnly, chars: text.length, streaming: last?.response?.status === 'streaming' }
      })
    }
    const a1 = await sampleAda(300)
    const a2 = await sampleAda(1500)
    const full = 'Gathered. The northern site peaks in March, and the one number that moved since last week — the survey figure — is flagged for review.'.length
    await page.locator('.lucet-prompt__field').fill('And the southern site?')
    const queueButton = page.locator('.lucet-prompt button', { hasText: 'Queue' }).first()
    const queueLabel = (await queueButton.textContent().catch(() => '')).trim()
    await queueButton.click()
    await page.waitForTimeout(120)
    const queuedStrip = await page.evaluate(() => document.querySelector('.lucet-prompt__status')?.textContent.includes('Queued after Jennifer — yours sends next'))
    await page.waitForFunction(() => document.querySelectorAll('.lucet-thread__pair').length >= 2 && !window.__lucet.inspect().running && !window.__lucet.inspect().locked, null, { timeout: 30000 })
    const sent = await page.evaluate(() => ({ turns: document.querySelectorAll('.lucet-thread__pair').length, queued: window.__lucet.inspect().queued, last: [...document.querySelectorAll('.lucet-thread__prompt')].at(-1)?.textContent.trim(), yours: window.__lucet.getState().turns.at(-1)?.prompt.authorId }))
    checks++
    if (a1.turns !== 1 || a1.author !== 'Jennifer Lee' || !a1.locked || a1.by !== 'Jennifer Lee' || !a1.strip || a1.stripRole !== 'status' || !a1.face || !a1.typeable || a1.chars !== 0 || !a1.streaming
      || a2.turns !== 1 || !a2.locked || !a2.strip || a2.chars < 1 || a2.chars >= full || !a2.streaming
      || queueLabel !== 'Queue' || !queuedStrip || sent.turns !== 2 || sent.queued !== null || sent.last !== 'And the southern site?' || sent.yours !== 'you')
      failures.push(`multiplayer: ownership and the queue are not live — ${JSON.stringify({ a1, a2, full, queueLabel, queuedStrip, sent })}`)
    await resetAndInspect('multiplayer')
    /* 3a. Jennifer from the deep link (the timing review, 2026-09-03): the page
       opens on two settled history turns, then her turn runs live — sampled
       on the LAST turn, as a reader would see it. */
    await page.goto(url.replace('primitives.html', 'index.html?state=multiplayer'))
    await still()
    await page.waitForFunction(() => window.__lucet && window.__lucet.inspect().locked, null, { timeout: 15000 })
    const adaLinkT0 = Date.now()
    const adaLinkAt = async (ms) => {
      const wait = ms - (Date.now() - adaLinkT0)
      if (wait > 0) await page.waitForTimeout(wait)
      return page.evaluate(() => {
        const s = window.__lucet.getState(); const last = s.turns.at(-1)
        const text = last?.response?.parts.filter((p) => p.kind === 'text').map((p) => p.text).join('') ?? ''
        return { turns: s.turns.length, author: last?.prompt.authorId ?? null, by: s.composer.lockedBy, chars: text.length, streaming: last?.response?.status === 'streaming', strip: !!document.querySelector('.lucet-prompt__status')?.textContent.includes('Responding to Jennifer'), firstResponse: s.turns[0]?.response?.status ?? null }
      })
    }
    const l1 = await adaLinkAt(300), l2 = await adaLinkAt(1500)
    checks++
    if (l1.turns !== 3 || l1.author !== 'Jennifer Lee' || l1.by !== 'Jennifer Lee' || l1.chars !== 0 || !l1.streaming || !l1.strip || l1.firstResponse !== 'complete' || l2.chars < 1 || l2.chars >= full || !l2.streaming)
      failures.push(`multiplayer (deep link): Jennifer's turn is not live from the deep link — ${JSON.stringify({ l1, l2 })}`)
    await page.waitForFunction(() => !window.__lucet.inspect().running && !window.__lucet.inspect().locked, null, { timeout: 30000 })
    await resetAndInspect('multiplayer via the deep link')
    /* 3d. OWNERSHIP (component audit 06). While Jennifer's turn runs the person
       here is never offered Stop; the seat holds Queue, disabled until there
       are words and named for what it does. The strip names who asked and
       what this person can do, and claims nothing is queued until it is.
       Queue once by pointer, Enter and Space; a double click queues once
       and leaves focus in the field. Edit returns the words to the field
       before the queue lets go; Cancel queue drops them; Jennifer's response
       runs on through both. The handoff commits exactly one You turn, says
       so once, and your prompt names you to the reader. A stop during
       Jennifer's run is a terminal state: the queue keeps its promise. */
    {
      const own = () => page.evaluate(() => {
        const s = window.__lucet.getState(); const a = document.activeElement
        const acts = [...document.querySelectorAll('.lucet-prompt__actions')].find((e) => e.getBoundingClientRect().width > 0)
        const strip = [...document.querySelectorAll('.lucet-prompt__status')].find((e) => e.getBoundingClientRect().width > 0)
        const f = [...document.querySelectorAll('.lucet-prompt__field')].find((e) => e.getBoundingClientRect().width > 0)
        return {
          lockedBy: s.composer.lockedBy, queued: s.composer.queued, draft: f?.value ?? null, selection: f ? [f.selectionStart, f.selectionEnd] : null,
          turns: s.turns.map((t) => t.prompt.authorId + ':' + (t.response?.status ?? '-')),
          strip: strip?.querySelector('.lucet-orb-row__label, .lucet-orb__label')?.textContent.trim() ?? strip?.textContent.trim() ?? null,
          queuedText: strip?.querySelector('.lucet-prompt__queued-text')?.textContent ?? null,
          queuedActions: strip ? [...strip.querySelectorAll('.lucet-prompt__queued-actions button')].map((b) => b.textContent.trim()) : [],
          actions: acts ? [...acts.querySelectorAll('button')].map((b) => ({ label: b.textContent.trim() || b.getAttribute('aria-label'), aria: b.getAttribute('aria-label'), disabled: b.disabled })) : [],
          focus: a === document.body ? 'body' : (a?.className?.toString().split(' ')[0] || a?.tagName),
          said: [...document.querySelectorAll('.lucet-prompt .lucet-visually-hidden[role="status"]')].map((e) => e.textContent.trim()).filter(Boolean).at(-1) ?? null,
          youLabels: [...document.querySelectorAll('.lucet-thread__turn[data-self] .lucet-visually-hidden')].map((e) => e.textContent).filter((t) => t === 'You').length,
          adaLabels: [...document.querySelectorAll('.lucet-thread__author')].map((e) => e.textContent),
          stipOpacity: (() => { const tip = acts?.querySelector('.lucet-tip'); return tip ? getComputedStyle(tip).opacity : null })(),
        }
      })
      const ada = async () => { await coldStart(); await fireFromRail('Another person', 'Features'); await page.waitForFunction(() => window.__lucet.inspect().locked, null, { timeout: 15000 }); await page.waitForTimeout(300) }
      const queueSeat = () => page.locator('.lucet-prompt__actions button', { hasText: /^Queue/ }).first()
      await ada()
      const empty = await own()
      await page.locator('.lucet-prompt__field').fill('Also list the owners.')
      await page.evaluate(() => { const f = document.querySelector('.lucet-prompt__field'); f.focus(); f.setSelectionRange(5, 13) })
      const typed = await own()
      checks += 2
      if (empty.actions.some((b) => /Stop/.test(b.label || '')) || typed.actions.some((b) => /Stop/.test(b.label || '')) || empty.actions.length !== 1 || empty.actions[0].disabled !== true || !/^Queue — sends after Jennifer/.test(empty.actions[0].aria || '') || typed.actions[0].disabled !== false)
        failures.push(`ownership: while Jennifer owns the turn the seat holds a named Queue, disabled until there are words, and never Stop — ${JSON.stringify({ empty: empty.actions, typed: typed.actions })}`)
      if (empty.strip !== 'Responding to Jennifer — you can queue a message' || typed.strip !== 'Responding to Jennifer — Queue sends after this response' || typed.selection?.join() !== '5,13')
        failures.push(`ownership copy: the strip must name who asked and what this person can do, without claiming a queue — ${JSON.stringify({ empty: empty.strip, typed: typed.strip })}`)
      /* queue by pointer; Edit; queue again; Cancel; queue again by Enter; handoff */
      await queueSeat().click(); await page.waitForTimeout(100); const queued = await own()
      await page.locator('.lucet-prompt__queued-actions button', { hasText: 'Edit' }).click(); await page.waitForTimeout(150); const edited = await own()
      await queueSeat().click(); await page.waitForTimeout(100)
      await page.locator('.lucet-prompt__queued-actions button', { hasText: 'Cancel queue' }).click(); await page.waitForTimeout(150); const cancelled = await own()
      await page.locator('.lucet-prompt__field').fill('Also list the owners.'); await page.keyboard.press('Enter'); await page.waitForTimeout(100); const queuedEnter = await own()
      checks += 3
      if (queued.queued !== 'Also list the owners.' || queued.draft !== '' || !queued.strip?.startsWith('Queued after Jennifer — yours sends next') || queued.queuedText !== 'Also list the owners.' || queued.queuedActions.join('|') !== 'Edit|Cancel queue' || queued.focus !== 'lucet-prompt__field' || queued.actions.length !== 1 || queued.actions[0].label !== 'Queued' || queued.actions[0].disabled !== true)
        failures.push(`ownership queue: one press lodges the words, shows them with Edit and Cancel queue, keeps focus in the field, and the seat reads Queued — ${JSON.stringify(queued)}`)
      if (edited.queued !== null || edited.draft !== 'Also list the owners.' || edited.focus !== 'lucet-prompt__field' || edited.selection?.join() !== '21,21' || edited.said !== 'Queued message returned to the field.' || edited.lockedBy !== 'Jennifer Lee' || !/streaming/.test(edited.turns.join()))
        failures.push(`ownership edit: Edit must return the exact words to the field with the caret after them, say so, and leave Jennifer's run alone — ${JSON.stringify(edited)}`)
      if (cancelled.queued !== null || cancelled.draft !== '' || cancelled.focus !== 'lucet-prompt__field' || cancelled.said !== 'Queued message cancelled.' || cancelled.lockedBy !== 'Jennifer Lee' || !/streaming/.test(cancelled.turns.join()) || queuedEnter.queued !== 'Also list the owners.')
        failures.push(`ownership cancel: Cancel queue must drop only the queued words, say so, keep focus, and leave Jennifer's run alone; Enter must queue again — ${JSON.stringify({ cancelled, queuedEnter: queuedEnter.queued })}`)
      /* a resting pointer on the seat must not raise the Stop tip at the handoff */
      { const b = await queueSeat().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2) }
      await page.waitForFunction(() => window.__lucet.getState().turns.length >= 2 && window.__lucet.getState().composer.lockedBy === 'you', null, { timeout: 30000 }); await page.waitForTimeout(200)
      const handed = await own()
      await settled(); await page.waitForTimeout(200); const done = await own()
      checks += 2
      if (handed.turns.length !== 2 || !handed.turns[1].startsWith('you:') || handed.queued !== null || handed.strip !== 'Responding to you' || handed.said !== 'Your queued message was sent — responding to you.' || !handed.actions.some((b) => b.label === 'Stop') || handed.stipOpacity !== '0')
        failures.push(`ownership handoff: one You turn, "Responding to you", said once, Stop for the owner with its tip still down under the resting pointer — ${JSON.stringify(handed)}`)
      if (done.turns.join('|') !== 'Jennifer Lee:complete|you:complete' || done.youLabels !== 1 || done.adaLabels.join() !== 'Jennifer Lee' || done.focus === 'body')
        failures.push(`ownership attribution: Jennifer's turn intact, your prompt named to the reader, focus not on body — ${JSON.stringify({ turns: done.turns, you: done.youLabels, ada: done.adaLabels, focus: done.focus })}`)
      await resetAndInspect('ownership (handoff)')
      /* Space queues once; a double click queues once and keeps focus off body */
      await ada(); await page.locator('.lucet-prompt__field').fill('By Space'); await queueSeat().focus(); await page.keyboard.press('Space'); await page.waitForTimeout(100); const bySpace = await own()
      await resetAndInspect('ownership (space)')
      await ada(); await page.locator('.lucet-prompt__field').fill('Twice'); await queueSeat().dblclick(); await page.waitForTimeout(150); const doubled = await own()
      checks++
      if (bySpace.queued !== 'By Space' || doubled.queued !== 'Twice' || doubled.focus === 'body' || doubled.turns.length !== 1)
        failures.push(`ownership inputs: Space queues once; a double click queues once and leaves focus in the composer — ${JSON.stringify({ bySpace: bySpace.queued, doubled: { queued: doubled.queued, focus: doubled.focus, turns: doubled.turns } })}`)
      await resetAndInspect('ownership (double)')
      /* a stop during Jennifer's run is terminal for the queue: it sends */
      await ada(); await page.locator('.lucet-prompt__field').fill('After her stop'); await queueSeat().click(); await page.waitForTimeout(100)
      await page.evaluate(() => window.__lucet.abort())
      await page.waitForFunction(() => window.__lucet.getState().turns.length >= 2, null, { timeout: 15000 }); await settled(); await page.waitForTimeout(200); const afterStop = await own()
      checks++
      if (afterStop.turns.join('|') !== 'Jennifer Lee:interrupted|you:complete' || afterStop.queued !== null)
        failures.push(`ownership terminal: Jennifer's stopped run must release the queue, which sends once — ${JSON.stringify(afterStop.turns)}`)
      await resetAndInspect('ownership (terminal)')
    }
    /* 3d'. THE QUEUED ITEM IS HEARD AND REACHABLE (component audit 06 rider):
       the status strip is the live region -- role=status -- and its text
       changes exactly once when Queue is accepted, to the queued item, while
       the hidden announcer stays silent; a harmless re-render (typing into
       the field while queued) changes nothing. Edit and Cancel queue offer
       targets of at least 40x40 that do not overlap, with a focus ring that
       nothing clips. */
    {
      await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(200)
      await page.evaluate(() => { void window.__lucet.trigger('multiplayer') })
      await page.waitForFunction(() => window.__lucet.inspect().locked, null, { timeout: 15000 }); await page.waitForTimeout(300)
      await page.evaluate(() => { const root = document.querySelector('.lucet-prompt'); window.__liveLog = []; window.__saidLog = []; const snap = () => { const el = document.querySelector('.lucet-prompt__status'); const t = el ? el.textContent.replace(/\s+/g, ' ').trim() : null; if (window.__liveLog.at(-1) !== t) window.__liveLog.push(t); const h = document.querySelector('.lucet-prompt .lucet-visually-hidden[role="status"]')?.textContent ?? null; if (window.__saidLog.at(-1) !== h) window.__saidLog.push(h) }; snap(); new MutationObserver(snap).observe(root, { subtree: true, childList: true, characterData: true, attributes: true }) })
      const fieldQ = page.locator('.lucet-prompt__field:visible').first(), seatQ = page.locator('.lucet-prompt__actions:visible button', { hasText: /^Queue/ }).first()
      await fieldQ.fill('Also list the owners.'); await page.waitForTimeout(80)
      const beforeQ = await page.evaluate(() => ({ live: window.__liveLog.length, said: window.__saidLog.length, role: document.querySelector('.lucet-prompt__status')?.getAttribute('role') }))
      await seatQ.click(); await page.waitForTimeout(150)
      const afterQ = await page.evaluate(() => ({ live: window.__liveLog.length, last: window.__liveLog.at(-1), said: window.__saidLog.length }))
      await fieldQ.type('x'); await page.waitForTimeout(80)
      const afterType = await page.evaluate(() => ({ live: window.__liveLog.length }))
      checks++
      if (beforeQ.role !== 'status' || afterQ.live !== beforeQ.live + 1 || !String(afterQ.last).startsWith('Queued after Jennifer — yours sends next') || !String(afterQ.last).includes('Also list the owners.') || afterQ.said !== beforeQ.said || afterType.live !== afterQ.live)
        failures.push(`queued item is heard once: the status strip (role=status) changes exactly once on Queue and not on a re-render while the hidden announcer stays silent — ${JSON.stringify({ beforeQ, afterQ, afterType })}`)
      const hits = await page.evaluate(() => { const btns = [...document.querySelectorAll('.lucet-prompt__queued-actions button')]; const hit = (el) => { const b = el.getBoundingClientRect(); let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity; for (let x = b.left - 20; x <= b.right + 20; x += 1) for (let y = b.top - 20; y <= b.bottom + 20; y += 1) { const t = document.elementFromPoint(x, y); if (t && (t === el || el.contains(t))) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) } } return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } }; const clipped = (el) => { let a = el.parentElement; while (a && a !== document.body) { const cs = getComputedStyle(a); if (/(hidden|clip|auto|scroll)/.test(cs.overflow) && !a.className.toString().includes('cfg__frame')) return a.className.toString(); a = a.parentElement } return null }; return btns.map((b) => ({ label: b.textContent.trim(), hit: hit(b), clipper: clipped(b) })) })
      const overlapQ = hits.length === 2 && hits[0].hit.x + hits[0].hit.w > hits[1].hit.x && hits[1].hit.x + hits[1].hit.w > hits[0].hit.x && hits[0].hit.y + hits[0].hit.h > hits[1].hit.y && hits[1].hit.y + hits[1].hit.h > hits[0].hit.y
      await page.locator('.lucet-prompt__queued-actions button').first().focus(); await page.waitForTimeout(50)
      const ringQ = await page.evaluate(() => { const b = document.activeElement; const cs = getComputedStyle(b); return { label: b.textContent.trim(), visible: b.matches(':focus-visible'), outline: cs.outlineStyle, width: parseFloat(cs.outlineWidth) } })
      checks++
      if (hits.length !== 2 || hits.some((h) => h.hit.w < 40 || h.hit.h < 40 || h.clipper) || overlapQ || !ringQ.visible || ringQ.outline === 'none' || ringQ.width < 2)
        failures.push(`Edit and Cancel queue: 40x40 targets, no overlap, unclipped focus ring — ${JSON.stringify({ hits, overlapQ, ringQ })}`)
      await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(200)
    }

    /* 3e. ATTACHMENTS, SOURCES AND THE MENU'S ANCHOR (component audit 07).
       A queued message owns its files: Queue is held while a file uploads or
       has failed and says why; Queue moves the staged files into the queued
       item, read-only; Edit returns them, Cancel queue drops them, and the
       handoff sends exactly the queued files while a file staged since stays
       behind. The strip names the file that blocks a send. Focus is placed
       before a removed chip goes and after a retry; each act is spoken once.
       The handoff renders no frame with a queue and nobody holding the
       floor, and completion no "Sending…". Inline [n] markers link to their
       rows: Enter moves focus in, Escape closes a receipt, Escape again
       returns to the marker. Source rows are 40px targets. The budget panel
       opens with its start edge on its trigger, 5–8px above it. */
    {
      await page.goto(url.replace('primitives.html', 'index.html?instant=1'))
      await page.waitForSelector('.lucet-prompt__field'); await page.waitForTimeout(400)
      await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(200)
      const att = () => page.locator('.lucet-prompt button[aria-label="Attach a file"]').first()
      const look = () => page.evaluate(() => {
        const s = window.__lucet.getState(); const a = document.activeElement
        const seat = [...document.querySelectorAll('.lucet-prompt__actions button')].find((b) => b.getBoundingClientRect().width > 0)
        return {
          staged: [...document.querySelectorAll('.lucet-prompt__atts .lucet-prompt__att')].map((c) => ({ name: c.querySelector('.lucet-prompt__att-name')?.textContent, status: c.dataset.status, word: c.querySelector('.lucet-prompt__att-reason')?.textContent ?? null, buttons: c.querySelectorAll('button').length })),
          queuedChips: [...document.querySelectorAll('.lucet-prompt__queued-atts .lucet-prompt__att')].map((c) => ({ name: c.querySelector('.lucet-prompt__att-name')?.textContent, buttons: c.querySelectorAll('button').length })),
          queued: s.composer.queued, queuedAtt: s.composer.queuedAttachments.map((x) => x.name), lockedBy: s.composer.lockedBy,
          strip: document.querySelector('.lucet-prompt__status')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
          seat: seat ? { text: seat.textContent.trim(), disabled: seat.disabled, label: seat.getAttribute('aria-label') } : null,
          focus: a === document.body ? 'body' : (a?.getAttribute('aria-label') || a?.className || a?.tagName),
          said: document.querySelector('.lucet-prompt .lucet-visually-hidden[role="status"]')?.textContent ?? null,
          turns: s.turns.map((t) => ({ author: t.prompt.authorId ?? 'you', atts: t.prompt.parts.filter((p) => p.kind === 'attachment').map((p) => p.name) })),
          threadChips: [...document.querySelectorAll('.lucet-thread__atts .lucet-att')].map((c) => c.dataset.kind),
          faces: [...document.querySelectorAll('.lucet-thread .lucet-avatar')].map((e) => e.textContent.trim()),
        }
      })
      /* the demo host's files: document, image, then one that fails */
      await page.locator('.lucet-prompt__field').fill('What changed between these two?')
      await att().click(); await att().click(); await att().click(); await page.waitForTimeout(150)
      const up = await look()
      await page.waitForTimeout(1400)
      const settled = await look()
      checks++
      if (up.staged.length !== 3 || !up.staged.every((c) => c.status === 'uploading' && c.word === 'Uploading…') || up.strip !== 'Uploading 3 attachments…' || settled.staged.filter((c) => c.status === 'ready').length !== 2 || settled.staged[2]?.status !== 'failed' || !settled.strip?.startsWith(`${settled.staged[2]?.name} didn’t upload`))
        failures.push(`attachments: three uploads wear their word and the strip counts them; the failed file is named by the strip — ${JSON.stringify({ up: { staged: up.staged, strip: up.strip }, settled: { staged: settled.staged, strip: settled.strip } })}`)
      /* retry lands on the chip's Remove and is spoken once; recovery clears the strip */
      await page.locator('.lucet-prompt__att[data-status="failed"] button[aria-label^="Try"]').first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(100)
      const retrying = await look(); await page.waitForTimeout(1400); const recovered = await look()
      checks++
      if (retrying.staged[2]?.status !== 'uploading' || !retrying.focus?.startsWith('Remove ') || !retrying.said?.startsWith('Trying ') || recovered.staged.some((c) => c.status !== 'ready') || recovered.strip !== null)
        failures.push(`attachments: retry once, focus on the chip's Remove, spoken once, strip clears on recovery — ${JSON.stringify({ retrying: { s: retrying.staged[2], focus: retrying.focus, said: retrying.said }, recovered: { strip: recovered.strip } })}`)
      /* remove: focus to the next file's action, else the previous, else Attach */
      const removeAt = async (nth) => { await page.locator('.lucet-prompt__att button[aria-label^="Remove"]').nth(nth).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(100); return look() }
      const r1 = await removeAt(1), r2 = await removeAt(1), r3 = await removeAt(0)
      checks++
      if (r1.staged.length !== 2 || r1.focus !== `Remove ${r1.staged[1]?.name}` || r2.staged.length !== 1 || r2.focus !== `Remove ${r2.staged[0]?.name}` || r3.staged.length !== 0 || r3.focus !== 'Attach a file' || !r3.said?.startsWith('Removed ') || (await page.evaluate(() => document.querySelector('.lucet-prompt__field').value)) !== 'What changed between these two?')
        failures.push(`attachments: removal places focus next → previous → Attach, keeps the draft, speaks once — ${JSON.stringify({ r1: r1.focus, r2: r2.focus, r3: r3.focus, said: r3.said })}`)
      /* Queue held by an upload, then the queued item owns the files; a newer file stays behind at the handoff */
      await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(200)
      await page.evaluate(() => { void window.__lucet.trigger('multiplayer') }); await page.waitForFunction(() => window.__lucet.inspect().locked, null, { timeout: 15000 }); await page.waitForTimeout(250)
      await page.evaluate(() => { const strip = () => { const el = document.querySelector('.lucet-prompt__status'); return el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : null }; window.__stripLog = []; const snap = () => { const t = strip(); if (window.__stripLog.at(-1) !== t) window.__stripLog.push(t) }; snap(); new MutationObserver(snap).observe(document.querySelector('.lucet-prompt'), { subtree: true, childList: true, characterData: true, attributes: true }) })
      await page.locator('.lucet-prompt__field').fill('Also compare with this.')
      /* Staged through the store: the host's rhythm was proved above, and her
         run is four seconds long. An upload in flight first, then settled. */
      let staged = 0
      const stage = async (name, kind = 'document') => { const id = `aud${++staged}`; await page.evaluate(([id, name, kind]) => window.__lucet.store.dispatch({ type: 'attachment/added', id, name, fileKind: kind, sizeBytes: 240_000 }), [id, name, kind]); await page.waitForTimeout(80); return id }
      const settle = async (id) => { await page.evaluate((id) => window.__lucet.store.dispatch({ type: 'attachment/settled', id, status: 'ready', reason: null }), id); await page.waitForTimeout(80) }
      const attachReady = async (name = 'brief.pdf') => { const id = await stage(name); await settle(id) }
      const heldId = await stage('brief.pdf'); const held = await look(); await settle(heldId)
      checks++
      if (!held || held.seat?.text !== 'Queue' || held.seat?.disabled !== true || !held.seat?.label?.includes('upload') || !held.strip?.includes('Queue sends once your upload finishes') || held.lockedBy !== 'Jennifer Lee' || !held.strip?.includes('Responding to Jennifer'))
        failures.push(`queue held by an uploading file, named for why, and the owner is Jennifer by first name — ${JSON.stringify(held && { seat: held.seat, strip: held.strip, lockedBy: held.lockedBy })}`)
      await page.locator('.lucet-prompt__actions button', { hasText: /^Queue$/ }).first().click(); await page.waitForTimeout(120)
      const queuedQ = await look()
      await attachReady('later.png'); const newer = await look()
      await page.waitForFunction(() => window.__lucet.getState().turns.length >= 2 && !window.__lucet.inspect().running && !window.__lucet.inspect().locked, null, { timeout: 40000 }); await page.waitForTimeout(300)
      const done = await look()
      const stripLog = await page.evaluate(() => window.__stripLog)
      checks++
      if (queuedQ.staged.length !== 0 || queuedQ.queuedChips.length !== 1 || queuedQ.queuedChips[0]?.buttons !== 0 || !queuedQ.strip?.startsWith('Queued after Jennifer — yours sends next') || newer.staged.length !== 1 || done.turns[1]?.author !== 'you' || done.turns[1]?.atts.length !== 1 || done.turns[1]?.atts[0] !== queuedQ.queuedAtt[0] || done.staged.length !== 1 || done.staged[0]?.name !== newer.staged[0]?.name || done.threadChips[0] !== 'doc' || done.faces[0] !== 'JL')
        failures.push(`the queued item owns its file, read-only; the handoff sends exactly it and a newer file stays behind; provenance chip by kind; JL — ${JSON.stringify({ queuedQ: { staged: queuedQ.staged.length, chips: queuedQ.queuedChips, strip: queuedQ.strip }, newer: newer.staged, done: { turns: done.turns, staged: done.staged, chips: done.threadChips, faces: done.faces } })}`)
      checks++
      if (stripLog.some((t) => t && (t.startsWith('Queued — sends after this response') || t.startsWith('Sending…'))) || !stripLog.some((t) => t === 'Responding to you') || stripLog.at(-1) !== null)
        failures.push(`no one-frame status between turns: the strip never shows "Queued — sends after this response" or "Sending…" around the handoff — ${JSON.stringify(stripLog)}`)
      /* Edit returns the files, Cancel queue drops them */
      await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(200)
      await page.evaluate(() => { void window.__lucet.trigger('multiplayer') }); await page.waitForFunction(() => window.__lucet.inspect().locked, null, { timeout: 15000 }); await page.waitForTimeout(250)
      await attachReady(); await page.locator('.lucet-prompt__field').fill('With the file.'); await page.locator('.lucet-prompt__actions button', { hasText: /^Queue$/ }).first().click(); await page.waitForTimeout(100)
      await page.locator('.lucet-prompt__queued-actions button', { hasText: 'Edit' }).first().click(); await page.waitForTimeout(100); const edited = await look()
      await page.locator('.lucet-prompt__actions button', { hasText: /^Queue$/ }).first().click(); await page.waitForTimeout(100)
      await page.locator('.lucet-prompt__queued-actions button', { hasText: 'Cancel queue' }).first().click(); await page.waitForTimeout(100); const cancelled = await look()
      checks++
      if (edited.staged.length !== 1 || edited.queued !== null || edited.said !== 'Queued message and its files returned to the field.' || cancelled.staged.length !== 0 || cancelled.queuedAtt.length !== 0 || cancelled.said !== 'Queued message and its files cancelled.')
        failures.push(`Edit returns the queued file to the staging row; Cancel queue drops it; each spoken once — ${JSON.stringify({ edited: { staged: edited.staged.length, said: edited.said }, cancelled: { staged: cancelled.staged.length, queuedAtt: cancelled.queuedAtt, said: cancelled.said } })}`)
      /* sources: markers link to rows; Enter in, Escape closes, Escape back; rows are 40px */
      await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(150); await page.evaluate(() => { void window.__lucet.trigger('source-updated') })
      await page.waitForFunction(() => { const t = window.__lucet.getState().turns.at(-1); return t?.response?.status && t.response.status !== 'streaming' }, null, { timeout: 40000 }); await page.waitForTimeout(2300)
      const cites = await page.evaluate(() => ({ links: [...document.querySelectorAll('.lucet-md__cite')].map((a) => a.getAttribute('href')), rows: [...document.querySelectorAll('.lucet-sources li')].map((li) => li.id), heights: [...document.querySelectorAll('.lucet-sources__row')].map((r) => Math.round(r.getBoundingClientRect().height)), stale: document.querySelector('.lucet-sources [data-status="stale"] .lucet-sources__flag')?.textContent.trim() ?? null, markers: [...document.querySelectorAll('.lucet-thread__doc .lucet-md')].map((el) => (el.textContent.match(/\[\d\]/g) ?? []).length).reduce((a, b) => a + b, 0) }))
      await page.locator('.lucet-md__cite').first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(150)
      const inRow = await page.evaluate(() => ({ cls: document.activeElement?.className, li: document.activeElement?.closest('li')?.id ?? null }))
      await page.keyboard.press('Enter'); await page.waitForTimeout(150); const opened = await page.evaluate(() => [...document.querySelectorAll('.lucet-sources details')].map((d) => d.open))
      await page.keyboard.press('Escape'); await page.waitForTimeout(100); const closed = await page.evaluate(() => ({ open: [...document.querySelectorAll('.lucet-sources details')].map((d) => d.open), cls: document.activeElement?.className }))
      await page.keyboard.press('Escape'); await page.waitForTimeout(100); const back = await page.evaluate(() => document.activeElement?.className)
      checks++
      if (cites.links.length !== cites.markers || cites.links.some((h, i) => !cites.rows.includes(h.slice(1))) || cites.rows.length !== 3 || cites.heights.some((h) => h < 40) || !cites.stale || inRow.li !== cites.links[0].slice(1) || !inRow.cls?.includes('lucet-sources__row') || opened[0] !== true || closed.open[0] !== false || !closed.cls?.includes('lucet-sources__row') || back !== 'lucet-md__cite')
        failures.push(`citations map to rows and move focus in and back; Escape closes a receipt; rows are 40px targets — ${JSON.stringify({ cites, inRow, opened, closed, back })}`)
      /* the budget panel anchors to its trigger */
      await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(150)
      await page.locator('.lucet-budget__button').first().click(); await page.waitForTimeout(450)
      const anchored = await page.evaluate(() => { const r = (el) => el.getBoundingClientRect(); const t = r(document.querySelector('.lucet-budget__button')), p = r(document.querySelector('.lucet-budget__panel')), b = r(document.querySelector('.lucet-prompt__bar')); return { dx: Math.round(p.left - t.left), gap: Math.round(t.top - p.bottom), inside: p.left >= b.left - 1 && p.right <= b.right + 1, width: Math.round(p.width) } })
      await page.keyboard.press('Escape'); await page.waitForTimeout(100)
      checks++
      if (anchored.dx !== 0 || anchored.gap < 5 || anchored.gap > 8 || !anchored.inside)
        failures.push(`the budget panel opens on its trigger's start edge, 5–8px above it, inside the bar — ${JSON.stringify(anchored)}`)
      /* at a phone width the panel takes the bar's inner width */
      await page.setViewportSize({ width: 320, height: 800 }); await page.waitForTimeout(300)
      await page.locator('.lucet-budget__button').first().click(); await page.waitForTimeout(450)
      const narrow = await page.evaluate(() => { const r = (el) => el.getBoundingClientRect(); const p = r(document.querySelector('.lucet-budget__panel')), b = r(document.querySelector('.lucet-prompt__bar')); return { left: Math.round(p.left - b.left), width: Math.round(p.width - b.width), scrollW: document.documentElement.scrollWidth } })
      await page.keyboard.press('Escape'); await page.waitForTimeout(100)
      /* a long filename at a phone width widens neither the composer nor the sent bubble past its column */
      await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(150)
      const bareWidth = await page.evaluate(() => [...document.querySelectorAll('.lucet-prompt')].find((e) => e.getBoundingClientRect().width > 0).getBoundingClientRect().width)
      await page.evaluate(() => { window.__lucet.store.dispatch({ type: 'attachment/added', id: 'audlong', name: 'site-visit-recordings-2026-08-final-selects-building-a.mp4', fileKind: 'other', sizeBytes: 480_000_000 }); window.__lucet.store.dispatch({ type: 'attachment/settled', id: 'audlong', status: 'ready', reason: null }) }); await page.waitForTimeout(150)
      const longComposer = await page.evaluate(() => { const vis = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0); const p = vis('.lucet-prompt').getBoundingClientRect(), f = vis('.cfg__floor').getBoundingClientRect(), chip = vis('.lucet-prompt__att').getBoundingClientRect(), row = vis('.lucet-prompt__atts').getBoundingClientRect(); return { width: p.width, floorRight: Math.round(f.right), right: Math.round(p.right), chipFits: chip.right <= row.right + 1, ext: vis('.lucet-prompt__att-ext')?.textContent } })
      longComposer.composerFits = Math.abs(longComposer.width - bareWidth) <= 1
      await page.evaluate(() => { void window.__lucet.submit('Compare these.') }); await page.waitForFunction(() => window.__lucet.getState().turns.length >= 1, null, { timeout: 15000 }); await page.waitForTimeout(500)
      const longBubble = await page.evaluate(() => { const vis = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0); const b = vis('.lucet-thread__prompt').getBoundingClientRect(), col = vis('.lucet-thread__turn').getBoundingClientRect(), chip = vis('.lucet-thread__atts .lucet-att')?.getBoundingClientRect(); return { bubbleFits: b.right <= col.right + 1 && b.width <= col.width * 0.9, chipFits: !!chip && chip.right <= b.right + 1, ext: vis('.lucet-att__ext')?.textContent } })
      await page.evaluate(() => window.__lucet.reset()); await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(200)
      checks++
      if (!longComposer.composerFits || !longComposer.chipFits || longComposer.ext !== '.mp4' || !longBubble.bubbleFits || !longBubble.chipFits || longBubble.ext !== '.mp4')
        failures.push(`a long filename at 320 stays inside the frame in the composer and inside its column on the sent turn, extension kept — ${JSON.stringify({ longComposer, longBubble })}`)
      checks++
      if (narrow.left !== 0 || narrow.width !== 0 || narrow.scrollW > 320)
        failures.push(`at 320 the budget panel spans the bar's inner width without widening the page — ${JSON.stringify(narrow)}`)
      /* the Components page: the attachments band and the provenance band */
      await page.goto(url.replace('primitives.html', 'components.html')); await page.waitForSelector('.sec'); await page.waitForTimeout(800)
      const bands = await page.evaluate(() => { const sec = (name) => [...document.querySelectorAll('.sec')].find((s) => s.querySelector('.sec__name')?.textContent.startsWith(name)); const shape = (el) => el ? { specs: [...el.querySelectorAll('.spec')].map((s) => ({ label: s.querySelector('.spec__label')?.textContent, band: s.classList.contains('spec--band'), y: Math.round(s.getBoundingClientRect().y) })) } : null; return { attachments: shape(sec('Attachments')), sources: shape(sec('Sources and provenance')), prompt: shape(sec('Prompt input')) } })
      checks++
      if (!bands.attachments || bands.attachments.specs.length !== 3 || !bands.attachments.specs[0]?.band || bands.attachments.specs[0]?.label !== 'Attachment variety' || !bands.sources || bands.sources.specs.length !== 3 || !bands.sources.specs[0]?.band || !bands.prompt || bands.prompt.specs.length !== 4 || new Set(bands.prompt.specs.map((s) => s.y)).size !== 2)
        failures.push(`the Components page shows an attachments band (variety as the showcase, two states beneath), a provenance band (standing as the showcase, the aged pair beneath), and a prompt-input grid of four with no orphan — ${JSON.stringify(bands)}`)
      await page.goto(url)
    }

    /* 3a'. GATE 0 OF THE COMPOSER AUDIT (round 01): the Queue interaction,
       asserted rather than eyeballed. Send → Queue → Stop moves nothing but
       the action group's own width; the queued feedback is immediate, read
       synchronously after the press with no wait; focus returns to the
       field, where the next words go; under reduced motion nothing in the
       composer animates. */
    await coldStart()
    const composerGeo = () => page.evaluate(() => {
      const vis = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0)
      const R = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] }
      const buttons = [...(vis('.lucet-prompt__actions')?.querySelectorAll('button') ?? [])]
      return { bar: R(vis('.lucet-prompt__bar')), field: R(vis('.lucet-prompt__field')), tool: R(vis('.lucet-prompt__tool')), chip: R(vis('.lucet-budget__button')), buttons: buttons.map((b) => (b.textContent.trim() || b.getAttribute('aria-label')) + ':' + R(b).slice(1, 4).join('x')), heights: buttons.map((b) => Math.round(b.getBoundingClientRect().height)), tops: buttons.map((b) => Math.round(b.getBoundingClientRect().top)) }
    })
    await fireFromRail('Another person', 'Features')
    await page.waitForFunction(() => window.__lucet.inspect().locked, null, { timeout: 10000 })
    await page.waitForTimeout(200)
    const g0 = await composerGeo()
    await page.locator('.lucet-prompt__field').fill('And the southern site?')
    await page.waitForTimeout(100)
    const g1 = await composerGeo()
    const queueBtn = page.locator('.lucet-prompt button', { hasText: 'Queue' }).first()
    await queueBtn.click()
    const immediate = await page.evaluate(() => ({ queued: window.__lucet.getState().composer.queued, strip: document.querySelector('.lucet-prompt__status')?.textContent.trim(), tone: document.querySelector('.lucet-prompt__status')?.dataset.tone, field: document.querySelector('.lucet-prompt__field')?.value, focusOnField: document.activeElement === document.querySelector('.lucet-prompt__field') }))
    const g2 = await composerGeo()
    await page.waitForFunction(() => window.__lucet.getState().turns.length >= 2 && !window.__lucet.inspect().running && !window.__lucet.inspect().locked, null, { timeout: 30000 })
    await page.waitForTimeout(150)
    const g3 = await composerGeo()
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
    /* The chip's WIDTH follows its price, which re-prices after a turn; its
       place and height are what the swap must not move. */
    const seat = (c) => (c ? [c[0], c[1], c[3]] : null)
    const stable = (x, y) => same(x.bar, y.bar) && same(x.field, y.field) && same(x.tool, y.tool) && same(seat(x.chip), seat(y.chip)) && x.heights.every((h) => h === 32) && y.heights.every((h) => h === 32) && same([...new Set(x.tops)], [...new Set(y.tops)])
    checks++
    if (!stable(g0, g1) || !stable(g1, g2) || !stable(g2, g3) || !g1.buttons.some((b) => b.startsWith('Queue:')) || !g2.buttons.some((b) => b.startsWith('Queued:')) || g0.buttons.some((b) => b.startsWith('Stop')) || g2.buttons.some((b) => b.startsWith('Stop')))
      failures.push(`composer gate 0: the action swap moved the composer — ${JSON.stringify({ g0, g1, g2, g3 })}`)
    checks++
    if (immediate.queued !== 'And the southern site?' || !immediate.strip.startsWith('Queued after Jennifer — yours sends next') || immediate.tone !== 'info' || immediate.field !== '' || !immediate.focusOnField)
      failures.push(`composer gate 0: queued feedback is not immediate, or focus left the field — ${JSON.stringify(immediate)}`)
    await resetAndInspect('composer gate 0')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await coldStart()
    await fireFromRail('Another person', 'Features')
    await page.waitForFunction(() => window.__lucet.inspect().locked, null, { timeout: 10000 })
    await page.locator('.lucet-prompt__field').fill('Quietly')
    await page.locator('.lucet-prompt button', { hasText: 'Queue' }).first().click()
    await page.waitForTimeout(200)
    const quiet = await page.evaluate(() => { const p = [...document.querySelectorAll('.lucet-prompt')].find((e) => e.getBoundingClientRect().width > 0); return { running: p.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length, strip: document.querySelector('.lucet-prompt__status')?.textContent.trim() } })
    checks++
    if (quiet.running !== 0 || !quiet.strip.startsWith('Queued after Jennifer — yours sends next'))
      failures.push(`composer gate 0: reduced motion still animates the composer — ${JSON.stringify(quiet)}`)
    await page.emulateMedia({ reducedMotion: null })
    await resetAndInspect('composer gate 0 (reduced motion)')
    /* The empty field's one instruction reads as text in every cell (composer audit, round 01). */
    const savedForPlaceholder = await page.evaluate(() => localStorage.getItem('lucet-docs-appearance'))
    const placeholderContrast = []
    for (const [theme, expression] of [['dark', 'paper'], ['dark', 'glass'], ['light', 'paper'], ['light', 'glass']]) {
      await page.evaluate(([t, e]) => localStorage.setItem('lucet-docs-appearance', JSON.stringify({ theme: t, expression: e, accent: 'violet', neutral: 'accent' })), [theme, expression])
      await page.emulateMedia({ colorScheme: theme })
      await coldStart()
      const c = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const g = canvas.getContext('2d', { willReadFrequently: true })
        const px = (color, under) => { g.clearRect(0, 0, 1, 1); if (under) { g.fillStyle = under; g.fillRect(0, 0, 1, 1) } g.fillStyle = color; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data] }
        const lum = ([r, gg, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b) }
        const field = [...document.querySelectorAll('.lucet-prompt__field')].find((e) => e.getBoundingClientRect().width > 0)
        let e = field; const stack = []; while (e && e !== document.documentElement) { const bg = getComputedStyle(e).backgroundColor; if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') stack.push(bg); e = e.parentElement } stack.push(getComputedStyle(document.body).backgroundColor)
        let under = null; for (const bg of stack.reverse()) { const p = px(bg, under ? 'rgba(' + under.join(',') + ')' : null); under = [p[0], p[1], p[2], 255] }
        const fg = px(getComputedStyle(field, '::placeholder').color, 'rgba(' + under.join(',') + ')')
        const a = lum(fg), b = lum(under); return +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05))).toFixed(2)
      })
      placeholderContrast.push({ theme, expression, contrast: c })
    }
    checks++
    if (placeholderContrast.some((p) => p.contrast < 4.5))
      failures.push(`composer: the placeholder falls under 4.5:1 — ${JSON.stringify(placeholderContrast)}`)
    await page.evaluate((saved) => { if (saved === null) localStorage.removeItem('lucet-docs-appearance'); else localStorage.setItem('lucet-docs-appearance', saved) }, savedForPlaceholder)
    await page.emulateMedia({ colorScheme: null })
    /* 3f. UPLOAD COMPLETION IS SPOKEN, AND THE THUMB GETS 44 (component audit
       07, closeout). A file that was uploading and is now ready is announced
       once by name — "quarterly-summary.pdf is ready." — and files that
       complete together are one sentence; nothing is spoken at mount, on a
       theme, expression, container or focus change, or for a file that
       arrives already ready; the sentence leaves the region when the row
       empties (sent, or reset). Under a coarse pointer every chip action
       presents a 44px zone that nothing clips and no other zone overlaps,
       in a row and when chips wrap; one tap, Enter or Space is one act,
       removal keeps its focus destination, and a retry never copies a file. */
    {
      const home = url.replace('primitives.html', 'index.html?instant=1')
      const saidSel = '.lucet-prompt .lucet-visually-hidden[role="status"]'
      const listen = () => page.evaluate((sel) => {
        window.__saidLog = []
        let last = null
        const read = () => { const els = [...document.querySelectorAll(sel)]; const vis = els.find((e) => (e.closest('.lucet-prompt')?.getBoundingClientRect().width ?? 0) > 0) ?? els[0]; return vis?.textContent ?? '' }
        const snap = () => { const t = read(); if (t !== last) { last = t; window.__saidLog.push(t) } }
        snap(); window.__saidLog = []
        window.__saidObs?.disconnect()
        window.__saidObs = new MutationObserver(snap)
        window.__saidObs.observe(document.body, { subtree: true, childList: true, characterData: true })
      }, saidSel)
      const spoken = () => page.evaluate(() => window.__saidLog.filter((t) => t !== ''))
      const readyOnes = (l) => l.filter((t) => / is ready\.$| attachments are ready\.$/.test(t))
      const ids = () => page.evaluate(() => window.__lucet.getState().composer.attachments.map((a) => `${a.id}:${a.status}`))
      const dispatch = (ev) => page.evaluate((ev) => window.__lucet.store.dispatch(ev), ev)
      const attach = () => page.locator('.lucet-prompt button[aria-label="Attach a file"]').first().click()

      /* mount is silent: the empty composer, and the page whose fixtures hold an uploading and a failed file */
      await page.goto(home); await page.waitForSelector('.lucet-prompt__field'); await page.evaluate(() => window.__lucet.reset()); await listen(); await page.waitForTimeout(1500)
      const atMount = await spoken()
      await page.goto(url.replace('primitives.html', 'components.html')); await page.waitForSelector('.lucet-prompt__field'); await page.waitForTimeout(1500)
      const fixturesSaid = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent).filter(Boolean), saidSel)
      checks++
      if (atMount.length > 0 || fixturesSaid.length > 0) failures.push(`ready announcement: mount must be silent — ${JSON.stringify({ atMount, fixturesSaid })}`)

      /* one document, one image: one sentence each, by name */
      await page.goto(home); await page.waitForSelector('.lucet-prompt__field'); await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(200); await listen()
      await attach(); await page.waitForTimeout(1700)
      const afterDoc = await spoken()
      await attach(); await page.waitForTimeout(1700)
      const afterImage = await spoken()
      checks++
      if (JSON.stringify(readyOnes(afterDoc)) !== JSON.stringify(['quarterly-summary.pdf is ready.']) || JSON.stringify(readyOnes(afterImage)) !== JSON.stringify(['quarterly-summary.pdf is ready.', 'site-photograph.jpg is ready.']))
        failures.push(`ready announcement: one document, one image, one sentence each by name — ${JSON.stringify({ afterDoc, afterImage })}`)

      /* a failure says nothing here (the strip speaks); a retry that succeeds is spoken once, after the retry sentence; a retry never copies the file */
      await attach(); await page.waitForTimeout(1700)
      const afterFail = await spoken()
      const before = await ids()
      await page.locator('.lucet-prompt__att[data-status="failed"] button[aria-label^="Try"]').first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(1700)
      const afterRetry = await spoken()
      const after = await ids()
      const tail = afterRetry.slice(afterFail.length)
      checks++
      if (readyOnes(afterFail).length !== 2 || JSON.stringify(tail) !== JSON.stringify(['Trying walkthrough-recording.mp4 again.', 'walkthrough-recording.mp4 is ready.']) || after.length !== before.length || before.map((s) => s.split(':')[0]).join() !== after.map((s) => s.split(':')[0]).join())
        failures.push(`ready announcement: failure is silent here, a successful retry is spoken once after the retry sentence, no copy of the file — ${JSON.stringify({ afterFail, tail, before, after })}`)

      /* theme, expression, container and focus changes say nothing more */
      const quietBefore = (await spoken()).length
      const theme0 = await page.evaluate(() => document.querySelector('select[aria-label="Theme"]')?.value)
      const expr0 = await page.evaluate(() => document.querySelector('select[aria-label="Expression"]')?.value)
      await page.selectOption('select[aria-label="Theme"]', 'light'); await page.waitForTimeout(400)
      await page.selectOption('select[aria-label="Theme"]', 'dark'); await page.waitForTimeout(400)
      await page.selectOption('select[aria-label="Expression"]', 'glass'); await page.waitForTimeout(400)
      await page.selectOption('select[aria-label="Expression"]', 'paper'); await page.waitForTimeout(400)
      await page.locator('[role="group"][aria-label="Container"] button', { hasText: 'Drawer' }).first().click(); await page.waitForTimeout(600)
      await page.locator('[role="group"][aria-label="Container"] button', { hasText: 'Full page' }).first().click(); await page.waitForTimeout(600)
      await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(200)
      if (theme0) await page.selectOption('select[aria-label="Theme"]', theme0)
      if (expr0) await page.selectOption('select[aria-label="Expression"]', expr0)
      await page.waitForTimeout(300)
      const quietAfter = await spoken()
      checks++
      if (quietAfter.length !== quietBefore) failures.push(`ready announcement: theme, expression, container and focus changes must add nothing — ${JSON.stringify(quietAfter.slice(quietBefore))}`)

      /* several files completing together are one sentence; a breath apart, still one */
      const nBefore = (await spoken()).length
      await dispatch({ type: 'attachment/added', id: 'aud_r1', name: 'budget-projections-fy27.xlsx', fileKind: 'document', sizeBytes: 88_000 })
      await dispatch({ type: 'attachment/added', id: 'aud_r2', name: 'design-notes.md', fileKind: 'document', sizeBytes: 12_000 })
      await page.waitForTimeout(150)
      await page.evaluate(() => { window.__lucet.store.dispatch({ type: 'attachment/settled', id: 'aud_r1', status: 'ready', reason: null }); window.__lucet.store.dispatch({ type: 'attachment/settled', id: 'aud_r2', status: 'ready', reason: null }) })
      await page.waitForTimeout(700)
      const grouped = (await spoken()).slice(nBefore)
      for (const [id, name] of [['aud_r3', 'a.md'], ['aud_r4', 'b.md'], ['aud_r5', 'c.md']]) await dispatch({ type: 'attachment/added', id, name, fileKind: 'document', sizeBytes: 1_000 })
      await page.waitForTimeout(150)
      await dispatch({ type: 'attachment/settled', id: 'aud_r3', status: 'ready', reason: null }); await page.waitForTimeout(60)
      await dispatch({ type: 'attachment/settled', id: 'aud_r4', status: 'ready', reason: null }); await page.waitForTimeout(60)
      await dispatch({ type: 'attachment/settled', id: 'aud_r5', status: 'ready', reason: null })
      await page.waitForTimeout(700)
      const breath = (await spoken()).slice(nBefore + grouped.length)
      checks++
      if (JSON.stringify(grouped) !== JSON.stringify(['2 attachments are ready.']) || JSON.stringify(breath) !== JSON.stringify(['3 attachments are ready.']))
        failures.push(`ready announcement: files completing together are one sentence — ${JSON.stringify({ grouped, breath })}`)

      /* the sentence leaves with its files: Send empties the row, Reset leaves the region empty, and the next upload is spoken again */
      await page.locator('.lucet-prompt__field').fill('Send these.'); await page.locator('.lucet-prompt__actions button').last().click()
      await page.waitForFunction(() => window.__lucet.getState().composer.attachments.length === 0, null, { timeout: 5000 }); await page.waitForTimeout(400)
      const afterSend = await page.evaluate((sel) => document.querySelector(sel)?.textContent ?? null, saidSel)
      await page.waitForFunction(() => !window.__lucet.inspect().running && !window.__lucet.inspect().locked, null, { timeout: 40000 }); await page.waitForTimeout(200)
      await attach(); await page.waitForTimeout(1700)
      const spokenAgain = readyOnes(await spoken()).at(-1)
      await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(400)
      const afterReset = await page.evaluate((sel) => document.querySelector(sel)?.textContent ?? null, saidSel)
      checks++
      if (afterSend !== '' || afterReset !== '' || !/ is ready\.$/.test(spokenAgain ?? ''))
        failures.push(`ready announcement: the sentence leaves with its files (after send ${JSON.stringify(afterSend)}, after reset ${JSON.stringify(afterReset)}) and the next upload is spoken again (${JSON.stringify(spokenAgain)})`)

      /* ---- the thumb: a touch context at a phone width ---- */
      const touch = await browser.newPage({ viewport: { width: 320, height: 760 }, hasTouch: true })
      try {
        await touch.goto(home); await touch.waitForSelector('.lucet-prompt__field')
        await touch.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' })
        await touch.evaluate(() => window.__lucet.reset()); await touch.waitForTimeout(200)
        checks++
        if (!(await touch.evaluate(() => matchMedia('(pointer: coarse)').matches))) failures.push('coarse targets: the touch context does not report (pointer: coarse); the 44px zones would be measured in the wrong medium')
        const tAttach = () => touch.locator('.lucet-prompt button[aria-label="Attach a file"]').first().click()
        await tAttach(); await tAttach(); await tAttach(); await touch.waitForTimeout(1600)
        await touch.evaluate(() => { for (const [id, name] of [['aud_t4', 'budget-projections-fy27.xlsx'], ['aud_t5', 'design-notes.md']]) { window.__lucet.store.dispatch({ type: 'attachment/added', id, name, fileKind: 'document', sizeBytes: 50_000 }); window.__lucet.store.dispatch({ type: 'attachment/settled', id, status: 'ready', reason: null }) } })
        await touch.waitForTimeout(500)
        /* the effective zone of a control is what a finger can hit: scanned point by point, so a pseudo-element zone and any clipping are both seen */
        const zones = () => touch.evaluate(() => {
          document.querySelector('.lucet-prompt__atts')?.scrollIntoView({ block: 'center' })
          const prompt = [...document.querySelectorAll('.lucet-prompt')].find((p) => p.getBoundingClientRect().width > 0)
          const buttons = [...prompt.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0)
          const zone = (el) => { const b = el.getBoundingClientRect(); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let x = Math.floor(b.left) - 26; x <= Math.ceil(b.right) + 26; x++) for (let y = Math.floor(b.top) - 26; y <= Math.ceil(b.bottom) + 26; y++) { const t = document.elementFromPoint(x, y); if (t && (t === el || el.contains(t))) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y } } return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } }
          const clipper = (el) => { let a = el.parentElement; while (a && a !== document.body) { const cs = getComputedStyle(a); if (/(hidden|clip|auto|scroll)/.test(cs.overflow) && !a.className.toString().includes('cfg__frame')) return a.className.toString(); a = a.parentElement } return null }
          return buttons.map((b) => { const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label') || b.textContent.trim(), chip: !!b.closest('.lucet-prompt__att'), row: Math.round(b.closest('.lucet-prompt__att')?.getBoundingClientRect().top ?? -1), box: [Math.round(r.width), Math.round(r.height)], zone: zone(b), clipper: clipper(b) } })
        })
        const overlaps = (zs) => { const out = []; for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) { const a = zs[i].zone, b = zs[j].zone; if (a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push(`${zs[i].label} × ${zs[j].label}`) } return out }
        const z1 = await zones()
        const chipZones = z1.filter((z) => z.chip)
        const rows = new Set(chipZones.map((z) => z.row))
        checks++
        if (chipZones.length < 6 || rows.size < 3 || chipZones.some((z) => !z.zone || z.zone.w < 44 || z.zone.h < 44 || z.clipper !== null) || overlaps(z1).length > 0)
          failures.push(`coarse targets: every chip action presents a 44px zone, unclipped, none overlapping, across ${rows.size} wrapped rows — ${JSON.stringify({ zones: chipZones.map((z) => ({ label: z.label, box: z.box, zone: z.zone, clipper: z.clipper })), overlaps: overlaps(z1) })}`)

        /* the focus ring shows whole, reached by keyboard */
        await touch.evaluate(() => document.querySelector('.lucet-prompt__atts .lucet-prompt__att button')?.focus())
        await touch.keyboard.press('Tab')
        const ring = await touch.evaluate(() => { const el = document.activeElement; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); const ext = (parseFloat(cs.outlineOffset) || 0) + (parseFloat(cs.outlineWidth) || 0); return { label: el.getAttribute('aria-label'), chip: !!el.closest('.lucet-prompt__att'), visible: el.matches(':focus-visible'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) || 0, whole: r.left - ext >= 0 && r.top - ext >= 0 && r.right + ext <= innerWidth && r.bottom + ext <= innerHeight } })
        checks++
        if (!ring.chip || !ring.visible || ring.style === 'none' || ring.width < 2 || !ring.whole) failures.push(`coarse targets: the focus ring on a chip action must show whole — ${JSON.stringify(ring)}`)

        /* one tap on the glyph, one tap on the zone's edge, one Enter, one Space: one act each */
        const state = () => touch.evaluate(() => ({ atts: window.__lucet.getState().composer.attachments.map((a) => `${a.id}:${a.status}`), focus: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.className ?? 'body', said: document.querySelector('.lucet-prompt .lucet-visually-hidden[role="status"]')?.textContent ?? '' }))
        const firstRemove = () => touch.evaluate(() => { const chips = [...document.querySelectorAll('.lucet-prompt__atts .lucet-prompt__att')]; const b = chips[0].querySelector('button[aria-label^="Remove"]'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, edgeX: r.right + 9, edgeY: r.top - 8, label: b.getAttribute('aria-label'), next: chips[1]?.querySelector('button')?.getAttribute('aria-label') ?? null } })
        const f1 = await firstRemove(); const s0 = await state()
        await touch.touchscreen.tap(f1.x, f1.y); await touch.waitForTimeout(250)
        const s1 = await state()
        checks++
        if (s1.atts.length !== s0.atts.length - 1 || s1.focus !== f1.next || !s1.said.startsWith('Removed '))
          failures.push(`coarse targets: one tap on Remove is one removal, focus on the next file's action, spoken once — ${JSON.stringify({ tapped: f1.label, before: s0.atts.length, after: s1.atts.length, focus: s1.focus, expected: f1.next, said: s1.said })}`)
        const f2 = await firstRemove(); const s2 = await state()
        await touch.touchscreen.tap(f2.edgeX, f2.edgeY); await touch.waitForTimeout(250)
        const s3 = await state()
        checks++
        if (s3.atts.length !== s2.atts.length - 1 || !s3.said.startsWith('Removed '))
          failures.push(`coarse targets: a tap 9px past the glyph box, 8px above it — inside the 44px zone — must still remove — ${JSON.stringify({ tapped: f2.label, before: s2.atts.length, after: s3.atts.length, said: s3.said })}`)
        const s4 = await state()
        await touch.evaluate(() => document.querySelector('.lucet-prompt__att[data-status="failed"] button[aria-label^="Try"]')?.focus()); await touch.keyboard.press('Enter'); await touch.waitForTimeout(150)
        const s5 = await state()
        checks++
        if (s5.atts.length !== s4.atts.length || s4.atts.map((a) => a.split(':')[0]).join() !== s5.atts.map((a) => a.split(':')[0]).join() || !s5.atts.some((a) => a.endsWith(':uploading')) || !s5.said.startsWith('Trying '))
          failures.push(`coarse targets: Enter on Retry is one retry of the same file, never a copy — ${JSON.stringify({ before: s4.atts, after: s5.atts, said: s5.said })}`)
        await touch.waitForTimeout(1500)
        const s6 = await state()
        await touch.evaluate(() => document.querySelector('.lucet-prompt__atts .lucet-prompt__att button[aria-label^="Remove"]')?.focus()); await touch.keyboard.press('Space'); await touch.waitForTimeout(250)
        const s7 = await state()
        checks++
        if (s7.atts.length !== s6.atts.length - 1 || !s7.said.startsWith('Removed ')) failures.push(`coarse targets: Space on Remove is one removal — ${JSON.stringify({ before: s6.atts.length, after: s7.atts.length, said: s7.said })}`)

        /* with a queued message above the row, the queued actions' zones and a staged file's zones keep apart */
        await touch.evaluate(() => window.__lucet.reset()); await touch.waitForTimeout(200)
        await touch.evaluate(() => { void window.__lucet.trigger('multiplayer') }); await touch.waitForFunction(() => window.__lucet.inspect().locked, null, { timeout: 15000 }); await touch.waitForTimeout(200)
        await touch.locator('.lucet-prompt__field').fill('After Jennifer.'); await touch.locator('.lucet-prompt__actions button', { hasText: /^Queue$/ }).first().click(); await touch.waitForTimeout(150)
        await touch.evaluate(() => { window.__lucet.store.dispatch({ type: 'attachment/added', id: 'aud_t6', name: 'late-addition.pdf', fileKind: 'document', sizeBytes: 50_000 }); window.__lucet.store.dispatch({ type: 'attachment/settled', id: 'aud_t6', status: 'ready', reason: null }) }); await touch.waitForTimeout(300)
        const z2 = await zones()
        const queuedZones = z2.filter((z) => /^Edit$|^Cancel queue$/.test(z.label))
        checks++
        if (queuedZones.length !== 2 || overlaps(z2).length > 0 || z2.filter((z) => z.chip).some((z) => !z.zone || z.zone.w < 44 || z.zone.h < 44))
          failures.push(`coarse targets: the queued item's actions and a file staged beneath keep their zones apart — ${JSON.stringify({ zones: z2.map((z) => ({ label: z.label, zone: z.zone })), overlaps: overlaps(z2) })}`)
        await touch.evaluate(() => window.__lucet.reset()); await touch.waitForTimeout(200)

        /* no horizontal overflow with a wrapped row, in each container, at 390 and 320 */
        for (const width of [390, 320]) {
          await touch.setViewportSize({ width, height: 760 }); await touch.waitForTimeout(200)
          await touch.evaluate(() => { window.__lucet.reset(); for (const [id, name] of [['aud_o1', 'quarterly-summary.pdf'], ['aud_o2', 'site-photograph.jpg'], ['aud_o3', 'budget-projections-fy27.xlsx']]) { window.__lucet.store.dispatch({ type: 'attachment/added', id, name, fileKind: 'document', sizeBytes: 50_000 }); window.__lucet.store.dispatch({ type: 'attachment/settled', id, status: 'ready', reason: null }) } })
          for (const view of ['Full page', 'Drawer', 'Mobile']) {
            await touch.locator('[role="group"][aria-label="Container"] button', { hasText: view }).first().click({ timeout: 4000 }); await touch.waitForTimeout(500)
            const over = await touch.evaluate(() => { const vis = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0); const prompt = vis('.lucet-prompt'), floor = vis('.cfg__floor'), phone = vis('.cfg__phone'); const pr = prompt.getBoundingClientRect(), fr = floor.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(floor).paddingInlineEnd) || 0; return { doc: document.documentElement.scrollWidth - innerWidth, body: document.body.scrollWidth - innerWidth, chips: [...document.querySelectorAll('.lucet-prompt__atts .lucet-prompt__att')].filter((c) => c.getBoundingClientRect().width > 0).length, overhang: Math.round((pr.right - (fr.right - pad)) * 10) / 10, phone: phone ? { width: Math.round(phone.getBoundingClientRect().width), inner: phone.scrollWidth - phone.clientWidth } : null } })
            checks++
            /* the composer stays inside the floor's content box: with an empty thread the suggestion chips share its column, and their column minimum once grew it past the frame */
            if (over.phone) {
              /* The phone mock is a device frame of fixed width; at a viewport narrower than the frame the PAGE scrolls sideways by construction (pre-existing host chrome, on record). Inside the phone, nothing may. */
              if (over.doc > 0) warnings.push(`Mobile at ${width}px: the ${over.phone.width}px phone mock scrolls the page sideways by ${over.doc}px — host chrome, filed`)
              if (over.phone.inner > 0 || over.chips < 3 || over.overhang > 0.5) failures.push(`coarse targets: Mobile at ${width}px with three chips staged must add no overflow inside the phone and keep the composer inside its floor — ${JSON.stringify(over)}`)
            } else if (over.doc > 0 || over.body > 0 || over.chips < 3 || over.overhang > 0.5) failures.push(`coarse targets: ${view} at ${width}px with three chips staged must add no horizontal overflow and keep the composer inside the floor — ${JSON.stringify(over)}`)
          }
          await touch.locator('[role="group"][aria-label="Container"] button', { hasText: 'Full page' }).first().click({ timeout: 4000 }); await touch.waitForTimeout(300)
        }
      } catch (e) {
        checks++
        failures.push(`coarse targets: the touch context could not complete its checks — ${e.message.split('\n')[0]}`)
      } finally {
        await touch.close()
      }
    }
    /* 3g. NAVIGATION: THE LIVE THREAD, NEW THREAD, THE MENUS (component audit
       08). Exactly one row is current — the live thread, a real button named
       by its first prompt, "New thread" while empty; dressing rows are hidden
       from AT, titled for the pointer, and do nothing. New thread with nothing
       at stake is immediate, spoken once and lands in the composer; with
       unsent work or a response arriving it is blocked with an exit: a focused
       notice by the composer, Keep writing (Escape) or Discard and start new,
       that leaves when its reason does. The menus use the library's grammar.
       Targets: 40px zones for a fine pointer, 44 under a coarse one. */
    {
      const home = url.replace('primitives.html', 'index.html?instant=1')
      const listen = () => page.evaluate(() => {
        window.__nav = []
        const regions = () => [...document.querySelectorAll('[aria-live], [role="status"]')]
        const last = new Map()
        const snap = () => { for (const r of regions()) { const t = r.textContent.replace(/\s+/g, ' ').trim(); if (last.get(r) !== t) { last.set(r, t); if (t) window.__nav.push(t) } } }
        snap(); window.__nav = []
        window.__navObs?.disconnect(); window.__navObs = new MutationObserver(snap); window.__navObs.observe(document.body, { subtree: true, childList: true, characterData: true })
      })
      const spoken = () => page.evaluate(() => { const l = window.__nav; window.__nav = []; return l })
      const look = () => page.evaluate(() => {
        const s = window.__lucet.getState(); const a = document.activeElement
        const vis = (e) => e.getBoundingClientRect().width > 0
        const notice = [...document.querySelectorAll('.cfg__unsent')].find(vis)
        const desc = (el) => !el || el === document.body ? 'body' : (el.getAttribute('aria-label') || el.className.toString().split(' ')[0] || el.tagName.toLowerCase())
        return {
          turns: s.turns.length, text: s.composer.text, atts: s.composer.attachments.length, queued: s.composer.queued, locked: s.composer.locked,
          focus: desc(a), focusIsField: a?.classList.contains('lucet-prompt__field') ?? false,
          notice: notice ? { reason: notice.dataset.reason, text: notice.querySelector('.cfg__unsent-text')?.textContent, focused: a === notice, actions: [...notice.querySelectorAll('button')].map((b) => b.textContent.trim()) } : null,
          current: [...document.querySelectorAll('[aria-current="page"]')].filter(vis).filter((e) => e.closest('.cfg__frame, .cfg__mock, .cfg__phone')).map((e) => e.textContent.trim()),
        }
      })
      const newThread = () => page.locator('.cfg__side-new').first().click()
      const field = () => page.locator('.lucet-prompt__field:visible').first()
      const zoneOf = (p, sel) => p.evaluate((sel) => { const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let x = Math.floor(b.left) - 30; x <= Math.ceil(b.right) + 14; x++) for (let y = Math.floor(b.top) - 12; y <= Math.ceil(b.bottom) + 12; y++) { const t = document.elementFromPoint(x, y); if (t && (t === el || el.contains(t))) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y } } return x0 === Infinity ? null : [x1 - x0 + 1, y1 - y0 + 1] }, sel)

      /* the rows */
      await page.goto(home); await page.waitForSelector('.lucet-prompt__field'); await page.waitForTimeout(400)
      const rows = await page.evaluate(() => {
        const nav = document.querySelector('.cfg__side-list'); const live = nav?.querySelector('.cfg__side-row--live'); const dressing = [...(nav?.querySelectorAll('.cfg__side-row:not(.cfg__side-row--live)') ?? [])]
        const first = window.__lucet.getState().turns[0]?.prompt.parts.flatMap((p) => (p.kind === 'text' ? [p.text] : [])).join(' ') ?? ''
        const before = window.__lucet.getState().turns.length; dressing[0]?.click(); const after = window.__lucet.getState().turns.length
        return { navLabel: nav?.getAttribute('aria-label'), live: live ? { tag: live.tagName, current: live.getAttribute('aria-current'), text: live.textContent.trim(), marker: getComputedStyle(live, '::before').width } : null, firstPrompt: first.slice(0, 12), dressing: dressing.map((d) => [d.getAttribute('aria-hidden'), d.getAttribute('title'), d.tabIndex]), turnsBefore: before, turnsAfter: after, currents: document.querySelectorAll('.cfg__frame [aria-current="page"]').length }
      })
      checks++
      if (rows.navLabel !== 'Threads' || rows.live?.tag !== 'BUTTON' || rows.live?.current !== 'page' || !rows.live?.text.startsWith(rows.firstPrompt) || rows.live?.marker !== '2px' || rows.dressing.length !== 5 || rows.dressing.some(([h, t, ti]) => h !== 'true' || t !== 'Not in this demo' || ti !== -1) || rows.turnsAfter !== rows.turnsBefore || rows.currents !== 1)
        failures.push(`navigation: one current row, the live thread named by its first prompt; five dressing rows hidden, titled, inert — ${JSON.stringify(rows)}`)

      /* New thread, nothing at stake: immediate, spoken once, focus in the composer; twice is one thread and one sentence */
      await listen()
      await newThread(); await page.waitForTimeout(300)
      const fresh = await look(); const said1 = await spoken()
      await newThread(); await newThread(); await page.waitForTimeout(300)
      const twice = await look(); const said2 = await spoken()
      checks++
      if (fresh.turns !== 0 || !fresh.focusIsField || JSON.stringify(fresh.current) !== JSON.stringify(['New thread']) || JSON.stringify(said1) !== JSON.stringify(['New thread.']) || twice.turns !== 0 || said2.length !== 0 || fresh.notice !== null)
        failures.push(`navigation: New thread with nothing at stake is immediate, spoken once, lands in the composer, and twice is one thread — ${JSON.stringify({ fresh, said1, twice, said2 })}`)

      /* unsent work: blocked with an exit */
      await field().click(); await page.keyboard.type('Draft for the kickoff note, not yet sent.')
      await page.evaluate(() => { const f = [...document.querySelectorAll('.lucet-prompt__field')].find((e) => e.getBoundingClientRect().width > 0); f.focus(); f.setSelectionRange(6, 25); window.__lucet.store.dispatch({ type: 'attachment/added', id: 'nav1', name: 'quarterly-summary.pdf', fileKind: 'document', sizeBytes: 240_000 }); window.__lucet.store.dispatch({ type: 'attachment/settled', id: 'nav1', status: 'ready', reason: null }) }); await page.waitForTimeout(300)
      await listen(); await newThread(); await page.waitForTimeout(250)
      const blocked = await look(); const blockedSaid = await spoken()
      await page.keyboard.press('Escape'); await page.waitForTimeout(250)
      const kept = await look()
      const selection = await page.evaluate(() => { const f = [...document.querySelectorAll('.lucet-prompt__field')].find((e) => e.getBoundingClientRect().width > 0); return [f.selectionStart, f.selectionEnd] })
      await newThread(); await page.waitForTimeout(200); await page.locator('.cfg__unsent button', { hasText: 'Keep writing' }).click(); await page.waitForTimeout(250)
      const keptByButton = await look()
      await newThread(); await page.waitForTimeout(200); await listen(); await page.locator('.cfg__unsent button', { hasText: 'Discard and start new' }).click(); await page.waitForTimeout(300)
      const discarded = await look(); const discardSaid = await spoken()
      checks++
      if (!blocked.notice || blocked.notice.reason !== 'unsent' || blocked.notice.text !== 'You have unsent work in this thread.' || !blocked.notice.focused || JSON.stringify(blocked.notice.actions) !== JSON.stringify(['Keep writing', 'Discard and start new']) || blocked.turns !== 0 || blocked.text === '' || blocked.atts !== 1 || blockedSaid.length !== 0
        || kept.notice !== null || !kept.focusIsField || kept.text === '' || kept.atts !== 1 || JSON.stringify(selection) !== JSON.stringify([6, 25]) || keptByButton.notice !== null || !keptByButton.focusIsField
        || discarded.notice !== null || discarded.turns !== 0 || discarded.text !== '' || discarded.atts !== 0 || !discarded.focusIsField || JSON.stringify(discardSaid) !== JSON.stringify(['New thread.']))
        failures.push(`navigation: unsent work blocks New thread with a focused notice; Escape and Keep writing return to the draft intact; Discard starts new, spoken once — ${JSON.stringify({ blocked, blockedSaid, kept, selection, keptByButton, discarded, discardSaid })}`)

      /* the notice leaves with its reason: the draft sent */
      await field().click(); await page.keyboard.type('Send this.'); await newThread(); await page.waitForTimeout(200)
      const beforeSend = (await look()).notice !== null
      await page.locator('.lucet-prompt__actions button:visible').last().click(); await page.waitForTimeout(300)
      const afterSend = (await look()).notice
      await page.waitForFunction(() => !window.__lucet.getState().composer.locked, null, { timeout: 40000 })
      checks++
      if (!beforeSend || afterSend !== null) failures.push(`navigation: the notice leaves when the draft is sent — ${JSON.stringify({ beforeSend, afterSend })}`)

      /* a response arriving: yours, then Jennifer's, and the notice leaves when it settles */
      await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(150)
      await field().click(); await page.keyboard.type('Summarise the review notes.'); await page.locator('.lucet-prompt__actions button:visible').last().click()
      await page.waitForFunction(() => window.__lucet.getState().composer.locked, null, { timeout: 8000 }).catch(() => null)
      await newThread(); await page.waitForTimeout(250)
      const mine = await look()
      await page.keyboard.press('Escape'); await page.waitForTimeout(200)
      const stayed = await look()
      await page.waitForFunction(() => !window.__lucet.getState().composer.locked, null, { timeout: 40000 })
      await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(150)
      await page.evaluate(() => { void window.__lucet.trigger('multiplayer') }); await page.waitForFunction(() => window.__lucet.getState().composer.locked, null, { timeout: 15000 }); await page.waitForTimeout(300)
      await newThread(); await page.waitForTimeout(250)
      const hers = await look()
      await page.waitForFunction(() => !window.__lucet.getState().composer.locked, null, { timeout: 40000 }); await page.waitForTimeout(300)
      const settled = await look()
      checks++
      if (mine.notice?.reason !== 'running' || mine.notice?.text !== 'Your response is still arriving in this thread.' || !mine.notice?.focused || JSON.stringify(mine.notice?.actions) !== JSON.stringify(['Stay here', 'Discard and start new']) || mine.turns !== 1
        || stayed.notice !== null || stayed.focus !== 'cfg__side-new' || stayed.turns !== 1
        || hers.notice?.text !== 'Jennifer’s response is still arriving in this thread.' || settled.notice !== null || settled.focus !== 'cfg__side-new' || settled.turns !== 1)
        failures.push(`navigation: a response arriving blocks New thread, named for whose it is; Stay here and Escape return to the control; the notice leaves when the response settles — ${JSON.stringify({ mine, stayed, hers, settled })}`)

      /* a queued message with a file is unsent work; Discard is the person's choice */
      await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(150)
      await page.evaluate(() => { void window.__lucet.trigger('multiplayer') }); await page.waitForFunction(() => window.__lucet.getState().composer.locked, null, { timeout: 15000 }); await page.waitForTimeout(300)
      await page.evaluate(() => { window.__lucet.store.dispatch({ type: 'attachment/added', id: 'nav2', name: 'site-photograph.jpg', fileKind: 'image', sizeBytes: 1_800_000 }); window.__lucet.store.dispatch({ type: 'attachment/settled', id: 'nav2', status: 'ready', reason: null }) }); await page.waitForTimeout(150)
      await field().click(); await page.keyboard.type('After Jennifer, with the photo.')
      await page.locator('.lucet-prompt__actions button:visible', { hasText: /^Queue$/ }).first().click({ timeout: 4000 }); await page.waitForTimeout(200)
      await newThread(); await page.waitForTimeout(250)
      const queuedBlock = await look()
      await listen(); await page.locator('.cfg__unsent button', { hasText: 'Discard and start new' }).click(); await page.waitForTimeout(300)
      const queuedGone = await look(); const queuedSaid = await spoken()
      checks++
      if (queuedBlock.notice?.reason !== 'unsent' || queuedBlock.queued === null || queuedGone.turns !== 0 || queuedGone.queued !== null || queuedGone.notice !== null || !queuedGone.focusIsField || JSON.stringify(queuedSaid) !== JSON.stringify(['New thread.']))
        failures.push(`navigation: a queued message blocks New thread as unsent work; Discard clears it by choice, spoken once — ${JSON.stringify({ queuedBlock, queuedGone, queuedSaid })}`)

      /* collapse and expand: focus follows, the current row survives */
      await page.goto(home); await page.waitForSelector('.lucet-prompt__field'); await page.waitForTimeout(300)
      await page.locator('.cfg__side .cfg__side-toggle').click(); await page.waitForTimeout(350)
      const hid = await look()
      const hiddenTabbable = await page.evaluate(() => [...document.querySelectorAll('.cfg__side button')].some((b) => getComputedStyle(b).visibility === 'visible'))
      await page.locator('.cfg__side-float').click(); await page.waitForTimeout(350)
      const shown = await look()
      checks++
      if (hid.focus !== 'Show the sidebar' || hiddenTabbable || shown.focus !== 'Hide the sidebar' || shown.current.length !== 1)
        failures.push(`navigation: Hide moves focus to the floating toggle and hides the sidebar's controls; Show returns it; one current row survives — ${JSON.stringify({ hid, hiddenTabbable, shown })}`)

      /* fine-pointer zones at the desktop */
      const fine = { newThread: await zoneOf(page, '.cfg__side-new'), liveRow: await zoneOf(page, '.cfg__side-row--live'), toggle: await zoneOf(page, '.cfg__side .cfg__side-toggle') }
      await field().click(); await page.keyboard.type('x'); await newThread(); await page.waitForTimeout(200)
      fine.keep = await zoneOf(page, '.cfg__unsent button:first-child'); fine.discard = await zoneOf(page, '.cfg__unsent-discard')
      await page.keyboard.press('Escape'); await page.waitForTimeout(150)
      checks++
      if (Object.values(fine).some((z) => !z || z[0] < 40 || z[1] < 40)) failures.push(`navigation: every control offers a 40px zone to a fine pointer — ${JSON.stringify(fine)}`)

      /* the phone: the menu grammar, the history pane's live row, New thread from the pane */
      await page.evaluate(() => window.__lucet.reset()); await page.waitForTimeout(150)
      await page.locator('[role="group"][aria-label="Container"] button', { hasText: 'Mobile' }).first().click(); await page.waitForTimeout(600)
      const summary = () => page.locator('.cfg__phone-bar summary[aria-label="Menu"]')
      await summary().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(250)
      const opened = await look()
      const rowsInfo = await page.evaluate(() => [...document.querySelectorAll('.cfg__phone-bar .cfg__dmenu-row')].map((r) => [r.textContent.trim(), r.getAttribute('aria-pressed'), Math.round(r.getBoundingClientRect().height)]))
      await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100)
      const arrowed = await look()
      await page.keyboard.press('Escape'); await page.waitForTimeout(200)
      const escaped = { focus: (await look()).focus, open: await page.evaluate(() => document.querySelector('.cfg__phone-bar details.cfg__dmenu').hasAttribute('open')) }
      await page.keyboard.press('Enter'); await page.waitForTimeout(150); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
      const chose = await look()
      const pane = await page.evaluate(() => { const nav = document.querySelector('.cfg__history'); return { label: nav?.getAttribute('aria-label'), live: nav?.querySelector('.cfg__history-row--live')?.getAttribute('aria-current'), dressingHidden: [...(nav?.querySelectorAll('.cfg__history-row:not(.cfg__history-row--live)') ?? [])].every((r) => r.getAttribute('aria-hidden') === 'true') } })
      await page.locator('.cfg__history-row--live').click(); await page.waitForTimeout(300)
      const backToThread = await look()
      await field().click(); await page.keyboard.type('Phone draft.')
      await summary().click(); await page.locator('.cfg__phone-bar .cfg__dmenu-row', { hasText: 'Chat history' }).click(); await page.waitForTimeout(300)
      await page.locator('.cfg__phone-new').click(); await page.waitForTimeout(300)
      const phoneNotice = await look()
      await page.keyboard.press('Escape'); await page.waitForTimeout(150)
      checks++
      if (opened.focus !== 'cfg__dmenu-row' || JSON.stringify(rowsInfo.map((r) => r[1])) !== JSON.stringify(['true', 'false', null]) || rowsInfo.some((r) => r[2] < 40) || arrowed.focus !== 'cfg__dmenu-row' || escaped.open || escaped.focus !== 'Menu'
        || chose.focus !== 'Menu' || pane.label !== 'Chat history' || pane.live !== 'page' || !pane.dressingHidden || chose.current.length !== 1 || !backToThread.focusIsField
        || phoneNotice.notice?.reason !== 'unsent' || !phoneNotice.notice?.focused)
        failures.push(`navigation (phone): the menu opens on the current row, arrows rove, Escape and a choice return focus to the trigger; the history pane has one current row that returns to the composer; New thread from the pane lands the notice by the composer — ${JSON.stringify({ opened, rowsInfo, arrowed, escaped, chose, pane, backToThread, phoneNotice })}`)
      await page.evaluate(() => window.__lucet.reset())
      await page.locator('[role="group"][aria-label="Container"] button', { hasText: 'Full page' }).first().click(); await page.waitForTimeout(400)

      /* coarse-pointer zones on the phone, and the notice at 320 adds no overflow */
      /* 480 wide: the phone mock is 390 plus its stage margins, and a zone at the bar's edge can only be measured with the whole phone on screen. */
      const touch = await browser.newPage({ viewport: { width: 480, height: 844 }, hasTouch: true })
      try {
        await touch.goto(home); await touch.waitForSelector('.lucet-prompt__field'); await touch.waitForTimeout(300)
        await touch.locator('[role="group"][aria-label="Container"] button', { hasText: 'Mobile' }).first().click(); await touch.waitForTimeout(600)
        await touch.locator('.cfg__phone-bar summary[aria-label="Menu"]').click(); await touch.waitForTimeout(300)
        const coarse = { menu: await zoneOf(touch, '.cfg__phone-bar summary'), row: await zoneOf(touch, '.cfg__phone-bar .cfg__dmenu-row'), phoneNew: await zoneOf(touch, '.cfg__phone-new') }
        await touch.keyboard.press('Escape'); await touch.waitForTimeout(150)
        await touch.locator('.lucet-prompt__field:visible').first().click(); await touch.keyboard.type('x'); await touch.locator('.cfg__phone-new').click(); await touch.waitForTimeout(300)
        coarse.keep = await zoneOf(touch, '.cfg__unsent button:first-child'); coarse.discard = await zoneOf(touch, '.cfg__unsent-discard')
        checks++
        if (Object.values(coarse).some((z) => !z || z[0] < 44 || z[1] < 44)) failures.push(`navigation: every control offers a 44px zone to a coarse pointer — ${JSON.stringify(coarse)}`)
        await touch.setViewportSize({ width: 320, height: 760 }); await touch.waitForTimeout(200)
        await touch.locator('[role="group"][aria-label="Container"] button', { hasText: 'Full page' }).first().click(); await touch.waitForTimeout(500)
        const narrow = await touch.evaluate(() => ({ notice: !![...document.querySelectorAll('.cfg__unsent')].find((e) => e.getBoundingClientRect().width > 0), over: document.documentElement.scrollWidth - innerWidth }))
        checks++
        if (!narrow.notice || narrow.over > 0) failures.push(`navigation: the notice at 320px stays and adds no horizontal overflow — ${JSON.stringify(narrow)}`)
      } catch (e) {
        checks++
        failures.push(`navigation: the touch context could not complete its checks — ${e.message.split('\n')[0]}`)
      } finally {
        await touch.close()
      }
    }
    /* 3b. Nothing queued: Send comes back when her turn lands, the draft untouched. */
    await coldStart()
    await fireFromRail('Another person', 'Features')
    await page.waitForFunction(() => window.__lucet.inspect().locked, null, { timeout: 10000 })
    await page.locator('.lucet-prompt__field').fill('Not yet sent')
    await page.waitForFunction(() => !window.__lucet.inspect().locked && !window.__lucet.inspect().running, null, { timeout: 30000 })
    await page.waitForTimeout(150)
    const restored = await page.evaluate(() => { const b = document.querySelector('.lucet-prompt button[aria-label="Send"]'); return { send: !!b, enabled: !!b && !b.disabled, draft: document.querySelector('.lucet-prompt__field')?.value, turns: document.querySelectorAll('.lucet-thread__pair').length, strip: !!document.querySelector('.lucet-prompt__status') } })
    checks++
    if (!restored.send || !restored.enabled || restored.draft !== 'Not yet sent' || restored.turns !== 1 || restored.strip)
      failures.push(`multiplayer: Send is not restored when nothing was queued — ${JSON.stringify(restored)}`)
    await resetAndInspect('multiplayer (no queue)')
    /* 3c. Reset mid-run cancels her timer and the queue together. */
    await coldStart()
    await fireFromRail('Another person', 'Features')
    await page.waitForFunction(() => window.__lucet.inspect().locked, null, { timeout: 10000 })
    await page.locator('.lucet-prompt__field').fill('Cancelled with the run')
    await page.locator('.lucet-prompt button', { hasText: 'Queue' }).first().click()
    await page.waitForTimeout(120)
    await resetAndInspect('multiplayer mid-run')
    /* 4. Budget caution: the decision before the spend — now THE HOLD (round
       06). The first Send over the month opens the meter's panel instead of
       sending; focus lands on the cheaper way on; Escape closes and sends
       nothing; Use Fast releases the hold and returns focus to Send; the
       second press sends within the month. */
    const armBudget = async () => {
      await fireFromRail('Budget caution', 'States')
      await page.waitForFunction(() => !window.__lucet.inspect().running && window.__lucet.inspect().pendingReply === 'budget-low', null, { timeout: 15000 })
      await page.waitForTimeout(200)
    }
    const visibleChip = () => [...document.querySelectorAll('.lucet-budget')].find((c) => c.getBoundingClientRect().width > 0)
    await coldStart()
    await armBudget()
    const pre = await page.evaluate(() => {
      const chip = [...document.querySelectorAll('.lucet-budget')].find((c) => c.getBoundingClientRect().width > 0)
      chip.open = true
      const out = { turns: document.querySelectorAll('.lucet-thread__pair').length, draft: document.querySelector('.lucet-prompt__field')?.value, caution: chip.querySelector('.lucet-budget__button')?.dataset.state, note: chip.querySelector('.lucet-budget__note')?.textContent.trim(), decide: chip.querySelectorAll('.lucet-budget__decide button').length, pending: window.__lucet.inspect().pendingReply, resetArmed: !document.querySelector('.cfg__stage-reset')?.disabled }
      chip.open = false
      return out
    })
    const sendButton = page.locator('.lucet-prompt button[aria-label="Send"]:visible').first()
    await sendButton.click()
    await page.waitForTimeout(250)
    const held = await page.evaluate(() => {
      const chip = [...document.querySelectorAll('.lucet-budget')].find((c) => c.getBoundingClientRect().width > 0)
      const btns = [...chip.querySelectorAll('.lucet-budget__decide button')]
      return { open: chip.open, held: chip.dataset.held, turns: document.querySelectorAll('.lucet-thread__pair').length, labels: btns.map((b) => b.textContent.trim()), focusedFirst: document.activeElement === btns[0], intercept: window.__lucet.getState().composer.intercept, explanation: !!chip.querySelector('.lucet-budget__next') && /context is/.test(chip.querySelector('.lucet-budget__note')?.textContent || ''), targets: btns.map((b) => { const r = b.getBoundingClientRect(); return r.height >= 28 && r.width >= 28 }), modal: !!document.querySelector('[role="dialog"], dialog[open]') }
    })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    const escaped = await page.evaluate(() => ({ open: [...document.querySelectorAll('.lucet-budget')].find((c) => c.getBoundingClientRect().width > 0).open, turns: document.querySelectorAll('.lucet-thread__pair').length, intercept: window.__lucet.getState().composer.intercept, focusOnSend: document.activeElement?.getAttribute('aria-label') === 'Send', draft: document.querySelector('.lucet-prompt__field')?.value }))
    await sendButton.click()
    await page.waitForTimeout(250)
    const reopened = await page.evaluate(() => ({ open: [...document.querySelectorAll('.lucet-budget')].find((c) => c.getBoundingClientRect().width > 0).open, turns: document.querySelectorAll('.lucet-thread__pair').length }))
    await page.locator('.lucet-budget__decide button', { hasText: 'Use Fast' }).first().click()
    await page.waitForTimeout(200)
    const rerouted = await page.evaluate(() => ({ model: window.__lucet.getState().model.selectedId, intercept: window.__lucet.getState().composer.intercept, open: [...document.querySelectorAll('.lucet-budget')].find((c) => c.getBoundingClientRect().width > 0).open, turns: document.querySelectorAll('.lucet-thread__pair').length, focusOnSend: document.activeElement?.getAttribute('aria-label') === 'Send', chip: document.querySelector('.lucet-budget__button')?.textContent || '' }))
    await sendButton.click()
    await settled()
    await page.waitForTimeout(150)
    const spent = await page.evaluate(() => { const s = window.__lucet.getState(); return { turns: s.turns.length, model: s.model.selectedId, cost: s.usage.threadCostUsd, pending: window.__lucet.inspect().pendingReply, intercept: s.composer.intercept } })
    checks++
    if (pre.turns !== 0 || pre.draft !== 'Compare the two proposals and recommend one.' || pre.caution !== 'caution' || !/Use Fast \(≈\$0\.0\d\) or continue on Auto \(≈\$0\.1\d\)/.test(pre.note || '') || !/context is ≈4\d(\.\d)?k tokens/.test(pre.note || '') || pre.decide !== 0 || pre.pending !== 'budget-low' || !pre.resetArmed
      || !held.open || held.held !== 'true' || held.turns !== 0 || held.labels.length !== 2 || !/^Use Fast · ≈\$0\.0\d$/.test(held.labels[0]) || !/^Continue on Auto · ≈\$0\.1\d$/.test(held.labels[1]) || !held.focusedFirst || !held.intercept || !held.explanation || held.targets.some((t) => !t) || held.modal
      || escaped.open || escaped.turns !== 0 || escaped.intercept !== null || !escaped.focusOnSend || escaped.draft !== 'Compare the two proposals and recommend one.'
      || !reopened.open || reopened.turns !== 0
      || rerouted.model !== 'fast' || rerouted.intercept !== null || rerouted.open || rerouted.turns !== 0 || !rerouted.focusOnSend || !/Fast/.test(rerouted.chip)
      || spent.turns !== 1 || spent.model !== 'fast' || spent.pending !== null || spent.intercept !== null || Math.abs(spent.cost - 0.41 - ((46_000 + 2_400) / 1_000_000) * 0.6) > 0.001)
      failures.push(`budget-low: the hold does not gate the spend — ${JSON.stringify({ pre, held, escaped, reopened, rerouted, spent })}`)
    await resetAndInspect('budget-low')
    /* 4b. Continue on Auto sends at once: the expensive choice, explicit. */
    await coldStart()
    await armBudget()
    await sendButton.click()
    await page.waitForTimeout(250)
    await page.locator('.lucet-budget__decide button', { hasText: 'Continue on Auto' }).first().click()
    await settled()
    await page.waitForTimeout(150)
    const onAuto = await page.evaluate(() => { const s = window.__lucet.getState(); const rate = s.model.options.find((o) => o.id === 'auto').usdPerMTok; return { turns: s.turns.length, model: s.model.selectedId, intercept: s.composer.intercept, pending: window.__lucet.inspect().pendingReply, cost: s.usage.threadCostUsd, expected: ((46_000 + 2_400) / 1_000_000) * rate + 0.41, open: [...document.querySelectorAll('.lucet-budget')].find((c) => c.getBoundingClientRect().width > 0).open, fieldFocused: document.activeElement?.classList.contains('lucet-prompt__field') } })
    checks++
    if (onAuto.turns !== 1 || onAuto.model !== 'auto' || onAuto.intercept !== null || onAuto.pending !== null || Math.abs(onAuto.cost - onAuto.expected) > 0.001 || onAuto.open || !onAuto.fieldFocused)
      failures.push(`budget-low: Continue on Auto does not send the held words — ${JSON.stringify(onAuto)}`)
    await resetAndInspect('budget-low (continue)')
    /* 4c. On the phone the panel is entirely visible and reachable by Tab. */
    await coldStart()
    await page.locator('[role="group"][aria-label="Container"] button', { hasText: 'Mobile' }).first().click()
    await page.waitForTimeout(300)
    await armBudget()
    await page.locator('.lucet-prompt button[aria-label="Send"]:visible').first().click()
    await page.waitForTimeout(300)
    const phone = await page.evaluate(() => {
      const chip = [...document.querySelectorAll('.lucet-budget')].find((c) => c.getBoundingClientRect().width > 0)
      const panel = chip.querySelector('.lucet-budget__panel')
      const frame = document.querySelector('.cfg__phone') ?? document.querySelector('.cfg__frame')
      const p = panel.getBoundingClientRect(), f = frame.getBoundingClientRect()
      const inside = p.top >= f.top && p.left >= f.left && p.bottom <= f.bottom && p.right <= f.right && p.top >= 0 && p.bottom <= window.innerHeight
      const corners = [[p.left + 3, p.top + 3], [p.right - 3, p.top + 3], [p.left + 3, p.bottom - 3], [p.right - 3, p.bottom - 3]].map(([x, y]) => panel.contains(document.elementFromPoint(x, y)))
      const btns = [...chip.querySelectorAll('.lucet-budget__decide button')]
      return { open: chip.open, inside, corners, focusedFirst: document.activeElement === btns[0], count: btns.length, panel: `${Math.round(p.width)}x${Math.round(p.height)}` }
    })
    await page.keyboard.press('Tab')
    const tabbed = await page.evaluate(() => { const btns = [...[...document.querySelectorAll('.lucet-budget')].find((c) => c.getBoundingClientRect().width > 0).querySelectorAll('.lucet-budget__decide button')]; return document.activeElement === btns[1] })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    checks++
    if (!phone.open || !phone.inside || phone.corners.some((c) => !c) || !phone.focusedFirst || phone.count !== 2 || !tabbed)
      failures.push(`budget-low (mobile): the hold's panel is not fully visible and keyboard-reachable — ${JSON.stringify({ phone, tabbed })}`)
    await page.locator('[role="group"][aria-label="Container"] button', { hasText: 'Full page' }).first().click()
    await page.waitForTimeout(200)
    await resetAndInspect('budget-low (mobile)')
    {
    /* 4d. THE COST DECISION (component audit 03), asserted, not screenshotted.
       (i) Trigger geometry: the estimate has a reserved slot and the model
       label sizes the trigger; attach and Send never move through model or
       price changes. (ii) Sends are counted from the log: zero on open,
       Escape, a click away and Use Fast; exactly one on Continue and on
       the second Send. (iii) The draft survives every cancel path. (iv)
       Focus never lands on body. */
    await coldStart()
    const geometry = async () => page.evaluate(() => {
      const R = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10] }
      const chip = [...document.querySelectorAll('.lucet-budget')].find((c) => c.getBoundingClientRect().width > 0)
      const prompt = chip.closest('.lucet-prompt')
      return { attach: R(prompt.querySelector('.lucet-prompt__tool')), send: R(prompt.querySelector('button[aria-label="Send"]')), chip: R(chip.querySelector('summary')), price: R(chip.querySelector('.lucet-budget__price')), priceText: chip.querySelector('.lucet-budget__price')?.textContent, label: chip.querySelector('summary').textContent }
    })
    const g0 = await geometry()
    await page.evaluate(() => window.__lucet.store.dispatch({ type: 'model/changed', modelId: 'fast' }))
    await page.waitForTimeout(60)
    const g1 = await geometry()
    await page.evaluate(() => window.__lucet.store.dispatch({ type: 'model/changed', modelId: 'deep' }))
    await page.waitForTimeout(60)
    const g2 = await geometry()
    await page.evaluate(() => window.__lucet.store.dispatch({ type: 'model/changed', modelId: 'auto' }))
    await page.locator('.lucet-prompt__field').fill('word '.repeat(240))
    await page.waitForTimeout(120)
    const g3 = await geometry()
    await page.locator('.lucet-prompt__field').fill('')
    await page.waitForTimeout(60)
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
    checks += 2
    if (![g1, g2, g3].every((g) => same(g.attach, g0.attach) && same(g.send, g0.send) && g.chip[1] === g0.chip[1] && g.chip[3] === g0.chip[3] && g.chip[0] === g0.chip[0]))
      failures.push(`budget geometry: attach, Send or the trigger's seat moved through model and price changes — ${JSON.stringify({ g0, g1, g2, g3 })}`)
    if (!(/\d{3}$/.test(g0.priceText) && /\.\d\d$/.test(g3.priceText)) || g3.price[2] !== g0.price[2] || g3.chip[2] !== g0.chip[2])
      failures.push(`budget geometry: crossing the cent must not move the chip (${g0.priceText} → ${g3.priceText}; slot ${g0.price[2]} → ${g3.price[2]}; chip ${g0.chip[2]} → ${g3.chip[2]})`)
    const submits = () => page.evaluate(() => ({ sends: window.__lucet.getLog().filter((e) => e.event.type === 'turn/submitted').length, turns: window.__lucet.getState().turns.length, draft: document.querySelector('.lucet-prompt__field')?.value, intercept: window.__lucet.getState().composer.intercept !== null, open: [...document.querySelectorAll('.lucet-budget')].find((c) => c.getBoundingClientRect().width > 0).open, focus: document.activeElement === document.body ? 'body' : document.activeElement?.getAttribute('aria-label') || document.activeElement?.className || document.activeElement?.tagName }))
    await coldStart()
    await armBudget()
    const DRAFT = 'Compare the two proposals and recommend one.'
    const trail = {}
    const send = page.locator('.lucet-prompt button[aria-label="Send"]:visible').first()
    const base = (await submits()).sends
    await send.click(); await page.waitForTimeout(250); trail.opened = await submits()
    /* a click away: the thread column, well outside the panel */
    await page.mouse.click(60, 200); await page.waitForTimeout(200); trail.clickedAway = await submits()
    await send.click(); await page.waitForTimeout(250)
    await page.keyboard.press('Escape'); await page.waitForTimeout(200); trail.escaped = await submits()
    await send.click(); await page.waitForTimeout(250)
    await page.locator('.lucet-budget__decide button', { hasText: 'Use Fast' }).first().click(); await page.waitForTimeout(200); trail.rerouted = await submits()
    await send.click(); await settled(); await page.waitForTimeout(150); trail.sentOnFast = await submits()
    await resetAndInspect('budget sends (fast)')
    await coldStart()
    await armBudget()
    await send.click(); await page.waitForTimeout(250)
    const base2 = (await submits()).sends
    await page.locator('.lucet-budget__decide button', { hasText: 'Continue on Auto' }).first().click(); await settled(); await page.waitForTimeout(150); trail.continued = await submits()
    await resetAndInspect('budget sends (auto)')
    for (const k of ['opened', 'clickedAway', 'escaped', 'rerouted', 'sentOnFast']) trail[k].sends -= base
    trail.continued.sends -= base2
    checks += 3
    const zero = ['opened', 'clickedAway', 'escaped', 'rerouted']
    if (zero.some((k) => trail[k].sends !== 0 || trail[k].turns !== 0) || trail.sentOnFast.sends !== 1 || trail.sentOnFast.turns !== 1 || trail.continued.sends !== 1 || trail.continued.turns !== 1)
      failures.push(`budget sends: the hold must send nothing until a decision, then exactly once — ${JSON.stringify(trail)}`)
    if (zero.some((k) => trail[k].draft !== DRAFT) || trail.clickedAway.intercept || trail.clickedAway.open || trail.escaped.intercept || trail.rerouted.intercept)
      failures.push(`budget draft: a cancel path lost the draft or kept the hold — ${JSON.stringify(trail)}`)
    /* The plain Send after the reroute is the composer's own focus story
       (a pointer Send lands on body once the turn settles — filed for the
       composer's round); the GATE's paths are what this asserts. */
    const gatePaths = ['opened', 'clickedAway', 'escaped', 'rerouted', 'continued']
    if (gatePaths.some((k) => trail[k].focus === 'body') || trail.escaped.focus !== 'Send' || trail.rerouted.focus !== 'Send' || trail.continued.focus !== 'lucet-prompt__field' || !String(trail.opened.focus).includes('lucet-button'))
      failures.push(`budget focus: ${JSON.stringify(Object.fromEntries(Object.entries(trail).map(([k, t]) => [k, t.focus])))} — gate open → first way on, Escape/Use Fast → Send, Continue → the field, never body`)
    }
    /* P2 — language, the scope-freeze rule, metadata, severity (round 05). */
    /* Renames swept: the rail speaks the new names and none of the old. */
    await coldStart()
    const spoken = await railLabels('Features')
    await page.locator('.cfg__views--rail button', { hasText: 'States' }).first().click()
    checks++
    if (!spoken.includes('Use the current page as context') || !spoken.includes('Scope updates after navigation') || spoken.some((l) => /breadcrumb|moves underneath/i.test(l)))
      failures.push(`rail: the scope entries are not renamed — ${JSON.stringify(spoken)}`)
    /* The scope-freeze rule, in the drawer: with nothing typed the ladder
       follows and says so; with a draft the move is HELD and the control
       asks. Both answers walked. */
    const freeze = async (choice) => {
      await coldStart()
      await page.locator('[role="group"][aria-label="Container"] button', { hasText: 'Drawer' }).first().click()
      await page.waitForTimeout(300)
      await fireFromRail('Scope updates after navigation', 'Features')
      await page.waitForFunction(() => window.__lucet.getState().scope.movedNote !== null && window.__lucet.getState().scope.pending === null, null, { timeout: 15000 })
      const followed = await page.evaluate(() => ({ note: [...document.querySelectorAll('.lucet-scope__moved')].find((e) => e.getBoundingClientRect().width > 0)?.textContent.trim() ?? null, button: [...document.querySelectorAll('.lucet-scope__button')].find((b) => b.getBoundingClientRect().width > 0)?.getAttribute('aria-label') }))
      await page.waitForFunction(() => window.__lucet.getState().scope.pending !== null && !window.__lucet.inspect().running, null, { timeout: 15000 })
      await page.waitForTimeout(150)
      const held = await page.evaluate(() => {
        const p = [...document.querySelectorAll('.lucet-scope__pending')].find((e) => e.getBoundingClientRect().width > 0)
        const btns = p ? [...p.querySelectorAll('button')] : []
        return { text: p?.querySelector('.lucet-scope__pending-text')?.textContent.trim(), role: p?.getAttribute('role'), labels: btns.map((b) => b.textContent.trim()), targets: btns.map((b) => b.getBoundingClientRect().height >= 28), button: [...document.querySelectorAll('.lucet-scope__button')].find((b) => b.getBoundingClientRect().width > 0)?.getAttribute('aria-label'), draft: [...document.querySelectorAll('.lucet-prompt__field')].find((f) => f.getBoundingClientRect().width > 0)?.value, noteStillShown: document.querySelector('.lucet-scope__moved') !== null }
      })
      await page.locator('.lucet-scope__pending button', { hasText: choice }).first().click()
      await page.waitForTimeout(150)
      const decided = await page.evaluate(() => ({ pending: window.__lucet.getState().scope.pending, button: [...document.querySelectorAll('.lucet-scope__button')].find((b) => b.getBoundingClientRect().width > 0)?.getAttribute('aria-label'), note: [...document.querySelectorAll('.lucet-scope__moved')].find((e) => e.getBoundingClientRect().width > 0)?.textContent.trim() ?? null, prompt: document.querySelector('.lucet-scope__pending') !== null, draft: [...document.querySelectorAll('.lucet-prompt__field')].find((f) => f.getBoundingClientRect().width > 0)?.value }))
      await page.locator('[role="group"][aria-label="Container"] button', { hasText: 'Full page' }).first().click()
      await page.waitForTimeout(200)
      await resetAndInspect(`scope-freeze (${choice})`)
      return { followed, held, decided }
    }
    const useNew = await freeze('Use Vendor call')
    checks++
    if (!/Reports review/.test(useNew.followed.note || '') || !/Reports review/.test(useNew.followed.button || '')
      || useNew.held.text !== 'Page changed to Vendor call. Update scope?' || useNew.held.role !== 'status' || useNew.held.labels.join('|') !== 'Keep Reports review|Use Vendor call' || useNew.held.targets.length !== 2 || useNew.held.targets.some((t) => !t) || !/Reports review/.test(useNew.held.button || '') || !useNew.held.draft || useNew.held.noteStillShown
      || useNew.decided.pending !== null || !/Vendor call/.test(useNew.decided.button || '') || !/Vendor call/.test(useNew.decided.note || '') || useNew.decided.prompt || !useNew.decided.draft)
      failures.push(`scope-freeze: Use Vendor call does not apply the held move — ${JSON.stringify(useNew)}`)
    const keep = await freeze('Keep Reports review')
    checks++
    if (keep.decided.pending !== null || !/Reports review/.test(keep.decided.button || '') || keep.decided.prompt || !keep.decided.draft || keep.held.labels.length !== 2 || keep.decided.note !== 'Scope remains on Reports review.')
      failures.push(`scope-freeze: Keep Reports review does not keep the ladder and say so — ${JSON.stringify(keep)}`)
    /* 4e. SCOPE AND NAVIGATION (component audit 04), in the drawer through
       the host's own page tabs. Page location and AI scope are asserted as
       two identities: the frame title says where the person is, the chip
       says what the AI may read. A wider scope rides through navigation
       with no note and no decision; a draft holds the page scope until the
       person chooses between two NAMED pages, keeping first; both choices
       keep the draft, its selection and the field's focus, and send
       nothing; a fresh send lets the held move apply; the disabled trigger
       is inert; the counts form a column. */
    {
      await coldStart()
      await page.locator('[role="group"][aria-label="Container"] button', { hasText: 'Drawer' }).first().click()
      await page.waitForTimeout(350)
      const scopeState = () => page.evaluate(() => {
        const s = window.__lucet.getState()
        const sel = s.scope.levels.find((l) => l.id === s.scope.selectedId)
        const chip = [...document.querySelectorAll('.lucet-scope__button')].find((b) => b.getBoundingClientRect().width > 0)
        const pend = [...document.querySelectorAll('.lucet-scope__pending')].find((e) => e.getBoundingClientRect().width > 0)
        const field = [...document.querySelectorAll('.lucet-prompt__field')].find((f) => f.getBoundingClientRect().width > 0)
        const a = document.activeElement
        return {
          frame: document.querySelector('.cfg__frame-title')?.textContent ?? null,
          askAi: document.querySelector('.cfg__askai')?.getAttribute('aria-label') ?? null,
          selectedId: s.scope.selectedId, summary: sel?.summary ?? null, chip: chip?.textContent.trim() ?? null,
          pending: s.scope.pending ? { pageName: s.scope.pending.pageName ?? null } : null,
          pendingText: pend?.querySelector('.lucet-scope__pending-text')?.textContent ?? null,
          buttons: pend ? [...pend.querySelectorAll('button')].map((b) => b.textContent.trim() + '/' + b.dataset.variant) : [],
          rows: pend ? new Set([...pend.children].map((c) => Math.round(c.getBoundingClientRect().top))).size : null,
          note: s.scope.movedNote,
          draft: field?.value ?? null, selection: field ? [field.selectionStart, field.selectionEnd] : null,
          focus: a === document.body ? 'body' : a?.className?.toString().split(' ')[0] || a?.tagName,
          sendDisabled: [...document.querySelectorAll('button[aria-label="Send"]')].find((b) => b.getBoundingClientRect().width > 0)?.disabled ?? null,
          sends: window.__lucet.getLog().filter((e) => e.event.type === 'turn/submitted').length,
        }
      })
      const nav = async (tab) => { await page.locator('.cfg__mock-tabs button', { hasText: tab }).first().click(); await page.waitForTimeout(250) }
      const trail = {}
      trail.start = await scopeState()
      await nav('Reports'); trail.followed = await scopeState()
      await page.evaluate(() => window.__lucet.store.dispatch({ type: 'scope/changed', levelId: 'all' }))
      await page.locator('.lucet-prompt__field:visible').first().fill('List every open risk.')
      await nav('Carriers'); trail.wideDraftNav = await scopeState()
      await page.locator('.lucet-prompt__field:visible').first().fill('')
      await page.evaluate(() => window.__lucet.store.dispatch({ type: 'scope/changed', levelId: 'page' }))
      await nav('Plans')
      await page.locator('.lucet-prompt__field:visible').first().fill('Summarise what changed in the review for the vendor.')
      await page.evaluate(() => { const f = [...document.querySelectorAll('.lucet-prompt__field')].find((x) => x.getBoundingClientRect().width > 0); f.focus(); f.setSelectionRange(10, 22) })
      await nav('Reports'); trail.held = await scopeState()
      await page.keyboard.press('Escape'); await page.waitForTimeout(100); trail.escaped = await scopeState()
      await nav('Carriers'); trail.heldAgain = await scopeState()
      await page.locator('.lucet-scope__pending button', { hasText: 'Keep' }).first().click(); await page.waitForTimeout(200); trail.kept = await scopeState()
      await page.evaluate(() => { const f = [...document.querySelectorAll('.lucet-prompt__field')].find((x) => x.getBoundingClientRect().width > 0); f.focus(); f.setSelectionRange(10, 22) })
      await nav('Reports'); await page.locator('.lucet-scope__pending button', { hasText: 'Use' }).first().click(); await page.waitForTimeout(200); trail.used = await scopeState()
      await nav('Carriers'); trail.heldForSend = await scopeState()
      await page.locator('.lucet-prompt button[aria-label="Send"]:visible').first().click()
      await settled(); await page.waitForTimeout(150); trail.sent = await scopeState()
      checks += 6
      if (trail.start.frame !== 'Quarterly planning' || !/Quarterly planning/.test(trail.start.summary || '') || trail.start.chip !== 'This page' || trail.start.askAi !== 'Ask AI about Quarterly planning'
        || trail.followed.frame !== 'Reports review' || !/Reports review/.test(trail.followed.summary || '') || trail.followed.note !== 'Scope updated to Reports review.' || trail.followed.pending !== null || trail.followed.askAi !== 'Ask AI about Reports review')
        failures.push(`scope identity: page and scope must be two named things, and an empty field follows — ${JSON.stringify({ start: trail.start, followed: trail.followed })}`)
      if (trail.wideDraftNav.selectedId !== 'all' || trail.wideDraftNav.pending !== null || trail.wideDraftNav.note !== null || trail.wideDraftNav.draft !== 'List every open risk.' || !/Carrier directory/.test(trail.wideDraftNav.summary === null ? '' : JSON.stringify(trail.wideDraftNav)) && trail.wideDraftNav.frame !== 'Carrier directory')
        failures.push(`scope wide: All of Aquilo must ride through navigation with no note and no decision — ${JSON.stringify(trail.wideDraftNav)}`)
      if (!trail.held.pending || trail.held.pending.pageName !== 'Reports review' || trail.held.pendingText !== 'Page changed to Reports review. Update scope?' || trail.held.buttons.join('|') !== 'Keep Quarterly planning/primary|Use Reports review/secondary' || trail.held.rows !== 2 || trail.held.chip !== 'Quarterly planning' || !/Quarterly planning/.test(trail.held.summary || '') || trail.held.sendDisabled !== false
        || !trail.escaped.pending || trail.heldAgain.pendingText !== 'Page changed to Carrier directory. Update scope?' || !trail.heldAgain.buttons[1].startsWith('Use Carrier directory'))
        failures.push(`scope hold: a draft must hold the page scope, name both pages with Keep first, keep the chip honest, survive Escape and follow a second navigation — ${JSON.stringify({ held: trail.held, escaped: trail.escaped, heldAgain: trail.heldAgain })}`)
      if (trail.kept.pending !== null || !/Quarterly planning/.test(trail.kept.summary || '') || trail.kept.note !== 'Scope remains on Quarterly planning.' || trail.kept.chip !== 'Quarterly planning' || trail.kept.draft !== 'Summarise what changed in the review for the vendor.' || trail.kept.selection?.join() !== '10,22' || trail.kept.focus !== 'lucet-prompt__field' || trail.kept.sends !== trail.start.sends)
        failures.push(`scope keep: Keep must hold the scope, say so, keep the chip naming its page, and hand the draft back untouched with focus and caret — ${JSON.stringify(trail.kept)}`)
      if (trail.used.pending !== null || !/Reports review/.test(trail.used.summary || '') || trail.used.note !== 'Scope updated to Reports review.' || trail.used.draft !== 'Summarise what changed in the review for the vendor.' || trail.used.selection?.join() !== '10,22' || trail.used.focus !== 'lucet-prompt__field' || trail.used.sends !== trail.start.sends || trail.used.chip !== 'This page')
        failures.push(`scope use: Use must apply the move, say so, and hand the draft back untouched with focus and caret — ${JSON.stringify(trail.used)}`)
      if (!trail.heldForSend.pending || trail.sent.sends !== trail.start.sends + 1 || trail.sent.pending !== null || !/Carrier directory/.test(trail.sent.summary || '') || trail.sent.note !== 'Scope updated to Carrier directory.' || trail.sent.draft !== '')
        failures.push(`scope send: a send while held goes against the kept scope, then the held move applies — ${JSON.stringify({ heldForSend: trail.heldForSend, sent: trail.sent })}`)
      /* the disabled trigger, inert; the count column; reduced motion */
      await page.locator('.cfg__views--rail button', { hasText: 'Features' }).first().click(); await page.waitForTimeout(100)
      await page.locator('nav[aria-label="State triggers"] button', { hasText: 'Use the current page as context' }).first().click(); await page.waitForTimeout(600)
      const inert = await page.evaluate(() => { const c = [...document.querySelectorAll('.lucet-scope__button')].find((b) => b.getBoundingClientRect().width > 0); c?.focus(); return { locked: window.__lucet.getState().composer.locked, tabIndex: c?.tabIndex, ariaDisabled: c?.getAttribute('aria-disabled'), focused: document.activeElement === c } })
      await page.keyboard.press('Enter'); await page.waitForTimeout(80)
      const inertAfter = await page.evaluate(() => ({ open: [...document.querySelectorAll('.lucet-scope__menu')].find((d) => d.getBoundingClientRect().width > 0)?.open ?? null }))
      await settled(); await page.waitForTimeout(150)
      checks++
      if (!inert.locked || inert.tabIndex !== -1 || inert.ariaDisabled !== 'true' || inertAfter.open !== false)
        failures.push(`scope disabled: the trigger must leave the Tab order, say aria-disabled and stay closed under Enter while a turn runs — ${JSON.stringify({ inert, inertAfter })}`)
      await page.evaluate(() => window.__lucet.store.dispatch({ type: 'scope/configured', levels: [{ id: 'page', label: 'This page', name: 'Quarterly planning', summary: 'Quarterly planning and the twelve appendices of the venue programme', itemCount: 7 }, { id: 'section', label: 'Plans and programmes for the northern region', summary: 'Everything filed under Plans and programmes', itemCount: 42 }, { id: 'dept', label: 'Operations', summary: 'Every plan, report and directory in Operations', itemCount: 386 }, { id: 'all', label: 'All of Aquilo', summary: 'Every plan, report and directory in Aquilo', itemCount: 2048 }], selectedId: 'page' }))
      await page.waitForTimeout(100)
      const column = await page.evaluate(() => { const d = [...document.querySelectorAll('.lucet-scope__menu')].find((x) => x.getBoundingClientRect().width > 0); d.open = true; const rights = [...d.querySelectorAll('.lucet-scope__count')].map((c) => c.getBoundingClientRect().right); const p = d.querySelector('.lucet-scope__panel').getBoundingClientRect(); const out = { spread: Math.max(...rights) - Math.min(...rights), slots: d.querySelectorAll('.lucet-scope__check-slot').length, rows: d.querySelectorAll('.lucet-scope__row').length, inside: p.left >= 0 && p.right <= innerWidth, tabular: [...d.querySelectorAll('.lucet-scope__count')].every((c) => getComputedStyle(c).fontVariantNumeric.includes('tabular')) }; document.activeElement?.blur(); d.open = false; return out })
      checks++
      if (column.spread > 0.5 || column.slots !== column.rows || !column.inside || !column.tabular)
        failures.push(`scope column: the counts must share a right edge across 1–4 digits with a check slot on every row — ${JSON.stringify(column)}`)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const quietScope = await page.evaluate(() => { const d = [...document.querySelectorAll('.lucet-scope__menu')].find((x) => x.getBoundingClientRect().width > 0); d.open = true; const out = { running: d.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length, visible: d.querySelector('.lucet-scope__panel').getBoundingClientRect().height > 40 }; document.activeElement?.blur(); d.open = false; return out })
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      checks++
      if (quietScope.running !== 0 || !quietScope.visible) failures.push(`scope reduced motion: ${JSON.stringify(quietScope)}`)
      await page.locator('[role="group"][aria-label="Container"] button', { hasText: 'Full page' }).first().click()
      await page.waitForTimeout(200)
      await resetAndInspect('scope and navigation')
    }
    /* 4f. "THIS PAGE" IS THE PAGE ON SCREEN (component audit 04, independent
       verification). With the scope kept on Quarterly planning while the
       page beneath is Carrier directory: the chip and its accessible name
       say Quarterly planning; the picker offers This page (Carrier
       directory) first, unselected, and marks Quarterly planning as the
       previously selected page; choosing the first row by keyboard brings
       the page on screen into force in one step, focus returns to the
       trigger, the draft and its selection survive, nothing is sent; a
       wider scope never diverges; navigating back to the kept page reads
       This page again. */
    {
      await coldStart()
      await page.locator('[role="group"][aria-label="Container"] button', { hasText: 'Drawer' }).first().click()
      await page.waitForTimeout(350)
      const nav = async (tab) => { await page.locator('.cfg__mock-tabs button', { hasText: tab }).first().click(); await page.waitForTimeout(250) }
      const readPinned = () => page.evaluate(() => {
        const s = window.__lucet.getState()
        const chip = [...document.querySelectorAll('.lucet-scope__button')].find((b) => b.getBoundingClientRect().width > 0)
        const menu = chip?.closest('details')
        const rows = menu ? [...menu.querySelectorAll('.lucet-scope__row')].map((r) => ({ label: r.querySelector('.lucet-scope__row-label')?.textContent, secondary: r.querySelector('.lucet-scope__summary')?.textContent, pressed: r.getAttribute('aria-pressed'), onScreen: r.hasAttribute('data-on-screen') })) : []
        const field = [...document.querySelectorAll('.lucet-prompt__field')].find((f) => f.getBoundingClientRect().width > 0)
        const a = document.activeElement
        return { frame: document.querySelector('.cfg__frame-title')?.textContent ?? null, selectedId: s.scope.selectedId, onScreen: s.scope.onScreen !== null, chip: chip?.textContent.trim() ?? null, name: chip?.getAttribute('aria-label') ?? null, open: menu?.open ?? null, rows, note: s.scope.movedNote, draft: field?.value ?? null, selection: field ? [field.selectionStart, field.selectionEnd] : null, focus: a === document.body ? 'body' : a?.className?.toString().split(' ')[0] || a?.tagName, focusPressed: a?.getAttribute?.('aria-pressed') ?? null, sends: window.__lucet.getLog().filter((e) => e.event.type === 'turn/submitted').length }
      })
      await page.locator('.lucet-prompt__field:visible').first().fill('Summarise what changed in the review for the vendor.')
      await page.evaluate(() => { const f = [...document.querySelectorAll('.lucet-prompt__field')].find((x) => x.getBoundingClientRect().width > 0); f.focus(); f.setSelectionRange(10, 22) })
      await nav('Carriers')
      await page.locator('.lucet-scope__pending button', { hasText: 'Keep' }).first().click(); await page.waitForTimeout(200)
      const pinned = await readPinned()
      /* keyboard: Enter opens on the pinned (selected) row; Home reaches the page on screen; Enter chooses it */
      await page.locator('.lucet-scope__button:visible').first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200)
      const opened = await readPinned()
      await page.keyboard.press('Home'); await page.waitForTimeout(60)
      const onFirst = await readPinned()
      await page.keyboard.press('Enter'); await page.waitForTimeout(200)
      const rebound = await readPinned()
      checks += 4
      if (pinned.chip !== 'Quarterly planning' || pinned.name !== 'Scope: Quarterly planning — the plan and its 4 linked notes' || !pinned.onScreen || pinned.frame !== 'Carrier directory')
        failures.push(`scope pinned: the chip and its name must say the kept page, not This page — ${JSON.stringify(pinned)}`)
      if (!opened.open || opened.rows.length !== 4 || opened.rows[0].label !== 'This page' || !/Carrier directory/.test(opened.rows[0].secondary || '') || opened.rows[0].pressed !== 'false' || !opened.rows[0].onScreen || opened.rows[1].label !== 'Quarterly planning' || opened.rows[1].pressed !== 'true' || !/^Previously selected page · /.test(opened.rows[1].secondary || '') || opened.focusPressed !== 'true' || onFirst.focusPressed !== 'false')
        failures.push(`scope pinned picker: This page (on screen) first and unselected, the kept page named and selected, focus opening on the selected row and Home reaching the first — ${JSON.stringify({ opened: opened.rows, openedFocus: opened.focusPressed, onFirstFocus: onFirst.focusPressed })}`)
      if (rebound.open !== false || rebound.selectedId !== 'page' || rebound.onScreen || rebound.chip !== 'This page' || rebound.name !== 'Scope: This page — Carrier directory — the directory itself' || rebound.note !== 'Scope updated to Carrier directory.' || rebound.focus !== 'lucet-scope__button' || rebound.draft !== 'Summarise what changed in the review for the vendor.' || rebound.selection?.join() !== '10,22' || rebound.sends !== pinned.sends)
        failures.push(`scope rebind: choosing the page on screen must bring its ladder into force once, say so, return focus to the trigger and touch nothing else — ${JSON.stringify(rebound)}`)
      /* navigate away with the draft, keep, then back to the kept page: This page again, same identity */
      await nav('Plans'); await page.locator('.lucet-scope__pending button', { hasText: 'Keep' }).first().click(); await page.waitForTimeout(150)
      const keptAgain = await readPinned()
      await nav('Carriers')
      const back = await readPinned()
      /* a wider scope never diverges */
      await page.evaluate(() => window.__lucet.store.dispatch({ type: 'scope/changed', levelId: 'all' })); await nav('Reports')
      const wide = await readPinned()
      await page.locator('.lucet-scope__button:visible').first().click(); await page.waitForTimeout(200)
      const wideOpen = await readPinned()
      await page.keyboard.press('Escape'); await page.waitForTimeout(100)
      if (keptAgain.chip !== 'Carrier directory' || back.chip !== 'This page' || back.selectedId !== 'page' || !/Carrier directory/.test(back.name || '') || back.onScreen
        || wide.chip !== 'All of Aquilo' || wide.onScreen || wideOpen.rows.length !== 3 || wideOpen.rows.some((r) => r.onScreen))
        failures.push(`scope identity: back on the kept page the chip reads This page with the same scope; a wider scope gains no on-screen row — ${JSON.stringify({ keptAgain: keptAgain.chip, back, wideRows: wideOpen.rows })}`)
      await page.locator('[role="group"][aria-label="Container"] button', { hasText: 'Full page' }).first().click()
      await page.waitForTimeout(200)
      await resetAndInspect('scope pinned picker')
    }
    /* Metadata: the version line counts. */
    await coldStart()
    await fireFromRail('Version history', 'Features')
    await settled()
    await page.waitForTimeout(200)
    const vmeta = await page.evaluate(() => [...document.querySelectorAll('.lucet-thread__vmeta')].map((e) => e.textContent.trim()))
    checks++
    if (vmeta.join('|') !== 'Version 1 of 2|Version 2 of 2 · retried')
      failures.push(`version metadata: expected "Version 1 of 2" and "Version 2 of 2 · retried" — ${JSON.stringify(vmeta)}`)
    await resetAndInspect('version-history')
    /* Severity, in both Glass cells: the rate limit's ending wears caution
       while the outage keeps red; the fallback notice sits one step quieter
       than the info surface with its edge intact; the uncertain answer
       carries "Unverified" in the neutral tone before its text, and no
       percentage anywhere. */
    const savedAppearance = await page.evaluate(() => localStorage.getItem('lucet-docs-appearance'))
    const severity = async (theme) => {
      await page.evaluate((theme) => localStorage.setItem('lucet-docs-appearance', JSON.stringify({ theme, accent: 'violet', neutral: 'accent', expression: 'glass' })), theme)
      await page.emulateMedia({ colorScheme: theme })
      const probe = () => page.evaluate(() => {
        const el = document.createElement('span'); document.body.appendChild(el)
        const color = (v) => { el.style.color = `var(${v})`; return getComputedStyle(el).color }
        el.style.backgroundColor = 'var(--lucet-tone-info-surface)'
        const out = { caution: color('--lucet-tone-caution-foreground'), danger: color('--lucet-tone-danger-foreground'), infoSurface: getComputedStyle(el).backgroundColor, infoBorder: color('--lucet-tone-info-border'), infoInk: color('--lucet-tone-info-foreground'), expression: document.querySelector('[data-expression]')?.getAttribute('data-expression') ?? null }
        el.remove(); return out
      })
      await coldStart(); await fireFromRail('Rate limited', 'States'); await settled(); await page.waitForTimeout(150)
      const tokens = await probe()
      const limited = await page.evaluate(() => { const e = document.querySelector('.lucet-thread__ended'); return { tone: e?.dataset.tone, word: getComputedStyle(e.querySelector('strong')).color, icon: getComputedStyle(e.querySelector('.lucet-icon')).color } })
      await resetAndInspect(`rate-limit tone (${theme})`)
      await coldStart(); await fireFromRail('Provider outage', 'States'); await settled(); await page.waitForTimeout(150)
      const outage = await page.evaluate(() => { const e = document.querySelector('.lucet-thread__ended'); return { tone: e?.dataset.tone ?? null, word: getComputedStyle(e.querySelector('strong')).color } })
      await resetAndInspect(`outage tone (${theme})`)
      await coldStart(); await fireFromRail('Fallback model used', 'States'); await settled(); await page.waitForTimeout(150)
      const fallback = await page.evaluate(() => { const n = document.querySelector('.lucet-notice'); const cs = getComputedStyle(n); return { bg: cs.backgroundColor, border: cs.borderTopColor, color: cs.color } })
      await resetAndInspect(`fallback tone (${theme})`)
      await coldStart(); await fireFromRail('Low confidence', 'States'); await settled(); await page.waitForTimeout(150)
      const uncertain = await page.evaluate(() => { const turn = [...document.querySelectorAll('.lucet-thread__pair')].at(-1); const n = turn.querySelector('.lucet-notice'); const md = turn.querySelector('.lucet-md'); return { state: n?.dataset.state, tone: n?.dataset.tone, label: n?.querySelector('.lucet-notice__label')?.textContent.trim(), text: n?.querySelector('.lucet-notice__text')?.textContent ?? '', before: n && md ? !!(n.compareDocumentPosition(md) & Node.DOCUMENT_POSITION_FOLLOWING) : false, percent: /%/.test(turn.textContent), height: Math.round(n?.getBoundingClientRect().height ?? 0) } })
      await resetAndInspect(`unverified (${theme})`)
      return { tokens, limited, outage, fallback, uncertain }
    }
    const oklch = (str) => { const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)/.exec(str || ''); return m ? { l: +m[1], c: +m[2], h: +m[3] } : null }
    for (const theme of ['dark', 'light']) {
      const sev = await severity(theme)
      const quiet = oklch(sev.fallback.bg), info = oklch(sev.tokens.infoSurface)
      checks++
      if (sev.tokens.expression !== 'glass' || sev.limited.tone !== 'caution' || sev.limited.word !== sev.tokens.caution || sev.limited.icon !== sev.tokens.caution || sev.outage.tone !== null || sev.outage.word !== sev.tokens.danger
        || !quiet || !info || quiet.c >= info.c || quiet.c <= 0 || Math.abs(quiet.l - info.l) > 0.005 || sev.fallback.border !== sev.tokens.infoBorder || sev.fallback.color !== sev.tokens.infoInk
        || sev.uncertain.state !== 'uncertain' || sev.uncertain.tone !== 'neutral' || sev.uncertain.label !== 'Unverified' || sev.uncertain.text !== '' || !sev.uncertain.before || sev.uncertain.percent)
        failures.push(`severity (${theme} glass): ${JSON.stringify(sev)}`)
    }
    await page.evaluate((saved) => { if (saved === null) localStorage.removeItem('lucet-docs-appearance'); else localStorage.setItem('lucet-docs-appearance', saved) }, savedAppearance)
    await page.emulateMedia({ colorScheme: null })
    /* 5. Restore straight into preview, no duplicate blocks. */
    await coldStart()
    const logBefore = await page.evaluate(() => window.__lucet.getLog().length)
    await fireFromRail('Restore a version', 'Features')
    await page.waitForSelector('.lucet-thread__restored', { timeout: 15000 })
    const preview = await page.evaluate((n) => ({ turns: document.querySelectorAll('.lucet-thread__pair').length, deltas: window.__lucet.getLog().slice(n).filter((e) => e.event.type === 'part/delta').length, banner: !!document.querySelector('.lucet-thread__restored') }), logBefore)
    await page.locator('.lucet-thread__return[data-variant="ghost"]').click()
    await page.waitForTimeout(150)
    await fireFromRail('Restore a version', 'Features')
    await page.waitForSelector('.lucet-thread__restored', { timeout: 15000 })
    const again = await page.evaluate(() => ({ turns: document.querySelectorAll('.lucet-thread__pair').length, banner: !!document.querySelector('.lucet-thread__restored') }))
    checks++
    if (preview.turns !== 2 || preview.deltas !== 0 || !preview.banner || again.turns !== 2 || !again.banner)
      failures.push(`restore-version: not straight into preview, or blocks duplicated — ${JSON.stringify({ preview, again })}`)
    await resetAndInspect('restore-version')

    /* 6. VERSIONS: ONE ACT, ONE RESULT, SAID AND SEEN (component audit 05).
       Restore commits from one activation by pointer, Enter and Space, and a
       double click makes one version. Preview lands focus on the banner
       that explains it; restore lands on the new current version's row,
       which reads its provenance; return lands back on the previewed turn.
       Each act is spoken once. The newest version alone wears Current; its
       line is legible at rest. While a new version is being written the
       acts that would start another run wait. The draft and its selection
       survive everything. */
    {
      const versionsState = () => page.evaluate(() => {
        const s = window.__lucet.getState(); const a = document.activeElement
        const pairs = [...document.querySelectorAll('.lucet-thread__pair')].filter((p) => p.getBoundingClientRect().width > 0)
        const field = [...document.querySelectorAll('.lucet-prompt__field')].find((f) => f.getBoundingClientRect().width > 0)
        return {
          turns: s.turns.length, restores: window.__lucet.getLog().filter((e) => e.event.type === 'turn/restored').length, retries: window.__lucet.getLog().filter((e) => e.event.type === 'turn/submitted' && e.event.retryOf).length,
          restoredFrom: s.restoredFrom,
          focus: a === document.body ? 'body' : a?.className?.toString().split(' ')[0] || a?.tagName,
          focusTurn: a?.closest?.('.lucet-thread__pair')?.dataset.turn ?? null,
          badges: pairs.map((p) => p.querySelector('.lucet-thread__vbadge')?.textContent ?? null),
          metas: pairs.map((p) => p.querySelector('.lucet-thread__vmeta')?.textContent ?? null),
          currentMetaOpacity: pairs.map((p) => p.querySelector('.lucet-thread__vrow[data-current] .lucet-thread__vmeta')).filter(Boolean).map((m) => getComputedStyle(m).opacity),
          banner: document.querySelector('.lucet-thread__restored .lucet-thread__restored-text')?.textContent.trim() ?? null,
          spoken: [...document.querySelectorAll('.lucet-visually-hidden[role="status"]')].map((e) => e.textContent.trim()).filter(Boolean).at(-1) ?? null,
          draft: field?.value ?? null, selection: field ? [field.selectionStart, field.selectionEnd] : null,
          disabled: pairs.map((p) => [...p.querySelectorAll('.lucet-actions__btn:disabled')].map((b) => b.textContent.trim())),
        }
      })
      const versionsSetup = async () => {
        await coldStart()
        await fireFromRail('Version history', 'Features')
        await settled(); await page.waitForTimeout(250)
        await page.locator('.lucet-prompt__field').fill('Also list the owners.')
        await page.evaluate(() => { const f = document.querySelector('.lucet-prompt__field'); f.focus(); f.setSelectionRange(5, 9) })
        await page.mouse.move(0, 0)
      }
      const previewOf = (n) => page.locator('.lucet-thread__pair').nth(n).locator('.lucet-actions__btn', { hasText: 'Preview version' }).first()
      const commit = () => page.locator('.lucet-thread__restored button', { hasText: 'Restore this version' }).first()
      const flows = {}
      for (const how of ['pointer', 'Enter', 'Space']) {
        await versionsSetup()
        const rest = await versionsState()
        if (how === 'pointer') { await page.locator('.lucet-thread__pair').first().hover(); await previewOf(0).click() } else { await previewOf(0).focus(); await page.keyboard.press(how) }
        await page.waitForTimeout(250); const previewed = await versionsState()
        if (how === 'pointer') await commit().click(); else { await commit().focus(); await page.keyboard.press(how) }
        await page.waitForTimeout(300); const restored = await versionsState()
        flows[how] = { rest, previewed, restored }
        await resetAndInspect(`versions (${how})`)
      }
      checks += 5
      const r0 = flows.pointer.rest
      if (r0.badges.join('|') !== '|Current' || r0.metas.join('|') !== 'Version 1 of 2|Version 2 of 2 · retried' || !r0.currentMetaOpacity.every((o) => o === '1'))
        failures.push(`versions at rest: exactly one Current with its line legible — ${JSON.stringify({ badges: r0.badges, metas: r0.metas, opacity: r0.currentMetaOpacity })}`)
      for (const how of ['pointer', 'Enter', 'Space']) {
        const f = flows[how]
        if (f.previewed.restoredFrom === null || f.previewed.focus !== 'lucet-thread__restored' || f.previewed.banner !== 'Previewing version 1 of 2 — 1 later turn is set aside, not deleted.' || !/^Previewing version 1 of 2/.test(f.previewed.spoken || ''))
          failures.push(`versions preview (${how}): focus must land on the banner and the act be spoken — ${JSON.stringify({ focus: f.previewed.focus, banner: f.previewed.banner, spoken: f.previewed.spoken })}`)
        if (f.restored.restores !== 1 || f.restored.turns !== 3 || f.restored.restoredFrom !== null || f.restored.focus !== 'lucet-thread__vrow' || f.restored.focusTurn !== 'turn_3' || f.restored.badges.join('|') !== '|Retried|Current' || f.restored.metas[2] !== 'Version 3 of 3 · restored from version 1' || f.restored.spoken !== 'Restored version 1 as version 3.' || f.restored.draft !== 'Also list the owners.' || f.restored.selection?.join() !== '5,9')
          failures.push(`versions restore (${how}): one activation, one version, focus on the new current version, spoken and provenanced, draft intact — ${JSON.stringify(f.restored)}`)
      }
      /* a double click is one restore; return lands on the previewed turn */
      await versionsSetup()
      await page.locator('.lucet-thread__pair').first().hover(); await previewOf(0).click(); await page.waitForTimeout(200)
      await page.locator('.lucet-thread__restored button', { hasText: 'Return to latest' }).first().click(); await page.waitForTimeout(250)
      const returned = await versionsState()
      await page.locator('.lucet-thread__pair').first().hover(); await previewOf(0).click(); await page.waitForTimeout(200)
      await commit().dblclick(); await page.waitForTimeout(350)
      const doubled = await versionsState()
      checks++
      if (returned.restoredFrom !== null || returned.focus !== 'lucet-thread__vrow' || returned.focusTurn !== 'turn_1' || returned.spoken !== 'Returned to latest.' || doubled.restores !== 1 || doubled.turns !== 3)
        failures.push(`versions return/double: return must land on the previewed turn and say so; a double click is one restore — ${JSON.stringify({ returned: { focus: returned.focus, turn: returned.focusTurn, spoken: returned.spoken }, doubled: { restores: doubled.restores, turns: doubled.turns } })}`)
      await resetAndInspect('versions (double)')
      /* Ask again: one retry, the acts wait while it writes, spoken start and finish */
      await versionsSetup()
      /* the scenario's own retry is already in the log: count the delta */
      const retriesBefore = (await versionsState()).retries
      await page.locator('.lucet-thread__pair').last().locator('.lucet-actions__btn', { hasText: 'Ask again' }).first().click()
      await page.waitForTimeout(250); const writing = await versionsState()
      await settled(); await page.waitForTimeout(250); const written = await versionsState()
      checks++
      if (writing.retries !== retriesBefore + 1 || writing.turns !== 3 || !writing.disabled.slice(0, 2).every((d) => d.includes('Ask again')) || !/^Asking again — writing version 3\./.test(writing.spoken || '') || writing.focus === 'body'
        || written.turns !== 3 || written.badges.join('|') !== '|Retried|Current' || written.metas[2] !== 'Version 3 of 3 · retried' || written.spoken !== 'Version 3 is ready.' || written.disabled.some((d) => d.length) || written.draft !== 'Also list the owners.')
        failures.push(`versions ask again: one retry, the acts wait while it writes, start and finish spoken — ${JSON.stringify({ writing: { retries: writing.retries, disabled: writing.disabled, spoken: writing.spoken, focus: writing.focus }, written: { badges: written.badges, meta: written.metas[2], spoken: written.spoken, disabled: written.disabled, draft: written.draft } })}`)
      await resetAndInspect('versions (ask again)')
    }
    /* EVERY ENDING GETS ITS OWN EXIT (audit round 05, P1). Each ending's verb
       says what the state promised and performs it through the runtime, from
       a clean cold start via the rail; "Ask again" survives only where no
       verb is stamped. Every verb is drawn with its own glyph (no repeated
       generic arrow), sits on a target of at least 28px and answers a hit
       test at its centre. Reset is pressed after each and must read empty. */
    const verbIconPaths = new Set()
    const verbTarget = async (where, expectedLabel) => {
      const v = await page.evaluate(() => {
        const turn = [...document.querySelectorAll('.lucet-thread__pair')].at(-1)
        const btn = turn?.querySelector('.lucet-actions__btn[data-recovery]')
        if (!btn) return null
        const r = btn.getBoundingClientRect()
        btn.scrollIntoView({ block: 'center' })
        const r2 = btn.getBoundingClientRect()
        const hit = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2)
        return {
          label: btn.textContent.trim(),
          path: btn.querySelector('path')?.getAttribute('d') || '',
          w: r.width,
          h: r.height,
          hitsItself: hit === btn || btn.contains(hit),
          askAgain: [...turn.querySelectorAll('.lucet-actions__btn')].some((b) => b.textContent.trim() === 'Ask again'),
        }
      })
      checks++
      if (!v) failures.push(`${where}: no recovery verb on the ending`)
      else {
        if (v.label !== expectedLabel) failures.push(`${where}: verb reads "${v.label}", expected "${expectedLabel}"`)
        if (v.w < 27.5 || v.h < 27.5) failures.push(`${where}: verb target ${Math.round(v.w)}x${Math.round(v.h)} is under the 28px standard`)
        if (!v.hitsItself) failures.push(`${where}: the verb's centre does not hit the verb`)
        if (v.askAgain) failures.push(`${where}: "Ask again" is shown beside a stamped verb`)
        if (verbIconPaths.has(v.path)) failures.push(`${where}: the verb repeats another verb's glyph`)
        verbIconPaths.add(v.path)
      }
      return v
    }
    const pressVerb = async () => {
      const btn = page.locator('.lucet-thread__pair').last().locator('.lucet-actions__btn[data-recovery]')
      await btn.focus()
      await page.keyboard.press('Enter')
    }
    const lastTurn = () =>
      page.evaluate(() => {
        const turn = [...document.querySelectorAll('.lucet-thread__pair')].at(-1)
        return {
          turns: document.querySelectorAll('.lucet-thread__pair').length,
          ending: turn.querySelector('.lucet-thread__ended')?.textContent.trim() || null,
          kinds: [...turn.querySelectorAll('.lucet-tool, .lucet-md, .lucet-sources, .lucet-notice')].map((e) => e.className.split(' ')[0].replace('lucet-', '')),
          sourcesLabel: turn.querySelector('.lucet-sources__label')?.textContent.trim() || null,
          rows: turn.querySelectorAll('.lucet-sources__list > li').length,
          text: turn.querySelector('.lucet-md')?.textContent || '',
          toolDetails: [...turn.querySelectorAll('.lucet-tool__detail')].map((d) => d.textContent.trim()),
          staleRows: turn.querySelectorAll('[data-status="stale"]').length,
          goneDetails: turn.querySelectorAll('details.lucet-source[data-status="gone"]').length,
          goneRows: turn.querySelectorAll('.lucet-sources__row[data-status="gone"]').length,
          titles: [...turn.querySelectorAll('.lucet-sources__title')].map((t) => t.textContent.trim()),
          pending: turn.querySelector('.lucet-actions__pending')?.textContent.trim() || null,
          verb: turn.querySelector('.lucet-actions__btn[data-recovery]')?.textContent.trim() || null,
        }
      })
    const verbs = [
      ['Refusal', 'States', 'Show proposed deletions', 'refusal'],
      ['Low confidence', 'States', 'Check sources', 'low-confidence'],
      ['Tool partly fails', 'States', 'Retry missing source', 'tool-partial-failure'],
      ['Stream interrupted', 'States', 'Continue response', 'interrupted'],
      ['Provider outage', 'States', 'Retry connection', 'service-down'],
      ['Stale result', 'States', 'Refresh result', 'stale-data'],
      ['Source updated since', 'States', 'Re-check answer', 'source-updated'],
      ['Source no longer available', 'States', 'Replace source', 'source-gone'],
    ]
    for (const [label, tab, verb, id] of verbs) {
      await coldStart()
      await fireFromRail(label, tab)
      await settled()
      if (id === 'source-updated') await page.waitForSelector('[data-status="stale"]', { timeout: 15000 })
      if (id === 'source-gone') await page.waitForSelector('[data-status="gone"]', { timeout: 15000 })
      await page.waitForTimeout(150)
      const before = await lastTurn()
      const target = await verbTarget(id, verb)
      if (id === 'service-down') {
        const strip = await page.evaluate(() => { const s = document.querySelector('.lucet-prompt__status'); return s ? { tone: s.dataset.tone, text: s.textContent.trim() } : null })
        const words = (t) => new Set((t || '').toLowerCase().match(/[a-z]{5,}/g) || [])
        const shared = [...words(strip?.text)].filter((w) => words(before.ending).has(w))
        checks++
        if (!strip || strip.tone !== 'caution' || shared.length)
          failures.push(`service-down: two levels not distinct — strip ${JSON.stringify(strip)}, ending "${before.ending}", shared ${JSON.stringify(shared)}`)
      }
      if (id === 'source-gone') {
        checks++
        if (before.goneDetails !== 0 || before.goneRows !== 1) failures.push(`source-gone: the removed source reads as openable — ${JSON.stringify({ goneDetails: before.goneDetails, goneRows: before.goneRows })}`)
      }
      if (target) {
        await pressVerb()
        await settled()
        await page.waitForTimeout(150)
        const after = await lastTurn()
        checks++
        const ok =
          id === 'refusal' ? after.turns === 1 && /^Declined\./.test(after.ending || '') && after.sourcesLabel === 'Proposed deletions' && after.rows === 4 && after.verb === null
          : id === 'low-confidence' ? after.turns === 1 && after.sourcesLabel === 'Checked against' && after.kinds.includes('tool')
          : id === 'tool-partial-failure' ? after.turns === 2 && after.kinds.includes('tool')
          : id === 'interrupted' ? after.turns === 1 && after.ending === null && /Previously that step was applied once per file/.test(after.text)
          : id === 'service-down' ? after.turns === 2 && after.ending === null
          : id === 'stale-data' ? after.turns === 1 && after.toolDetails.includes('Fresh — fetched just now')
          : id === 'source-updated' ? after.turns === 1 && after.staleRows === 0 && after.kinds.filter((k) => k === 'tool').length === 1
          : id === 'source-gone' ? after.turns === 1 && after.goneRows === 0 && after.titles.includes('Vendor quote (archived copy)')
          : true
        if (!ok) failures.push(`${id}: the verb did not do what it said — ${JSON.stringify(after)}`)
        if (id === 'service-down') {
          const svc = await page.evaluate(() => ({ status: window.__lucet.getState().service.status, strip: !!document.querySelector('.lucet-prompt__status') }))
          checks++
          if (svc.status !== 'operational' || svc.strip) failures.push(`service-down: Retry connection left the service ${svc.status}, strip ${svc.strip}`)
        }
      }
      await resetAndInspect(id)
    }
    /* Rate limited: the exact reset time, and a retry armed for it — no
       generic retry until then. Reset cancels the armed retry. */
    await coldStart()
    await fireFromRail('Rate limited', 'States')
    await settled()
    await page.waitForTimeout(150)
    const limited = await lastTurn()
    const limitTarget = await verbTarget('rate-limit', 'Retry when it resets')
    checks++
    if (!/Resets at \d\d:\d\d:\d\d/.test(limited.ending || '') || !(await page.evaluate(() => getComputedStyle(document.querySelector('.lucet-thread__at')).fontVariantNumeric.includes('tabular'))))
      failures.push(`rate-limit: the ending does not show the exact reset time in tabular figures — "${limited.ending}"`)
    if (limitTarget) {
      await pressVerb()
      await page.waitForTimeout(150)
      const armed = await page.evaluate(() => ({ pending: document.querySelector('.lucet-actions__pending')?.textContent.trim() || null, verbs: document.querySelectorAll('.lucet-actions__btn[data-recovery]').length, scheduled: window.__lucet.inspect().scheduledRetries, draft: document.querySelector('.lucet-prompt__field')?.disabled === false }))
      checks++
      if (!/Retrying at \d\d:\d\d:\d\d/.test(armed.pending || '') || armed.verbs !== 0 || armed.scheduled !== 1 || !armed.draft)
        failures.push(`rate-limit: the retry is not armed as a status — ${JSON.stringify(armed)}`)
    }
    await resetAndInspect('rate-limit')
    /* Budget spent: the exact reset time, the price inert, and NO exit — a
       monthly cap cannot be left by starting a new thread (component audit
       03, independent verification). The sidebar's New thread keeps the
       month: the strip persists with its time, Send stays blocked, the
       trigger still says the month is spent, and the rows are inert. Only
       the Konfabulator's Reset — the demo's escape hatch — clears it. */
    await coldStart()
    await fireFromRail('Budget spent', 'States')
    await settled()
    await page.waitForSelector('.lucet-prompt__status', { timeout: 15000 })
    await page.waitForTimeout(150)
    const readSpent = () => page.evaluate(() => {
      const s = window.__lucet.getState()
      const strip = [...document.querySelectorAll('.lucet-prompt__status')].find((e) => e.getBoundingClientRect().width > 0)
      const prompt = strip?.closest('.lucet-prompt')
      const chip = prompt?.querySelector('.lucet-budget')
      return {
        spent: s.usage.monthlyBudgetUsd !== null && s.usage.monthlySpentUsd >= s.usage.monthlyBudgetUsd,
        remaining: s.usage.monthlyBudgetUsd === null ? null : Number((s.usage.monthlyBudgetUsd - s.usage.monthlySpentUsd).toFixed(4)),
        resetAt: s.usage.monthlyResetAt,
        turns: s.turns.length,
        tone: strip?.dataset.tone ?? null,
        text: strip?.textContent.trim() ?? '',
        exit: strip?.querySelector('.lucet-prompt__exit')?.textContent.trim() ?? null,
        sendDisabled: prompt?.querySelector('button[aria-label="Send"]')?.disabled ?? null,
        price: !!chip?.querySelector('.lucet-budget__price'),
        label: chip?.querySelector('summary')?.getAttribute('aria-label') ?? '',
        rowsInert: chip ? [...chip.querySelectorAll('.lucet-budget__row')].every((r) => r.getAttribute('aria-disabled') === 'true') : null,
        tabular: getComputedStyle(document.querySelector('.lucet-prompt__at') || document.body).fontVariantNumeric.includes('tabular'),
      }
    })
    const spentBefore = await readSpent()
    checks++
    if (spentBefore.tone !== 'caution' || !/until it resets on \S+ \d+ at \d\d:\d\d\.$/.test(spentBefore.text) || !spentBefore.tabular || spentBefore.exit !== null || spentBefore.price || !spentBefore.spent || spentBefore.sendDisabled !== true || !/monthly budget spent/.test(spentBefore.label) || spentBefore.rowsInert !== true)
      failures.push(`budget-spent: the wall must state its reset time, offer no exit, block Send and leave the picker readable but inert — ${JSON.stringify(spentBefore)}`)
    await page.locator('.cfg__side-new').first().click()
    await page.waitForTimeout(250)
    const spentAfter = await readSpent()
    checks++
    if (!spentAfter.spent || spentAfter.remaining !== spentBefore.remaining || spentAfter.resetAt !== spentBefore.resetAt || spentAfter.turns !== 0 || spentAfter.tone !== 'caution' || !/until it resets on \S+ \d+ at \d\d:\d\d\.$/.test(spentAfter.text) || spentAfter.exit !== null || spentAfter.sendDisabled !== true || !/monthly budget spent/.test(spentAfter.label) || spentAfter.rowsInert !== true)
      failures.push(`budget-spent: a new thread must not touch the month — ${JSON.stringify({ before: spentBefore, after: spentAfter })}`)
    await page.locator('.cfg__rail-top button', { hasText: 'Reset' }).first().click()
    await page.waitForTimeout(250)
    const cleared = await page.evaluate(() => { const s = window.__lucet.getState(); return { spent: s.usage.monthlySpentUsd, budget: s.usage.monthlyBudgetUsd, strip: !!document.querySelector('.lucet-prompt__status'), turns: s.turns.length, ...window.__lucet.inspect() } })
    checks++
    if (cleared.spent !== 6.24 || cleared.budget !== 10 || cleared.strip || cleared.turns !== 0 || cleared.pendingTimers !== 0)
      failures.push(`budget-spent: only the demo's Reset clears the month, and it must restore the seed — ${JSON.stringify(cleared)}`)

    /* THE LIBRARY BRINGS ITS OWN FACE (launch readiness, 2026-09-03).
       Nothing in the shipped CSS read --lucet-font-sans: the tokens
       existed and data-typeface switched them, the mono and prose rules
       read theirs, and every component took its face from an ancestor.
       Here that ancestor is always set, so the docs site hid it for the
       life of the project; a fresh project that followed the README got
       the browser's default serif. Two checks, because one alone would
       hide it again.

       STATIC: by this stylesheet's convention a class with no __ or --
       is a component root, so every root either names the sans or is
       written down below as something that is not a mountable root. A
       new component that forgets the face fails here, before a browser
       is even opened.

       RENDERED: the host's face is poisoned with a name no system can
       resolve, and every root on the page must still compute to the
       sans. A bare div is checked too — if IT does not come back
       poisoned the injection missed and the whole check is vacuous. */
    const reactCss = readFileSync('packages/react/styles/index.css', 'utf8')
    const sansRule = reactCss.slice(reactCss.lastIndexOf('THE FACE IS THE LIBRARY'))
    const SANS_ROOTS = [...sansRule.matchAll(/^\.(lucet-[a-z-]+)(?:,| \{)?$/gm)].map((m) => m[1])
    /* Not mountable roots: a utility class the host may use anywhere, and
       children that are only ever rendered inside a root. */
    const NOT_ROOTS = ['lucet-visually-hidden', 'lucet-att', 'lucet-source', 'lucet-tip', 'lucet-tipwrap']
    const declared = [...reactCss.matchAll(/^\.(lucet-[a-z-]+)(?=[\s,{:[])/gm)].map((m) => m[1])
    const unnamed = [...new Set(declared)].filter((c) => !SANS_ROOTS.includes(c) && !NOT_ROOTS.includes(c) && !/__|--/.test(c))
    checks++
    if (SANS_ROOTS.length < 10) failures.push(`typeface  the sans rule names ${SANS_ROOTS.length} roots — the rule or its marker comment moved, so this check is measuring nothing`)
    checks++
    if (unnamed.length) failures.push(`typeface  component roots that never name --lucet-font-sans: ${unnamed.join(', ')} — add the face, or record why it is not a mountable root`)
    /* THE READING FACE SETS DOCUMENTS, NOT REPLIES (ruling, 2026-09-03).
       The prose slot's narrow reach is the decision, not an oversight, so
       it is pinned: exactly one rule may read it, and that rule is the
       document-mode one. Widening it would restyle every reply, which is
       a product change and should not arrive as a stylesheet tidy-up. */
    const proseUses = (reactCss.match(/var\(--lucet-font-prose\)/g) || []).length
    const proseIsDocMode = /\.lucet-thread__doc\s+\.lucet-md\s*\{[^}]*var\(--lucet-font-prose\)/.test(reactCss)
    checks++
    if (proseUses !== 1 || !proseIsDocMode)
      failures.push(`typeface  the prose slot is read by ${proseUses} rule(s)${proseIsDocMode ? '' : ', and not by the document-mode one'} — the reading face sets documents, not replies (packages/core/styles/typefaces.css)`)

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(url.replace('primitives.html', 'components.html'))
    await still()
    await page.waitForSelector('.sec', { timeout: 15000 })
    await page.waitForTimeout(400)
    const face = await page.evaluate((roots) => {
      const CANARY = 'LucetHostFaceCanary'
      const poison = document.createElement('style')
      poison.textContent = `html, body { font-family: '${CANARY}', cursive !important; }`
      document.head.appendChild(poison)
      const control = document.createElement('div')
      document.body.appendChild(control)
      const first = (el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/['"]/g, '').trim()
      const sans = getComputedStyle(document.documentElement).getPropertyValue('--lucet-font-sans').split(',')[0].replace(/['"]/g, '').trim()
      const mono = getComputedStyle(document.documentElement).getPropertyValue('--lucet-font-mono').split(',')[0].replace(/['"]/g, '').trim()
      const out = { canary: CANARY, control: first(control), sans, mono, seen: 0, borrowed: [], monoSeen: 0, monoBorrowed: [] }
      for (const cls of roots)
        for (const el of document.querySelectorAll('.' + cls)) {
          out.seen++
          if (first(el) !== sans) out.borrowed.push(`${cls} → ${first(el)}`)
        }
      /* The mono slot named its own elements all along, so it should have
         survived the poisoning without this fix. Proven, not assumed. */
      for (const sel of ['.lucet-tool__elapsed', '.lucet-tool__io-pre', '.lucet-md__code', '.lucet-codeblock__pre', '.lucet-sources__io-pre'])
        for (const el of document.querySelectorAll(sel)) {
          out.monoSeen++
          if (first(el) !== mono) out.monoBorrowed.push(`${sel} → ${first(el)}`)
        }
      control.remove()
      poison.remove()
      return out
    }, SANS_ROOTS)
    checks++
    if (face.control !== face.canary)
      failures.push(`typeface  the host-face canary did not take (a bare div reads ${face.control}) — every check below it would pass for the wrong reason`)
    checks++
    if (face.seen < 8) failures.push(`typeface  only ${face.seen} component roots found on the components page — too few to prove anything`)
    checks++
    if (face.borrowed.length)
      failures.push(`typeface  with the host's face poisoned, ${face.borrowed.length} component roots still borrowed it: ${[...new Set(face.borrowed)].slice(0, 6).join('; ')}`)
    checks++
    if (face.monoSeen === 0 || face.monoBorrowed.length)
      failures.push(`typeface  the mono slot: ${face.monoSeen} elements, ${[...new Set(face.monoBorrowed)].slice(0, 4).join('; ') || 'none borrowed'}`)

    /* THE HEADER IS A CONSTANT, AND THE DEMO'S SPACE IS NOT NEGOTIABLE
       (launch readiness). Six destinations in one order on every page —
       the four pages, then npm and the repository — because a nav that
       reshuffles itself makes the reader re-find everything. The npm URL
       is written out here rather than derived: it is the one link in the
       site that must point at a real published package page, and it was
       verified by loading it. The frame heights are recorded constants:
       the demo's height is what every "just one more thing in the
       header" costs, so if either moves, something was added to the
       chrome and this fails saying which viewport lost the space. */
    const NAV = ['Konfabulator', 'Components', 'Primitives', 'About', 'npm', 'GitHub']
    /* Three pages hang from one shell, so their headings start on one
       line. About had no appearance row at first and sat 30px high;
       carrying the same row is what makes this true by construction
       rather than by a reserved number. */
    const titleTops = {}
    const NPM_URL = 'https://www.npmjs.com/package/lucet-react'
    for (const [path, id] of [['index.html?instant=1', 'Konfabulator'], ['components.html', 'Components'], ['primitives.html', 'Primitives'], ['about.html', 'About']]) {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(url.replace('primitives.html', path))
      await still()
      await page.waitForSelector('.cfg__navlink', { timeout: 15000 })
      await page.waitForTimeout(200)
      const nav = await page.evaluate(() => {
        const first = (v) => v.split(',')[0].replace(/['"]/g, '').trim()
        const sans = first(getComputedStyle(document.documentElement).getPropertyValue('--lucet-font-sans'))
        return [...document.querySelectorAll('.cfg__navlink')].map((a) => {
          const cs = getComputedStyle(a)
          return {
            label: a.textContent.trim(), href: a.getAttribute('href'),
            current: a.getAttribute('aria-current'),
            target: a.getAttribute('target'), rel: a.getAttribute('rel') ?? '',
            arrow: !!a.querySelector('.cfg__navlink-out'),
            size: cs.fontSize, family: first(cs.fontFamily), sans,
            colour: cs.color, height: Math.round(a.getBoundingClientRect().height),
          }
        })
      })
      const where = `site nav on ${path}`
      checks++
      if (nav.map((l) => l.label).join(' · ') !== NAV.join(' · '))
        failures.push(`${where}: ${nav.map((l) => l.label).join(' · ')} — the six destinations must read ${NAV.join(' · ')}`)
      const current = nav.filter((l) => l.current === 'page')
      checks++
      if (current.length !== 1 || current[0].label !== id)
        failures.push(`${where}: ${current.length} links marked current (${current.map((l) => l.label).join(', ')}) — exactly one, and it must be ${id}`)
      const outbound = nav.filter((l) => l.label === 'npm' || l.label === 'GitHub')
      checks++
      if (outbound.length !== 2 || outbound.some((l) => l.target !== '_blank' || !/noopener/.test(l.rel) || !l.arrow))
        failures.push(`${where}: both outbound links open in a new tab, carry rel=noopener and wear the arrow — ${JSON.stringify(outbound.map((l) => [l.label, l.target, l.rel, l.arrow]))}`)
      checks++
      if (nav.find((l) => l.label === 'npm')?.href !== NPM_URL)
        failures.push(`${where}: npm points at ${nav.find((l) => l.label === 'npm')?.href}, not the verified package page ${NPM_URL}`)
      checks++
      /* One recipe: the new links may not be a size, a face or an ink of
         their own. The current page is the one allowed difference — full
         ink is how it says where you are. */
      const rest = nav.filter((l) => l.current !== 'page')
      const drift = rest.filter((l) => l.size !== '13px' || l.family !== l.sans || l.colour !== rest[0].colour || l.height < 24)
      if (drift.length) failures.push(`${where}: nav links drift from the family — ${JSON.stringify(drift.map((l) => [l.label, l.size, l.family, l.colour, l.height]))}`)
      const title = await page.evaluate(() => {
        const t = document.querySelector('.prim__title')
        return t ? { top: Math.round(t.getBoundingClientRect().top), left: Math.round(t.getBoundingClientRect().left) } : null
      })
      if (title) titleTops[path] = title
      checks++
      const ring = await page.evaluate(() => {
        const a = document.querySelector('.cfg__navlink')
        a.focus()
        const cs = getComputedStyle(a)
        return { focused: document.activeElement === a, width: cs.outlineWidth, style: cs.outlineStyle }
      })
      if (!ring.focused || ring.style === 'none' || parseFloat(ring.width) < 1)
        failures.push(`${where}: a nav link takes focus and shows a ring — ${JSON.stringify(ring)}`)
    }
    checks++
    const tops = Object.entries(titleTops)
    if (tops.length < 3 || new Set(tops.map(([, t]) => `${t.top}/${t.left}`)).size !== 1)
      failures.push(`page headings start on different lines: ${tops.map(([p, t]) => `${p} ${t.top},${t.left}`).join(' · ')} — the pages share one shell, so the h1 shares one position`)

    /* The demo's own height, before and after anything is added to the
       chrome: 686px at 1280x900 and 579px at 390x844 (launch readiness,
       measured before the About and npm links were added and unchanged
       by them). A change here means the header or the stage bar grew. */
    for (const [w, h, expect] of [[1280, 900, 686], [390, 844, 579]]) {
      await page.setViewportSize({ width: w, height: h })
      await page.goto(url.replace('primitives.html', 'index.html?instant=1'))
      await still()
      await page.waitForSelector('.cfg__frame', { timeout: 15000 })
      await page.waitForTimeout(300)
      const got = await page.evaluate(() => Math.round(document.querySelector('.cfg__frame').getBoundingClientRect().height))
      checks++
      if (got !== expect)
        failures.push(`konfabulator space at ${w}x${h}: the frame is ${got}px, not ${expect}px — the demo's height changed, so something was added to the header or the stage bar`)
    }
    await page.setViewportSize({ width: 1280, height: 900 })

    /* PAGE RHYTHM — THE HORIZONTAL HALF OF THE SCALE (audit round 09).
       The vertical gaps were named in the macro pass; the gutter between
       two cells was a literal 36px, half the smallest interval between two
       sections, and adjacent specimens read as one object. --cfg-gap-cell
       is that gutter, on both axes, and it is pinned from both sides: a
       cell-to-cell gap is never tighter than the step between two related
       sections (72px), and a section's end is never tighter than its own
       cells are to each other — so the token IS the supporting step, 72px,
       the only value satisfying both. Measured at Gate 0 and after:
       heading→specimen 22, gutter 36→72, section step 72 (kin) / 96, chapter
       160. The ordering below is the invariant; the cell floor wins over the
       column count, so a group that can no longer hold its columns above
       --cfg-cell-min drops one instead of compressing its text. */
    for (const width of [1440, 1366, 1024]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(url.replace('primitives.html', 'components.html'))
      await still()
      await page.waitForSelector('.sec', { timeout: 15000 })
      await page.waitForTimeout(300)
      const r = await page.evaluate(() => {
        const px = (v) => parseFloat(v) || 0
        const root = document.querySelector('.prim--comp')
        const cell = px(getComputedStyle(root).getPropertyValue('--cfg-gap-cell'))
        const R = (el) => el.getBoundingClientRect()
        const groups = [...document.querySelectorAll('.stage--duet, .stage--trio')].map((g) => {
          const cs = getComputedStyle(g)
          const cells = [...g.children].filter((c) => c.classList.contains('spec'))
          const rows = new Map()
          for (const c of cells) {
            const t = Math.round(R(c).top)
            if (!rows.has(t)) rows.set(t, [])
            rows.get(t).push(c)
          }
          const tops = [...rows.keys()].sort((a, b) => a - b)
          const gutters = []
          for (const t of tops) {
            const row = rows.get(t).sort((a, b) => R(a).left - R(b).left)
            for (let i = 1; i < row.length; i++) gutters.push(R(row[i]).left - R(row[i - 1]).right)
          }
          const rowGaps = []
          for (let i = 1; i < tops.length; i++)
            rowGaps.push(tops[i] - Math.max(...rows.get(tops[i - 1]).map((c) => R(c).bottom)))
          return {
            kind: g.classList.contains('stage--trio') ? 'trio' : 'duet',
            sec: g.closest('.sec')?.querySelector('.sec__name')?.textContent?.trim() ?? '?',
            colGap: px(cs.columnGap), rowGap: px(cs.rowGap), gutters, rowGaps,
            /* The widest row, not the first: a showcase band spans the
               whole group and would otherwise report the group as one
               column. The floor is only owed to cells that share a row —
               a single column is allowed under it (min(100%, floor)). */
            cols: Math.max(...[...rows.values()].map((r) => r.length)),
            floor: px(getComputedStyle(g).getPropertyValue('--cfg-cell-min')),
            sharedWidths: [...rows.values()].filter((r) => r.length > 1).flatMap((r) => r.map((c) => R(c).width)),
            /* Every cell says which state it is and what to make of it: a
               label above, its own caption beneath, one of each. A group
               caption standing in for several cells is the thing this
               forbids, so the note count must equal the cell count. */
            labels: cells.map((c) => c.querySelectorAll(':scope > .spec__head > .spec__label, :scope > .spec__label').length),
            notes: cells.map((c) => c.querySelectorAll(':scope > .spec__note').length),
            groupNotes: g.querySelectorAll('.spec__note').length,
          }
        })
        /* The four named intervals, from the cascade rather than from a
           screenshot: the step under a heading, the gutter, the smallest
           true section-to-section step (a section that follows a chapter
           label is attached to it, not separated from it), the chapter. */
        const secs = [...document.querySelectorAll('.sec')]
        const head = secs
          .map((s) => {
            const h = s.querySelector(':scope > .sec__head')
            const first = [...s.children].find((c) => c !== h)
            return h && first ? Math.round(R(first).top - R(h).bottom) : null
          })
          .filter((n) => n !== null)
        const stepOf = (s) => px(getComputedStyle(s).marginBlockStart)
        const sectionSteps = secs
          .filter((s) => s.previousElementSibling?.classList.contains('sec'))
          .map(stepOf)
        const chapterSteps = [...document.querySelectorAll('.chapter')]
          .filter((c) => c.previousElementSibling?.classList.contains('sec'))
          .map(stepOf)
        return {
          cell, groups, headMax: Math.max(...head), headMin: Math.min(...head),
          sectionMin: Math.min(...sectionSteps), chapterMin: Math.min(...chapterSteps),
          over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })
      const near = (a, b) => Math.abs(a - b) <= 1.5
      checks++
      if (r.over > 0) failures.push(`page rhythm  components.html at ${width}px scrolls sideways by ${r.over}px`)
      checks++
      if (r.cell !== 72) failures.push(`page rhythm  --cfg-gap-cell resolves to ${r.cell}px at ${width}px, not the supporting step (72px)`)
      checks++
      if (!(r.headMax < r.cell && r.cell <= r.sectionMin && r.sectionMin < r.chapterMin))
        failures.push(
          `page rhythm  the ordering inverts at ${width}px: heading→specimen ${r.headMin}–${r.headMax}, gutter ${r.cell}, section ${r.sectionMin}, chapter ${r.chapterMin} — it must read heading < gutter <= section < chapter`,
        )
      if (r.groups.length === 0) failures.push(`page rhythm  no duet or trio found at ${width}px`)
      for (const g of r.groups) {
        const where = `page rhythm  ${g.kind} in "${g.sec}" at ${width}px`
        checks++
        if (!near(g.colGap, r.cell) || !near(g.rowGap, r.cell))
          failures.push(`${where}: gaps are ${g.colGap}/${g.rowGap}, not the cell token on both axes (${r.cell})`)
        checks++
        if (g.gutters.some((x) => !near(x, r.cell)) || g.rowGaps.some((x) => !near(x, r.cell)))
          failures.push(`${where}: measured separations ${JSON.stringify([...g.gutters, ...g.rowGaps].map((x) => Math.round(x)))} — every one must be the cell gap ${r.cell}`)
        checks++
        if (g.labels.some((n) => n !== 1) || g.notes.some((n) => n !== 1) || g.groupNotes !== g.notes.length)
          failures.push(`${where}: every cell carries one label and its own caption — labels ${JSON.stringify(g.labels)}, captions ${JSON.stringify(g.notes)}, captions in the group ${g.groupNotes}`)
        checks++
        if (g.sharedWidths.some((w) => w < g.floor - 1))
          failures.push(`${where}: ${g.cols} columns put a cell under its ${g.floor}px floor — ${JSON.stringify(g.sharedWidths.map(Math.round))}; the floor wins over the count`)
      }
      if (width !== 1024) {
        const trios = r.groups.filter((g) => g.kind === 'trio')
        checks++
        if (trios.length === 0 || trios.some((g) => g.cols !== 3))
          failures.push(`page rhythm  a trio must still hold three columns at ${width}px — ${JSON.stringify(trios.map((g) => g.cols))}`)
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 })

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
      for (const path of ['primitives.html', 'components.html', 'index.html', 'about.html']) {
        /* ?instant=1: the audit says it wants the resting thread; the site no longer sniffs the browser (round 06). */
        await page.goto(url.replace('primitives.html', path === 'index.html' ? 'index.html?instant=1' : path))
        await still()
        await page.waitForSelector(path === 'index.html' ? '.cfg__frame' : path === 'about.html' ? '.about__cmd' : '.sec', { timeout: 15000 })
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
        /* Receipt payloads wrap at their structure (component audit 02): with
           every receipt opened, no payload is wider than its box. */
        const payloads = await page.evaluate(() => {
          for (const d of document.querySelectorAll('details.lucet-tool')) d.open = true
          return [...document.querySelectorAll('.lucet-tool__io-pre')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ client: e.clientWidth, scroll: e.scrollWidth, chars: e.textContent.length }))
        })
        checks++
        const scrolling = payloads.filter((x) => x.scroll > x.client)
        if (scrolling.length) failures.push(`receipt payload  ${path} at ${width}px: ${scrolling.length} of ${payloads.length} payloads scroll sideways — ${JSON.stringify(scrolling.slice(0, 3))}`)
        if (path === 'components.html') {
          /* The cost panel open at this width (component audit 03): inside
             the viewport, and no horizontal document overflow with it open. */
          const panels = await page.evaluate((vw) => {
            const out = []
            for (const d of document.querySelectorAll('.lucet-budget')) {
              d.open = true
              const p = d.querySelector('.lucet-budget__panel')?.getBoundingClientRect()
              if (p) out.push({ inside: p.left >= 0 && p.right <= vw, width: Math.round(p.width), over: document.documentElement.scrollWidth - document.documentElement.clientWidth })
              document.activeElement?.blur()
              d.open = false
            }
            return out
          }, width)
          checks++
          if (panels.length === 0 || panels.some((p) => !p.inside || p.over > 0))
            failures.push(`budget panel at ${width}px: ${JSON.stringify(panels)} — the panel must fit the viewport and add no overflow`)
        }
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
