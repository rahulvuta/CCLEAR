import { describe, expect, it } from 'vitest'
import { EMPTY_SESSION_STATE } from '../../src/shared/session'
import { progressKey, reduceSession } from '../../src/session/store'

describe('session store', () => {
  it('starts a session, manages steps, and archives on end', () => {
    let n = 0
    const idGen = () => `s${n++}`
    let s = reduceSession(EMPTY_SESSION_STATE, { type: 'start', goal: '  Finish bio lab  ', id: 'a', now: 1000 })
    expect(s.current?.goal).toBe('Finish bio lab')
    s = reduceSession(s, { type: 'setSteps', steps: ['Read intro', '', 'Write results'], idGen })
    expect(s.current?.steps.map((x) => x.text)).toEqual(['Read intro', 'Write results'])
    s = reduceSession(s, { type: 'toggleStep', id: 's0' })
    s = reduceSession(s, { type: 'end', now: 5000 })
    expect(s.current).toBeNull()
    expect(s.history[0]).toMatchObject({ goal: 'Finish bio lab', stepsDone: 1, stepsTotal: 2 })
  })
  it('ignores empty goals and keeps parked items newest-first', () => {
    let s = reduceSession(EMPTY_SESSION_STATE, { type: 'start', goal: '   ', id: 'a', now: 1 })
    expect(s.current).toBeNull()
    s = reduceSession(s, { type: 'park', item: { id: '1', kind: 'thought', title: 'buy milk', createdAt: 1 } })
    s = reduceSession(s, { type: 'park', item: { id: '2', kind: 'tab', title: 'x', url: 'https://x.com', createdAt: 2 } })
    expect(s.parked.map((p) => p.id)).toEqual(['2', '1'])
    s = reduceSession(s, { type: 'unpark', id: '2' })
    expect(s.parked.map((p) => p.id)).toEqual(['1'])
  })
  it('remembers allowed hosts once, normalised', () => {
    let s = reduceSession(EMPTY_SESSION_STATE, { type: 'start', goal: 'g', id: 'a', now: 1 })
    s = reduceSession(s, { type: 'allowHost', host: 'WWW.Reddit.com' })
    s = reduceSession(s, { type: 'allowHost', host: 'reddit.com' })
    expect(s.current?.allowedHosts).toEqual(['reddit.com'])
  })
  it('hydrates partial persisted state with defaults', () => {
    const s = reduceSession(EMPTY_SESSION_STATE, { type: 'hydrate', state: { assistLevel: 'coach' } })
    expect(s.assistLevel).toBe('coach')
    expect(s.parked).toEqual([])
  })
  it('keys reading progress without the hash', () => {
    expect(progressKey('https://a.com/x#sec')).toBe('https://a.com/x')
  })
})
