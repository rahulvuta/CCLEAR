import { describe, expect, it } from 'vitest'
import {
  buildApplySummariesScript,
  focusSimplifyCacheKey,
  focusSimplifyPageUrl,
  sameFocusSimplifyPage
} from '../../src/focus/simplify'

describe('Focus simplify apply-cache keys', () => {
  it('strips the hash so load URL and address-bar URL share a key', () => {
    expect(focusSimplifyPageUrl('https://example.com/wiki/Steam#History')).toBe('https://example.com/wiki/Steam')
    expect(focusSimplifyCacheKey('tab-1', 'https://example.com/wiki/Steam#History')).toBe(
      focusSimplifyCacheKey('tab-1', 'https://example.com/wiki/Steam')
    )
    expect(sameFocusSimplifyPage('https://example.com/a#x', 'https://example.com/a#y')).toBe(true)
    expect(sameFocusSimplifyPage('https://example.com/a', 'https://example.com/b')).toBe(false)
  })

  it('keeps different tabs on the same URL apart', () => {
    const url = 'https://example.com/wiki/Steam'
    expect(focusSimplifyCacheKey('a', url)).not.toBe(focusSimplifyCacheKey('b', url))
  })

  it('embeds original text so a later apply can rematch without src-ids', () => {
    const script = buildApplySummariesScript([
      {
        id: 'cclear-b-0',
        summary: 'Steam engines turn heat into motion.',
        original: 'A steam engine is a device that turns heat into mechanical motion.',
        tagName: 'p'
      }
    ])
    expect(script).toContain('findByOriginal')
    expect(script).toContain('A steam engine is a device that turns heat into mechanical motion.')
    expect(script).toContain('cclear-b-0')
  })
})
