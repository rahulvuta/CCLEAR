import { describe, expect, it } from 'vitest'
import { dropsNumericDetails } from '../../src/focus/heuristicSimplify'
import { hasEvidence, looksLikePageQuestion, parseAsk, rankPassages } from '../../src/ai/askPage'

const passages = [
  { id: 'p0', text: 'The Industrial Revolution began in Britain in the late 18th century.', context: 'Origins' },
  { id: 'p1', text: 'James Watt patented a steam engine with a separate condenser in 1769.', context: 'Steam power' },
  { id: 'p2', text: 'Cotton mills in Lancashire employed thousands of children.', context: 'Labor' },
  { id: 'p3', text: 'Subscribe to our newsletter for weekly updates and offers.', context: '' }
]

describe('rankPassages', () => {
  it('finds the passage that answers the question', () => {
    const r = rankPassages('When did Watt patent his steam engine?', passages)
    expect(r[0].id).toBe('p1')
    expect(r[0].n).toBe(1)
    expect(hasEvidence(r)).toBe(true)
  })
  it('reports no evidence for unrelated questions', () => {
    expect(hasEvidence(rankPassages('What is the capital of France?', passages))).toBe(false)
  })
})

describe('parseAsk', () => {
  const ranked = rankPassages('When did Watt patent his steam engine?', passages)
  it('accepts a grounded answer with valid citations', () => {
    const r = parseAsk('{"answer":"Watt patented it in 1769.","sources":[1],"found":true}', ranked, dropsNumericDetails)
    expect(r?.grounded).toBe(true)
    expect(r?.sources[0].id).toBe('p1')
  })
  it('falls back to quoting the page when the answer invents a number', () => {
    const r = parseAsk('{"answer":"Watt patented it in 1802.","sources":[1],"found":true}', ranked, dropsNumericDetails)
    expect(r?.grounded).toBe(false)
    expect(r?.sources.length).toBeGreaterThan(0)
  })
  it('ignores hallucinated source numbers and returns null when not found', () => {
    const r = parseAsk('{"answer":"Watt patented it in 1769.","sources":[99],"found":true}', ranked, dropsNumericDetails)
    expect(r?.sources[0].n).toBe(1)
    expect(parseAsk('{"answer":"The page does not say.","sources":[],"found":false}', ranked, dropsNumericDetails)).toBeNull()
  })
})

describe('looksLikePageQuestion', () => {
  it('separates questions from browser commands', () => {
    expect(looksLikePageQuestion('why did factories grow so fast?')).toBe(true)
    expect(looksLikePageQuestion('/ask who invented it')).toBe(true)
    expect(looksLikePageQuestion('go to wikipedia')).toBe(false)
    expect(looksLikePageQuestion('highlight the part about steam')).toBe(false)
  })
})
