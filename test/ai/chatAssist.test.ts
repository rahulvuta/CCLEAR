import { describe, expect, it } from 'vitest'
import {
  articleSearchPhrase,
  extractWhyParts,
  findBestArticle,
  pickWikiHit,
  type WikiHit
} from '../../src/ai/chatAssist'

const SUN_YELLOW_HITS: WikiHit[] = [
  { title: 'Half of a Yellow Sun', wordcount: 3726, snippet: 'Half of a Yellow Sun is a 2006 novel by Nigerian writer' },
  { title: 'Sun', wordcount: 19507, snippet: 'The Sun is the star located at the centre of the Solar System.' },
  { title: 'Solar eclipse', wordcount: 9938, snippet: 'A solar eclipse occurs when the Moon passes between Earth and the Sun' },
  {
    title: 'Yellow',
    wordcount: 11143,
    snippet: 'the Sun is near the horizon, due to atmospheric scattering of shorter wavelengths'
  },
  {
    title: 'Rayleigh scattering',
    wordcount: 2933,
    snippet: 'Rayleigh scattering is the scattering of light by particles much smaller than the wavelength'
  },
  { title: 'Sun conure', wordcount: 2100, snippet: 'The sun conure is a yellow parrot native to South America' }
]

const ENGINE_HITS: WikiHit[] = [
  { title: 'Formula One engines', wordcount: 11282, snippet: 'Formula One engines' },
  { title: 'AMC V8 engine', wordcount: 4000, snippet: 'The AMC V8 engine' },
  { title: 'Internal combustion engine', wordcount: 13150, snippet: 'An internal combustion engine' },
  { title: 'Car engine', wordcount: 200, snippet: 'Car engine redirects' },
  { title: 'Chrysler Hemi engine', wordcount: 7700, snippet: 'Hemi' }
]

describe('chat article picker', () => {
  it('parses why-the-sun-is-yellow into subject and color', () => {
    expect(extractWhyParts('why the sun is yellow')).toEqual({ subject: 'sun', rest: 'yellow' })
  })

  it('turns how/why questions into a general noun phrase', () => {
    expect(articleSearchPhrase('how a car engine works')).toBe('car engine')
    expect(articleSearchPhrase('why the sun is yellow')).toBe('sun')
    expect(articleSearchPhrase('a regular car engine')).toBe('car engine')
  })

  it('picks the Sun page, not Yellow or Rayleigh scattering', () => {
    const picked = pickWikiHit('why the sun is yellow', SUN_YELLOW_HITS)
    expect(picked?.hit.title).toBe('Sun')
  })

  it('picks a general engine article, not F1 or a brand V8', () => {
    const picked = pickWikiHit('how a car engine works', ENGINE_HITS)
    expect(['Car engine', 'Internal combustion engine']).toContain(picked?.hit.title)
    expect(picked?.hit.title).not.toBe('Formula One engines')
    expect(picked?.hit.title).not.toBe('AMC V8 engine')
  })

  it('live wikipedia lookup opens the general Sun article', async () => {
    const found = await findBestArticle('why the sun is yellow')
    expect(found.title).toBe('Sun')
  }, 20000)

  it('live wikipedia lookup opens a general car engine article', async () => {
    const found = await findBestArticle('how a car engine works')
    expect(found.title.toLowerCase()).not.toMatch(/formula|f1|amc/)
    expect(['Car engine', 'Internal combustion engine']).toContain(found.title)
  }, 20000)
})
