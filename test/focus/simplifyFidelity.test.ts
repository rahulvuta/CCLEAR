import { describe, expect, it } from 'vitest'
import {
  isProseBlock,
  selectBlocksForSimplify,
  shouldSkipChromeText
} from '../../src/focus/blockFilters'
import {
  clipAtBoundary,
  dropsNegation,
  dropsNumericDetails,
  finalizeModelSimplify,
  heuristicSummarizeParagraph,
  introducesForeignMetadata,
  isCompleteSummary,
  isFaithfulSummary
} from '../../src/focus/heuristicSimplify'
import { emphasizedSummary, highlightedSummary, buildReplacementInnerHtml } from '../../src/focus/simplifyApplyHtml'

const SERP_CITE =
  'National Environmental Satellite, Data, and Information Service (.gov) https://www.nesdis.noaa.gov › about › atmosphere › wh...'

describe('chrome / SERP filters', () => {
  it('skips cite+URL+breadcrumb lines instead of treating them as article text', () => {
    expect(shouldSkipChromeText(SERP_CITE)).toBe(true)
    expect(isProseBlock(SERP_CITE)).toBe(false)
    const kept = selectBlocksForSimplify(
      [{ text: SERP_CITE, tagName: 'span', id: 'a', outerHtmlLength: 10 }],
      10
    )
    expect(kept).toEqual([])
  })

  it('keeps real snippet prose', () => {
    const prose =
      'NOAA satellites watch the atmosphere so forecasters can warn people before a storm hits the coast.'
    expect(shouldSkipChromeText(prose)).toBe(false)
    expect(isProseBlock(prose)).toBe(true)
  })
})

describe('heuristic does not invent metadata', () => {
  it('does not prepend a year that is not in the passage', () => {
    const src = 'The panel reviewed the evidence and found no new risk for typical use.'
    const { summary } = heuristicSummarizeParagraph(src)
    expect(summary).not.toMatch(/\b(?:19|20)\d{2}\b/)
    expect(introducesForeignMetadata(src, summary)).toBe(false)
  })

  it('rejects a model year that only appeared in a byline, not the passage', () => {
    const passage = 'The panel reviewed the evidence and found no new risk for typical use.'
    const out = finalizeModelSimplify('In 2019 the panel found no new risk.', [], [], passage)
    expect(out.summary).not.toMatch(/\b2019\b/)
    expect(introducesForeignMetadata(passage, out.summary)).toBe(false)
  })

  it('ranks a real sentence above a longer URL-shaped cite', () => {
    const snippet =
      'Satellites watch the atmosphere so forecasters can warn people before a storm hits the coast.'
    const kept = selectBlocksForSimplify(
      [
        { text: SERP_CITE, tagName: 'span', id: 'cite', outerHtmlLength: 400 },
        { text: snippet, tagName: 'p', id: 'snip', outerHtmlLength: 90 }
      ],
      2
    )
    expect(kept.map((b) => b.id)).toEqual(['snip'])
  })

  it('does not rewrite SERP chrome into a URL-stuffed summary', () => {
    const { summary } = heuristicSummarizeParagraph(SERP_CITE)
    expect(selectBlocksForSimplify([{ text: SERP_CITE, tagName: 'span', id: 'x', outerHtmlLength: 1 }], 5)).toHaveLength(
      0
    )
    expect(shouldSkipChromeText(summary) || shouldSkipChromeText(SERP_CITE)).toBe(true)
  })
})

describe('emphasis split', () => {
  it('does not wrap a single word in a highlight mark', () => {
    const html = highlightedSummary('National Environmental Information Service', ['Environmental'])
    expect(html).not.toContain('<mark')
    expect(html).toContain('Environmental')
  })

  it('can highlight a three-word claim', () => {
    const html = highlightedSummary('The trial does not cause harm in mice.', ['does not cause'])
    expect(html).toContain('<mark class="cclear-highlight">does not cause</mark>')
  })

  it('uses strong for a single terminology word, not mark', () => {
    const html = emphasizedSummary('The enzyme CRISPR cuts DNA.', [], ['CRISPR'])
    expect(html).toContain('<strong class="cclear-term">CRISPR</strong>')
    expect(html).not.toContain('<mark')
  })
})

