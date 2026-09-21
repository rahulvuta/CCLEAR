import { describe, expect, it } from 'vitest'
import { isLocalHost, summarize } from '../../src/shared/ledger'

describe('privacy ledger', () => {
  it('recognises local hosts', () => {
    expect(isLocalHost('127.0.0.1:11434')).toBe(true)
    expect(isLocalHost('localhost:11434')).toBe(true)
    expect(isLocalHost('en.wikipedia.org')).toBe(false)
  })
  it('groups by host, flags local vs internet, and lists newest first', () => {
    const entries = [
      { at: 1, host: '127.0.0.1:11434', path: '/api/generate', ok: true },
      { at: 2, host: '127.0.0.1:11434', path: '/api/embed', ok: true },
      { at: 3, host: 'api.open-meteo.com', path: '/v1/forecast', ok: true }
    ]
    const s = summarize(entries, 0)
    expect(s.total).toBe(3)
    expect(s.hosts[0]).toEqual({ host: '127.0.0.1:11434', count: 2, local: true })
    expect(s.hosts[1].local).toBe(false)
    expect(s.recent[0].at).toBe(3)
  })
})
