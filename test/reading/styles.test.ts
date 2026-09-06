import { describe, expect, it } from 'vitest'
import { DEFAULT_READING, clampReading } from '../../src/shared/reading'
import { buildReadingCss, getApplyReadingScript } from '../../src/reading/styles'

describe('reading prefs', () => {
  it('clamps out-of-range and invalid values', () => {
    const p = clampReading({ size: 9999, lineHeight: -4, font: 'wingdings' as never, tint: 'neon' as never })
    expect(p.size).toBe(180)
    expect(p.lineHeight).toBe(1.3)
    expect(p.font).toBe('site')
    expect(p.tint).toBe('none')
  })
})

describe('reading css', () => {
  it('emits nothing when disabled', () => {
    expect(buildReadingCss({ ...DEFAULT_READING, enabled: false })).toBe('')
  })
  it('applies font, spacing, width and tint when enabled', () => {
    const css = buildReadingCss({ ...DEFAULT_READING, enabled: true, font: 'serif', tint: 'sepia', dim: true })
    expect(css).toContain('Georgia')
    expect(css).toContain('68ch')
    expect(css).toContain('#f4ecd8')
    expect(css).toContain('cclear-dim')
  })
  it('produces a script that is valid JavaScript', () => {
    const src = getApplyReadingScript({ ...DEFAULT_READING, enabled: true, ruler: true })
    expect(() => new Function(src)).not.toThrow()
  })
})
