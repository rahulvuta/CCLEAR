import { describe, expect, it } from 'vitest'
import { buildRecap } from '../../src/session/recap'

const session = (done: number, total: number) => ({
  id: 's', goal: 'Bio lab', startedAt: 0, allowedHosts: [],
  steps: Array.from({ length: total }, (_, i) => ({ id: `${i}`, text: `step ${i}`, done: i < done }))
})

describe('buildRecap', () => {
  it('celebrates completion without streak language', () => {
    const r = buildRecap({ session: session(3, 3), now: 25 * 60000, onSeconds: 1200, offSeconds: 300, nudges: 1, parkedDuring: 0 })
    expect(r.headline).toBe('You finished every step. Nice work.')
    expect(r.minutes).toBe(25)
    expect(r.onTaskPct).toBe(80)
  })
  it('stays kind when little was done', () => {
    expect(buildRecap({ session: session(0, 4), now: 60000, onSeconds: 0, offSeconds: 0, nudges: 0, parkedDuring: 2 }).headline).toMatch(/set aside distractions/)
    expect(buildRecap({ session: session(0, 0), now: 60000, onSeconds: 0, offSeconds: 0, nudges: 0, parkedDuring: 0 }).headline).toMatch(/focused time/)
  })
  it('hides the on-task percentage until there is enough data', () => {
    expect(buildRecap({ session: session(1, 2), now: 60000, onSeconds: 20, offSeconds: 10, nudges: 0, parkedDuring: 0 }).onTaskPct).toBeNull()
  })
  it('reports partial step progress', () => {
    expect(buildRecap({ session: session(1, 4), now: 120000, onSeconds: 100, offSeconds: 20, nudges: 0, parkedDuring: 0 }).headline).toBe('You completed 1 of 4 steps. That is real progress.')
  })
})
