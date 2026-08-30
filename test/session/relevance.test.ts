import { describe, expect, it } from 'vitest'
import { keywords, scoreRelevance } from '../../src/session/relevance'

const goal = { goal: 'Write my APUSH essay on the Industrial Revolution' }

describe('keywords', () => {
  it('drops filler and keeps topic words', () => {
    expect(keywords(goal.goal)).toEqual(expect.arrayContaining(['apush', 'industrial', 'revolution']))
    expect(keywords(goal.goal)).not.toContain('essay')
  })
})

describe('scoreRelevance', () => {
  it('marks matching pages on-goal', () => {
    const r = scoreRelevance(goal, { url: 'https://en.wikipedia.org/wiki/Industrial_Revolution', title: 'Industrial Revolution - Wikipedia' })
    expect(r.verdict).toBe('on')
  })
  it('flags a distracting site with no overlap as off', () => {
    const r = scoreRelevance(goal, { url: 'https://www.youtube.com/watch?v=abc', title: 'Minecraft speedrun world record' })
    expect(r.verdict).toBe('off')
  })
  it('does not flag a distracting site whose page matches the goal', () => {
    const r = scoreRelevance(goal, { url: 'https://www.youtube.com/watch?v=abc', title: 'The Industrial Revolution explained in 10 minutes' })
    expect(r.verdict).toBe('on')
  })
  it('never calls an unknown non-distracting page off (stays unsure)', () => {
    const r = scoreRelevance(goal, { url: 'https://example.org/recipes/pasta', title: 'Easy pasta' })
    expect(r.verdict).toBe('unsure')
  })
  it('uses the search query on result pages', () => {
    const r = scoreRelevance(goal, { url: 'https://www.google.com/search?q=steam+engine+industrial+revolution', title: 'Google Search' })
    expect(r.verdict).toBe('on')
  })
  it('trusts hosts the user allowed', () => {
    const r = scoreRelevance({ ...goal, allowedHosts: ['reddit.com'] }, { url: 'https://www.reddit.com/r/history', title: 'history' })
    expect(r.verdict).toBe('on')
  })
  it('treats study tools as on-task', () => {
    expect(scoreRelevance(goal, { url: 'https://docs.google.com/document/d/1', title: 'Untitled document' }).verdict).toBe('on')
  })
})
