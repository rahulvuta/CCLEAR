import { describe, expect, it } from 'vitest'
import { buildTabsPrompt, looksLikeTabsQuestion, parseTabsAnswer, pickExcerpts } from '../../src/ai/askTabs'

const text = 'The Liverpool and Manchester Railway opened in 1830 and carried passengers on a timetable. Cotton mills grew along the rivers of Lancashire. Ticket prices were set by the company and varied by class of carriage.'

describe('multi-tab questions', () => {
  it('detects them', () => {
    expect(looksLikeTabsQuestion('which tab mentions ticket prices?')).toBe(true)
    expect(looksLikeTabsQuestion('/tabs compare these')).toBe(true)
    expect(looksLikeTabsQuestion('what is a condenser?')).toBe(false)
  })
  it('picks the sentences that match the question', () => {
    expect(pickExcerpts('ticket prices', text, 1)[0]).toMatch(/Ticket prices/)
  })
  it('falls back to opening sentences when nothing matches', () => {
    expect(pickExcerpts('compare these', text, 2)[0]).toMatch(/Liverpool/)
  })
  it('numbers tabs in the prompt and keeps page text inside a data block', () => {
    const p = buildTabsPrompt('q', [{ id: 'a', title: 'Rail', url: 'https://x.org', text, excerpts: ['A fact.'] }])
    expect(p).toContain('[1] Rail')
    expect(p.indexOf('<<<TABS')).toBeLessThan(p.indexOf('A fact.'))
  })
  it('drops invalid source numbers', () => {
    expect(parseTabsAnswer('{"answer":"It is in tab 2.","sources":[2,9,"x"]}', 3)).toEqual({ answer: 'It is in tab 2.', sources: [2] })
    expect(parseTabsAnswer('nope', 3)).toBeNull()
  })
})
