import { describe, expect, it } from 'vitest'
import {
  buildPageMarkQuery,
  detectPageActionIntent,
  pageActionTerms,
  parsePageActionTags,
  scoreMarkSentence
} from '../../src/ai/pageActions'

describe('page mark intents', () => {
  it('underlines explanation passages', () => {
    const intent = detectPageActionIntent('underline everything that shows why the sky is blue')
    expect(intent.kind).toBe('underline')
    if (intent.kind === 'none' || intent.kind === 'clear') throw new Error('expected underline')
    expect(intent.terms).toEqual(expect.arrayContaining(['sky', 'blue']))
  })

  it('scrolls to a mentioned topic', () => {
    const intent = detectPageActionIntent('scroll to the part where it talks about the waves of light')
    expect(intent.kind).toBe('scroll')
    if (intent.kind === 'none' || intent.kind === 'clear') throw new Error('expected scroll')
    expect(intent.terms).toEqual(expect.arrayContaining(['waves']))
  })

  it('does not treat go-to-wikipedia as a page mark', () => {
    expect(detectPageActionIntent('go to wikipedia').kind).toBe('none')
  })

  it('parses backup tags from the model', () => {
    const intent = parsePageActionTags('On it.\n[HIGHLIGHT: Rayleigh scattering]')
    expect(intent.kind).toBe('highlight')
    if (intent.kind === 'none' || intent.kind === 'clear') throw new Error('expected highlight')
    expect(intent.terms).toContain('rayleigh')
  })

  it('drops filler words from terms', () => {
    expect(pageActionTerms('the part where it talks about waves of light')).toEqual(
      expect.arrayContaining(['waves'])
    )
  })
})

describe('sentence scoring for chat highlights', () => {
  const madeOf = buildPageMarkQuery('what the sun is made of')

  it('keeps composition phrases for made-of questions', () => {
    expect(madeOf.phrases).toEqual(expect.arrayContaining(['made of', 'composed of']))
  })

  it('scores composition sentences and skips generic sun sentences', () => {
    const generic = scoreMarkSentence(
      'The Sun is the star located at the centre of the Solar System.',
      madeOf
    )
    const composition = scoreMarkSentence(
      'The Sun is composed primarily of the elements hydrogen and helium.',
      madeOf
    )
    expect(generic).toBe(0)
    expect(composition).toBeGreaterThan(40)
  })

  it('requires both sky and blue in the same sentence', () => {
    const q = buildPageMarkQuery('why the sky is blue')
    expect(
      scoreMarkSentence('The sky appears blue because air scatters shorter wavelengths.', q)
    ).toBeGreaterThan(0)
    expect(scoreMarkSentence('The sky is a common sight during the day.', q)).toBe(0)
  })
})
