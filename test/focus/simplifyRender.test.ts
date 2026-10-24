import { describe, expect, it } from 'vitest'
import { buildReplacementInnerHtml, splitForDisplay } from '../../src/focus/simplifyApplyHtml'

describe('simplified paragraph rendering', () => {
  it('keeps multiple sentences in a readable paragraph', () => {
    const html = buildReplacementInnerHtml({ summary: 'Watt added a condenser in 1769. It saved fuel. Factories could use steam.' }, '')
    expect(html).toContain('cclear-summary-text')
    expect(html).toContain('1769. It saved fuel. Factories')
    expect(html).not.toContain('cclear-sent')
  })
  it('keeps a single sentence inline', () => {
    const html = buildReplacementInnerHtml({ summary: 'Steam engines turn heat into motion.' }, '')
    expect(html).not.toContain('cclear-sent')
  })
  it('does not split inside abbreviations', () => {
    expect(splitForDisplay('Dr. Smith moved to the U.S. in 1990. He taught there.')).toHaveLength(2)
  })
  it('escapes HTML in summaries', () => {
    expect(buildReplacementInnerHtml({ summary: 'A <b>bold</b> claim. Another one.' }, '')).not.toContain('<b>')
  })
})
