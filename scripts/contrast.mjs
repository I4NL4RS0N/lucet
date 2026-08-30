/**
 * Colour maths for the accessibility audit.
 *
 * Separate from the audit itself so it can be unit tested. An audit is only
 * worth having if the thing doing the measuring is correct, and two earlier
 * hand-rolled versions of this reported everything as passing or everything as
 * failing at 1:1 because they parsed Chrome's oklch() output as RGB.
 */

/** Parse a computed colour string to linear-light sRGB in 0..1. */
export function toLinearRGB(input) {
  const s = String(input).trim()

  if (s.startsWith('rgb')) {
    const parts = s.match(/[\d.]+/g)
    if (!parts) return null
    const srgb = parts.slice(0, 3).map(Number).map((v) => v / 255)
    return srgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  }

  // Chrome serialises relative-colour results as oklab(), not oklch(), so both
  // have to be handled. Missing this produced 130 phantom "could not resolve"
  // failures the first time the audit ran.
  let L
  let a
  let b

  const lch = s.match(/oklch\(([^)]+)\)/)
  const lab = s.match(/oklab\(([^)]+)\)/)

  if (lch) {
    const [l, C, H] = lch[1].split(/[\s/]+/).filter(Boolean).map(Number.parseFloat)
    if (![l, C, H].every(Number.isFinite)) return null
    L = lch[1].includes('%') ? l / 100 : l
    const h = (H * Math.PI) / 180
    a = C * Math.cos(h)
    b = C * Math.sin(h)
  } else if (lab) {
    const [l, aa, bb] = lab[1].split(/[\s/]+/).filter(Boolean).map(Number.parseFloat)
    if (![l, aa, bb].every(Number.isFinite)) return null
    L = lab[1].includes('%') ? l / 100 : l
    a = aa
    b = bb
  } else {
    return null
  }

  // Oklab -> LMS' -> LMS -> linear sRGB (Björn Ottosson).
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const q = s_ ** 3

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * q,
  ].map((v) => Math.min(1, Math.max(0, v)))
}

export function relativeLuminance(input) {
  const rgb = toLinearRGB(input)
  if (!rgb) return null
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

/** WCAG 2.x contrast ratio. Returns null when either colour cannot be parsed. */
export function contrastRatio(a, b) {
  const x = relativeLuminance(a)
  const y = relativeLuminance(b)
  if (x === null || y === null) return null
  const [hi, lo] = x > y ? [x, y] : [y, x]
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2))
}

/**
 * Parse a computed colour to gamma-encoded sRGB plus alpha, for compositing.
 *
 * toLinearRGB above deliberately ignores alpha, which was fine while every
 * background the audits read was opaque. The hover tokens are translucent ink
 * now, and dark's --lucet-line always was translucent -- an audit that treats
 * a 8%-alpha veil as an opaque near-black measures a background that does not
 * exist on screen.
 */
export function toSRGBA(input) {
  const s = String(input).trim()
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }

  if (s.startsWith('rgb')) {
    const parts = s.match(/[\d.]+/g)
    if (!parts || parts.length < 3) return null
    const [r, g, b] = parts.slice(0, 3).map((v) => Number(v) / 255)
    const a = parts.length > 3 ? Number(parts[3]) : 1
    return { r, g, b, a }
  }

  const m = s.match(/okl(?:ch|ab)\(([^)]+)\)/)
  if (m) {
    const alpha = m[1].includes('/') ? Number.parseFloat(m[1].split('/')[1]) : 1
    const rgb = toLinearRGB(s)
    if (!rgb) return null
    const un = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
    return { r: un(rgb[0]), g: un(rgb[1]), b: un(rgb[2]), a: Number.isFinite(alpha) ? alpha : 1 }
  }
  return null
}

/**
 * Flatten a background CHAIN -- innermost element's colour first, ancestors
 * after -- to the single opaque colour actually painted behind an element.
 * Falls back to compositing over white, which is what browsers do when nothing
 * in the chain is opaque. Returns an rgb() string, or null if the innermost
 * layer cannot be parsed (a chain the audit cannot see through must fail
 * loudly, not pass quietly).
 */
export function flattenBackground(chain) {
  const layers = Array.isArray(chain) ? chain : [chain]
  let acc = { r: 0, g: 0, b: 0, a: 0 }
  for (const layer of layers) {
    const c = toSRGBA(layer)
    if (!c) return null
    const a = acc.a + c.a * (1 - acc.a)
    if (a > 0) {
      acc = {
        r: (acc.r * acc.a + c.r * c.a * (1 - acc.a)) / a,
        g: (acc.g * acc.a + c.g * c.a * (1 - acc.a)) / a,
        b: (acc.b * acc.a + c.b * c.a * (1 - acc.a)) / a,
        a,
      }
    }
    if (acc.a >= 0.999) break
  }
  if (acc.a < 0.999) {
    const a = acc.a
    acc = { r: acc.r * a + (1 - a), g: acc.g * a + (1 - a), b: acc.b * a + (1 - a), a: 1 }
  }
  /* Three decimals, not 8-bit: rounding to 255ths costs ~0.003 of oklab L,
     which is enough to flip a role-distinctness pair sitting at its
     threshold. Our own parser reads fractional rgb() fine. */
  const to255 = (v) => +(Math.min(1, Math.max(0, v)) * 255).toFixed(3)
  return `rgb(${to255(acc.r)}, ${to255(acc.g)}, ${to255(acc.b)})`
}

/** Oklab lightness of a colour (composited over white if translucent). */
export function oklabLightness(input) {
  const c = toSRGBA(input)
  if (!c) return null
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [lin(c.r), lin(c.g), lin(c.b)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}

/** WCAG 2.2 thresholds we hold ourselves to. */
export const AA_TEXT = 4.5
export const AA_NON_TEXT = 3
export const MIN_TARGET_PX = 24
