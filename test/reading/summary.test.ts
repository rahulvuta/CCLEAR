import { describe, expect, it } from 'vitest'
import { dropsNumericDetails } from '../../src/focus/heuristicSimplify'
import { fallbackSummary, validateSummary } from '../../src/reading/summary'

const source = 'The first steam engine was built in 1712 by Newcomen. It pumped water out of mines and burned a lot of coal.\nWatt improved the design in 1769 with a separate condenser that saved fuel.'

describe('reader summary validation', () => {
  it('accepts a faithful summary', () => {
    const r = validateSummary({ tldr: 'Newcomen built the first steam engine in 1712 to pump mines.', points: ['Watt improved it in 1769 with a condenser.'] }, source, dropsNumericDetails)
    expect(r?.fromModel).toBe(true)
    expect(r?.points).toHaveLength(1)
  })
  it('rejects invented numbers', () => {
    expect(validateSummary({ tldr: 'Newcomen built the first steam engine in 1802 to pump mines.', points: [] }, source, dropsNumericDetails)).toBeNull()
  })
  it('drops only the points that invent numbers', () => {
    const r = validateSummary({ tldr: 'Steam engines pumped water out of mines early on.', points: ['Watt improved it in 1769 with a condenser.', 'It saved 40 percent of fuel overall.'] }, source, dropsNumericDetails)
    expect(r?.points).toEqual(['Watt improved it in 1769 with a condenser.'])
  })
  it('falls back to lead sentences without a model', () => {
    const f = fallbackSummary(source + '\nThis is another long paragraph that mentions factories and workers across Britain in detail.')
    expect(f.fromModel).toBe(false)
    expect(f.tldr).toContain('Newcomen')
  })
})
