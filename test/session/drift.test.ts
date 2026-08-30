import { describe, expect, it } from 'vitest'
import { DRIFT_PRESETS, driftStep, INITIAL_DRIFT, snooze } from '../../src/session/drift'

const cfg = DRIFT_PRESETS.balanced!
const off = (now: number, key = 't1|youtube.com') => ({ now, key, verdict: 'off' as const, attending: true })

function run(times: number[], key?: string) {
  let s = INITIAL_DRIFT
  const fired: number[] = []
  for (const t of times) {
    const r = driftStep(s, off(t, key), cfg)
    s = r.state
    if (r.fire) fired.push(t)
  }
  return { s, fired }
}

describe('driftStep', () => {
  it('does not fire before the dwell time', () => {
    expect(run([0, 10_000, 30_000]).fired).toEqual([])
  })
  it('fires once after sustained off-goal time', () => {
    expect(run([0, 20_000, 46_000]).fired).toEqual([46_000])
  })
  it('respects the cooldown after a nudge', () => {
    const times = Array.from({ length: 60 }, (_, i) => i * 10_000) // 10 minutes
    expect(run(times).fired.length).toBe(2)
  })
  it('resets when the user returns to an on-goal page', () => {
    let s = INITIAL_DRIFT
    s = driftStep(s, off(0), cfg).state
    s = driftStep(s, { now: 30_000, key: 't1|docs.google.com', verdict: 'on', attending: true }, cfg).state
    s = driftStep(s, off(31_000), cfg).state
    expect(driftStep(s, off(60_000), cfg).fire).toBe(false)
  })
  it('does not count time when the window is not focused', () => {
    let s = INITIAL_DRIFT
    s = driftStep(s, off(0), cfg).state
    s = driftStep(s, { ...off(40_000), attending: false }, cfg).state
    expect(driftStep(s, off(50_000), cfg).fire).toBe(false)
  })
  it('never fires when assist is off, and honours snooze', () => {
    let s = INITIAL_DRIFT
    s = driftStep(s, off(0), null).state
    expect(driftStep(s, off(500_000), null).fire).toBe(false)
    let t = driftStep(INITIAL_DRIFT, off(0), cfg).state
    t = snooze(t, 1_000, 600_000)
    t = driftStep(t, off(2_000), cfg).state
    expect(driftStep(t, off(100_000), cfg).fire).toBe(false)
  })
  it('caps nudges per hour', () => {
    const c = { dwellMs: 1000, cooldownMs: 1000, maxPerHour: 2 }
    let s = INITIAL_DRIFT
    let fired = 0
    for (let t = 0; t < 600_000; t += 2000) {
      const r = driftStep(s, off(t), c)
      s = r.state
      if (r.fire) fired++
    }
    expect(fired).toBe(2)
  })
})
