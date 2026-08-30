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

/** WCAG 2.2 thresholds we hold ourselves to. */
export const AA_TEXT = 4.5
export const AA_NON_TEXT = 3
export const MIN_TARGET_PX = 24
