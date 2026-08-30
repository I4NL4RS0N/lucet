import { describe, expect, it } from 'vitest'
import { contrastRatio, flattenBackground, oklabLightness, relativeLuminance, toLinearRGB, toSRGBA } from './contrast.mjs'

/**
 * The audit is only as trustworthy as its maths. Two earlier hand-rolled
 * versions silently reported every pair as 1:1 because they read Chrome's
 * oklch() output as RGB, so these cases pin the conversion to known values.
 */
describe('colour parsing', () => {
  it('parses rgb()', () => {
    expect(toLinearRGB('rgb(255, 255, 255)')).toEqual([1, 1, 1])
    expect(toLinearRGB('rgb(0, 0, 0)')).toEqual([0, 0, 0])
  })

  it('parses oklch(), which is what Chrome returns for our tokens', () => {
    const white = toLinearRGB('oklch(1 0 0)')
    expect(white[0]).toBeCloseTo(1, 2)
    const black = toLinearRGB('oklch(0 0 0)')
    expect(black[0]).toBeCloseTo(0, 4)
  })

  it('parses percentage lightness', () => {
    expect(relativeLuminance('oklch(100% 0 0)')).toBeCloseTo(1, 2)
  })

  it('parses oklab(), which Chrome returns for relative-colour results', () => {
    // oklch(0.5 0 250) and its oklab() serialisation must agree.
    const viaLch = relativeLuminance('oklch(0.5 0 250)')
    const viaLab = relativeLuminance('oklab(0.5 0 0)')
    expect(viaLab).toBeCloseTo(viaLch, 3)
  })

  it('returns null rather than a wrong number for unresolved var() chains', () => {
    expect(toLinearRGB('var(--lucet-surface-ground)')).toBeNull()
    expect(contrastRatio('var(--x)', 'rgb(0,0,0)')).toBeNull()
  })
})

describe('contrast ratio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('rgb(0,0,0)', 'rgb(255,255,255)')).toBe(21)
  })

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('rgb(120,120,120)', 'rgb(120,120,120)')).toBe(1)
  })

  it('is symmetric', () => {
    const a = contrastRatio('oklch(0.5 0 250)', 'oklch(1 0 0)')
    const b = contrastRatio('oklch(1 0 0)', 'oklch(0.5 0 250)')
    expect(a).toBe(b)
  })

  it('agrees with a known WCAG pair', () => {
    // #767676 on white is the canonical 4.54:1 boundary case.
    expect(contrastRatio('rgb(118,118,118)', 'rgb(255,255,255)')).toBeCloseTo(4.54, 1)
  })
})

describe('alpha compositing', () => {
  it('parses alpha from every colour syntax', () => {
    expect(toSRGBA('rgba(255, 255, 255, 0.5)').a).toBe(0.5)
    expect(toSRGBA('oklch(0.42 0.006 264 / 0.4)').a).toBe(0.4)
    expect(toSRGBA('oklab(0.9 0 0 / 0.08)').a).toBe(0.08)
    expect(toSRGBA('transparent').a).toBe(0)
    expect(toSRGBA('rgb(10, 20, 30)').a).toBe(1)
  })

  it('flattens a translucent veil over an opaque base', () => {
    // 8% white over black should land near rgb(20,20,20), not be read as white.
    const flat = flattenBackground(['rgba(255, 255, 255, 0.08)', 'rgb(0, 0, 0)'])
    const m = flat.match(/\d+/g).map(Number)
    expect(m[0]).toBeGreaterThan(10)
    expect(m[0]).toBeLessThan(31)
  })

  it('stops at the first opaque layer', () => {
    expect(flattenBackground(['rgb(10, 10, 10)', 'rgb(200, 200, 200)'])).toBe('rgb(10, 10, 10)')
  })

  it('composites over white when nothing is opaque, as browsers do', () => {
    const flat = flattenBackground(['rgba(0, 0, 0, 0.5)'])
    const [r, g, b] = flat.match(/[\d.]+/g).map(Number)
    expect(r).toBeCloseTo(127.5, 0)
    expect(g).toBeCloseTo(127.5, 0)
    expect(b).toBeCloseTo(127.5, 0)
  })

  it('fails loudly on an unparseable layer instead of guessing', () => {
    expect(flattenBackground(['var(--nope)', 'rgb(0, 0, 0)'])).toBeNull()
  })

  it('reports oklab lightness for translucent input composited over white', () => {
    expect(oklabLightness('rgb(0, 0, 0)')).toBeCloseTo(0, 2)
    expect(oklabLightness('rgb(255, 255, 255)')).toBeCloseTo(1, 2)
  })
})