describe('keeps why / mechanism, not only sentence one', () => {
  const sky =
    "Sunlight reaches Earth's atmosphere and is scattered in all directions by all the gases and particles in the air. Blue light is scattered in all directions by the tiny molecules of air in Earth's atmosphere. Blue is scattered more than other colors because it travels as shorter, smaller waves. This is why we see a blue sky most of the time."

  it('does not drop the reason the sky looks blue', () => {
    const { summary, highlightPhrases } = heuristicSummarizeParagraph(sky)
    expect(summary.toLowerCase()).toMatch(/because|why/)
    expect(summary.toLowerCase()).toMatch(/blue/)
    expect(summary).not.toBe(
      "Sunlight reaches Earth's atmosphere and is scattered in all directions by all the gases and particles in the air."
    )
    expect(highlightPhrases.some((p) => /because|why|more than/i.test(p))).toBe(true)
  })

  it('rejects a first-sentence-only model rewrite that drops because', () => {
    const first =
      "Sunlight reaches Earth's atmosphere and is scattered in all directions by all the gases and particles in the air."
    const out = finalizeModelSimplify(first, [], [], sky)
    expect(out.summary.toLowerCase()).toMatch(/because|why/)
  })

  it('highlights a why-phrase, not a leftover single word', () => {
    const { summary, highlightPhrases } = heuristicSummarizeParagraph(sky)
    const html = highlightedSummary(summary, highlightPhrases)
    expect(html).toContain('<mark class="cclear-highlight">')
    expect(html).not.toMatch(/<mark class="cclear-highlight">Sunlight<\/mark>/)
  })
})

