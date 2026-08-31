import { describe, expect, it } from 'vitest'
import { describeProgress, worthResuming } from '../../src/session/progress'

const p = { url: 'u', title: 't', ratio: 0.5, heading: 'Boilers', at: 0 }

describe('reading progress', () => {
  it('only offers to resume mid-page and after some time away', () => {
    expect(worthResuming(p, 120_000)).toBe(true)
    expect(worthResuming({ ...p, ratio: 0.02 }, 120_000)).toBe(false)
    expect(worthResuming({ ...p, ratio: 0.99 }, 120_000)).toBe(false)
    expect(worthResuming(p, 10_000)).toBe(false)
    expect(worthResuming(undefined, 1e9)).toBe(false)
  })
  it('describes where the user was', () => {
    expect(describeProgress(p)).toBe('You were in “Boilers” (50% through).')
    expect(describeProgress({ ...p, heading: '' })).toBe('You were 50% through this page.')
  })
})
