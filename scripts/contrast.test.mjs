import { describe, expect, it } from 'vitest'
import { contrastRatio, relativeLuminance, toLinearRGB } from './contrast.mjs'

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