describe('wiki etymology does not glitch', () => {
  const etymology =
    'The English word car is believed to originate from Latin carrus/carrum \'wheeled vehicle\' or (via Old North French) Middle English carre \'two-wheeled cart\', both of which in turn derive from Gaulish karros \'chariot\'.[16][17] It originally referred to any wheeled horse-drawn vehicle.[18]'

  it('does not end mid-phrase with an ellipsis or keep cite markers', () => {
    const { summary, highlightPhrases } = heuristicSummarizeParagraph(etymology)
    expect(summary).not.toMatch(/…|\.\.\./)
    expect(summary).not.toMatch(/\[\d+\]/)
    expect(summary.toLowerCase()).toMatch(/car/)
    for (const p of highlightPhrases) {
      expect(p).not.toMatch(/via Old$/i)
      expect(p).not.toMatch(/\bor$/i)
      expect(p.toLowerCase()).not.toBe('the english word car is believed to originate')
    }
  })

  it('does not emit overlapping leftover windows as highlights', () => {
    const { highlightPhrases } = heuristicSummarizeParagraph(
      '"Motor car", attested from 1895, is the usual formal term in British English.[2] "Autocar", a variant likewise attested from 1895, is now considered archaic.[20]'
    )
    expect(highlightPhrases.some((p) => /car", attested/.test(p))).toBe(false)
    expect(highlightPhrases.some((p) => /the usual$/i.test(p))).toBe(false)
  })
})

describe('apply html', () => {
  it('does not duplicate highlights in a Look for list', () => {
    const html = buildReplacementInnerHtml(
      {
        summary: 'Blue is scattered more because it travels as shorter waves.',
        highlightPhrases: ['because it travels as shorter waves'],
        termEmphasis: []
      },
      'original'
    )
    expect(html.toLowerCase()).not.toContain('look for')
    expect(html.toLowerCase()).not.toContain('show original')
    expect(html).toContain('cclear-highlight')
  })
})

describe('inline emphasis on science copy', () => {
  const prism =
    'When white light shines through a prism, the light is separated into all its colors. A prism is a specially shaped crystal. If you visited the gift shop you learned that France sells souvenirs of the exhibit.'

  it('highlights the outcome and bolds the defined term', () => {
    const { highlightPhrases, termEmphasis, summary } = heuristicSummarizeParagraph(prism)
    expect(summary.toLowerCase()).not.toMatch(/gift shop/)
    expect(highlightPhrases.some((p) => /separated into|all its colors/i.test(p))).toBe(true)
    expect(highlightPhrases.some((p) => /^white light$/i.test(p))).toBe(false)
    expect(termEmphasis.some((t) => /^prism$/i.test(t))).toBe(true)
    expect(termEmphasis.some((t) => /^france$/i.test(t))).toBe(false)
  })
})

describe('cuts filler and does not bold place names', () => {
  const aside =
    'If you visited The Land of the Magic Windows, you learned that the light you see is just one tiny bit of all the kinds of light energy beaming around the universe. Blue is scattered more than other colors because it travels as shorter waves. France is often named in travel asides that add nothing to the claim.'

  it('drops the aside and keeps the because', () => {
    const { summary } = heuristicSummarizeParagraph(aside)
    const srcN = aside.trim().split(/\s+/).length
    const outN = summary.trim().split(/\s+/).length
    expect(outN).toBeLessThan(srcN)
    expect(outN / srcN).toBeLessThanOrEqual(0.75)
    expect(summary.toLowerCase()).toMatch(/because/)
    expect(summary.toLowerCase()).not.toMatch(/magic windows/)
  })

  it('bolds a defined term and not a country name', () => {
    const src =
      'A prism is a specially shaped crystal. White light is separated into all its colors because a prism bends each wavelength differently. France is named only as a travel aside.'
    const { termEmphasis, highlightPhrases, summary } = heuristicSummarizeParagraph(src)
    expect(summary.toLowerCase()).not.toMatch(/\bfrance\b/)
    expect(termEmphasis.some((t) => /^prism$/i.test(t))).toBe(true)
    expect(termEmphasis.some((t) => /^france$/i.test(t))).toBe(false)
    expect(highlightPhrases.some((p) => /because|separated into|shorter than/i.test(p))).toBe(true)
  })
})

describe('negation / intent', () => {
  it('does not let a summary drop negation from the source', () => {
    const source = 'The drug does not cause cancer in humans according to the review.'
    expect(dropsNegation(source, 'The drug causes cancer in humans.')).toBe(true)
    const out = finalizeModelSimplify('The drug causes cancer in humans.', [], [], source)
    expect(dropsNegation(source, out.summary)).toBe(false)
    expect(out.summary.toLowerCase()).toMatch(/\bnot\b|\bno\b/)
  })
})

describe('complete, meaning-preserving sentences', () => {
  const powertrains =
    'From traditional gas engines to hybrid and electric powertrains, each type operates differently, with its own strengths, challenges, and design characteristics.'
  const career =
    "If you’re the kind of person who loves knowing what makes machines tick, or you’re thinking about a career in automotive technology, understanding different types of engines in cars is essential."
  const basics =
    'Before diving into the different car engine types, it helps to understand the basics of how an engine actually works.'

  it('never enforces a word limit by returning the first N words of a sentence', () => {
    expect(clipAtBoundary(powertrains, 10)).toBe(powertrains)
  })

  it('rejects the clipped fragments seen in focus mode', () => {
    expect(isCompleteSummary('From traditional gas engines to hybrid and electric powertrains')).toBe(false)
    expect(
      isCompleteSummary("If you’re the kind of person who loves knowing what makes machines tick, or you’re.")
    ).toBe(false)
    expect(isCompleteSummary('Before diving into the different car engine types.')).toBe(false)

    expect(finalizeModelSimplify('From traditional gas engines to hybrid and electric powertrains', [], [], powertrains).summary).toBe(powertrains)
    expect(finalizeModelSimplify("If you’re the kind of person who loves knowing what makes machines tick, or you’re", [], [], career).summary).toBe(career)
    expect(finalizeModelSimplify('Before diving into the different car engine types', [], [], basics).summary).toBe(basics)
  })

  it('rejects summaries that reverse the source roles using only source words', () => {
    expect(isFaithfulSummary('Dogs chase cats. Birds watch quietly.', 'Cats chase dogs.')).toBe(false)
  })

  it('does not drop explicit quantities from a multi-sentence claim', () => {
    const source = 'The trial included 120 adults. The treatment reduced symptoms.'
    const summary = 'The treatment reduced symptoms.'
    expect(dropsNumericDetails(source, summary)).toBe(true)
    expect(isFaithfulSummary(source, summary)).toBe(false)
  })

  it('rejects a complete sentence that preserves too little of a paragraph', () => {
    const source =
      'Most vehicles still use internal combustion engines (ICE). These engines burn fuel and air inside cylinders to create controlled explosions that push pistons up and down. That motion turns the crankshaft, which ultimately spins the wheels.'
    const out = finalizeModelSimplify(
      'Most vehicles still use internal combustion engines (ICE).',
      [],
      [],
      source
    )
    expect(out.summary).not.toBe('Most vehicles still use internal combustion engines (ICE).')
    expect(isFaithfulSummary(source, out.summary)).toBe(true)
  })
})
