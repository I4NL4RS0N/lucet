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
       Nothing on the page may still say "Restore this version". */
    const checkRestoreLabels = async (where) => {
      const res = await page.evaluate(() => {
        const bad = []
        if ([...document.querySelectorAll('button')].some((b) => /Restore this version/i.test(b.textContent))) bad.push('a button still says "Restore this version"')
        const previews = [...document.querySelectorAll('.lucet-actions__btn')].filter((b) => b.textContent.trim() === 'Preview version')
        if (!previews.length) bad.push('no Preview version action found')
        for (const p of previews) {
          const tip = document.getElementById(p.getAttribute('aria-describedby') || '')
          if (!tip || !/nothing changes until you restore/.test(tip.textContent)) { bad.push('Preview version lacks its tip'); break }
        }
        const banners = [...document.querySelectorAll('.lucet-thread__restored')]
        if (!banners.length) bad.push('no preview banner found')
        for (const banner of banners) {
          if (!/^Previewing an earlier version/.test((banner.querySelector('.lucet-thread__restored-text')?.textContent || '').trim())) bad.push('banner sentence does not begin "Previewing an earlier version"')
          const ghost = banner.querySelector('.lucet-thread__return[data-variant="ghost"]')
          const primary = banner.querySelector('.lucet-thread__return[data-variant="primary"][data-commit]')
          if (!ghost || ghost.textContent.trim() !== 'Return to latest') bad.push('banner ghost is not "Return to latest"')
          if (!primary || primary.textContent.trim() !== 'Restore version') bad.push('banner primary is not "Restore version"')
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
        return { turns: s.turns.length, author: last?.prompt.authorId ?? null, locked: s.composer.locked, by: s.composer.lockedBy, strip: strip?.textContent.includes('Ada is taking a turn — yours sends next'), stripRole: strip?.getAttribute('role'), face: !!strip?.querySelector('.lucet-avatar'), typeable: !!f && !f.disabled && !f.readOnly, chars: text.length, streaming: last?.response?.status === 'streaming' }
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
    const queuedStrip = await page.evaluate(() => document.querySelector('.lucet-prompt__status')?.textContent.includes('Queued — yours sends next'))
    await page.waitForFunction(() => document.querySelectorAll('.lucet-thread__pair').length >= 2 && !window.__lucet.inspect().running && !window.__lucet.inspect().locked, null, { timeout: 30000 })
    const sent = await page.evaluate(() => ({ turns: document.querySelectorAll('.lucet-thread__pair').length, queued: window.__lucet.inspect().queued, last: [...document.querySelectorAll('.lucet-thread__prompt')].at(-1)?.textContent.trim(), yours: window.__lucet.getState().turns.at(-1)?.prompt.authorId }))
    checks++
    if (a1.turns !== 1 || a1.author !== 'Ada' || !a1.locked || a1.by !== 'Ada' || !a1.strip || a1.stripRole !== 'status' || !a1.face || !a1.typeable || a1.chars !== 0 || !a1.streaming
      || a2.turns !== 1 || !a2.locked || !a2.strip || a2.chars < 1 || a2.chars >= full || !a2.streaming
      || queueLabel !== 'Queue' || !queuedStrip || sent.turns !== 2 || sent.queued !== null || sent.last !== 'And the southern site?' || sent.yours !== 'you')
      failures.push(`multiplayer: ownership and the queue are not live — ${JSON.stringify({ a1, a2, full, queueLabel, queuedStrip, sent })}`)
    await resetAndInspect('multiplayer')
    /* 3a. Ada from the deep link (the timing review, 2026-09-03): the page
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
        return { turns: s.turns.length, author: last?.prompt.authorId ?? null, by: s.composer.lockedBy, chars: text.length, streaming: last?.response?.status === 'streaming', strip: !!document.querySelector('.lucet-prompt__status')?.textContent.includes('Ada is taking a turn'), firstResponse: s.turns[0]?.response?.status ?? null }
      })
    }
    const l1 = await adaLinkAt(300), l2 = await adaLinkAt(1500)
    checks++
    if (l1.turns !== 3 || l1.author !== 'Ada' || l1.by !== 'Ada' || l1.chars !== 0 || !l1.streaming || !l1.strip || l1.firstResponse !== 'complete' || l2.chars < 1 || l2.chars >= full || !l2.streaming)
      failures.push(`multiplayer (deep link): Ada's turn is not live from the deep link — ${JSON.stringify({ l1, l2 })}`)
    await page.waitForFunction(() => !window.__lucet.inspect().running && !window.__lucet.inspect().locked, null, { timeout: 30000 })
    await resetAndInspect('multiplayer via the deep link')
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
    if (!stable(g0, g1) || !stable(g1, g2) || !stable(g2, g3) || !g1.buttons.some((b) => b.startsWith('Queue:')) || g2.buttons.some((b) => b.startsWith('Queue')))
      failures.push(`composer gate 0: the action swap moved the composer — ${JSON.stringify({ g0, g1, g2, g3 })}`)
    checks++
    if (immediate.queued !== 'And the southern site?' || immediate.strip !== 'Queued — yours sends next' || immediate.tone !== 'info' || immediate.field !== '' || !immediate.focusOnField)
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
    if (quiet.running !== 0 || quiet.strip !== 'Queued — yours sends next')
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
    const useNew = await freeze('Use new page')
    checks++
    if (!/Reports review/.test(useNew.followed.note || '') || !/Reports review/.test(useNew.followed.button || '')
      || useNew.held.text !== 'Page changed — update scope?' || useNew.held.role !== 'status' || useNew.held.labels.join('|') !== 'Use new page|Keep previous page' || useNew.held.targets.length !== 2 || useNew.held.targets.some((t) => !t) || !/Reports review/.test(useNew.held.button || '') || !useNew.held.draft || useNew.held.noteStillShown
      || useNew.decided.pending !== null || !/Vendor call/.test(useNew.decided.button || '') || !/Vendor call/.test(useNew.decided.note || '') || useNew.decided.prompt || !useNew.decided.draft)
      failures.push(`scope-freeze: Use new page does not apply the held move — ${JSON.stringify(useNew)}`)
    const keep = await freeze('Keep previous page')
    checks++
    if (keep.decided.pending !== null || !/Reports review/.test(keep.decided.button || '') || keep.decided.prompt || !keep.decided.draft || keep.held.labels.length !== 2)
      failures.push(`scope-freeze: Keep previous page does not keep the ladder — ${JSON.stringify(keep)}`)
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
    /* Budget spent: the exact reset date, the price inert, and the one exit that will not fail again. */
    await coldStart()
    await fireFromRail('Budget spent', 'States')
    await settled()
    await page.waitForSelector('.lucet-prompt__status', { timeout: 15000 })
    await page.waitForTimeout(150)
    const spentState = await page.evaluate(() => { const s = document.querySelector('.lucet-prompt__status'); return { tone: s?.dataset.tone, text: s?.textContent.trim() || '', exit: s?.querySelector('.lucet-prompt__exit')?.textContent.trim() || null, price: !!document.querySelector('.lucet-budget__price'), tabular: getComputedStyle(document.querySelector('.lucet-prompt__at') || document.body).fontVariantNumeric.includes('tabular') } })
    checks++
    if (spentState.tone !== 'caution' || !/until it resets on \S+ \d/.test(spentState.text) || /resets Resets/i.test(spentState.text) || !spentState.tabular || spentState.exit !== 'New thread' || spentState.price)
      failures.push(`budget-spent: reset date, inert price or exit missing — ${JSON.stringify(spentState)}`)
    await page.locator('.lucet-prompt__exit').click()
    await page.waitForTimeout(250)
    const fresh = await page.evaluate(() => ({ turns: document.querySelectorAll('.lucet-thread__pair').length, strip: !!document.querySelector('.lucet-prompt__status'), ...window.__lucet.inspect() }))
    checks++
    if (fresh.turns !== 0 || fresh.strip || fresh.pendingTimers !== 0) failures.push(`budget-spent: New thread did not start clean — ${JSON.stringify(fresh)}`)

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
        /* ?instant=1: the audit says it wants the resting thread; the site no longer sniffs the browser (round 06). */
        await page.goto(url.replace('primitives.html', path === 'index.html' ? 'index.html?instant=1' : path))
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
