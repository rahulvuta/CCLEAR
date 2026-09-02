import { describe, expect, it } from 'vitest'
import { shouldBlock, siteOf } from '../../src/blocker/match'

const page = 'https://news.example.com/story'

describe('shouldBlock', () => {
  it('blocks third-party ad and tracker requests', () => {
    expect(shouldBlock({ url: 'https://securepubads.g.doubleclick.net/x.js', pageUrl: page, resourceType: 'script' })).toBe(true)
    expect(shouldBlock({ url: 'https://cdn.taboola.com/a.js', pageUrl: page, resourceType: 'script' })).toBe(true)
  })
  it('never blocks page navigations or ordinary resources', () => {
    expect(shouldBlock({ url: 'https://doubleclick.net/', pageUrl: page, resourceType: 'mainFrame' })).toBe(false)
    expect(shouldBlock({ url: 'https://cdn.jsdelivr.net/npm/x.js', pageUrl: page, resourceType: 'script' })).toBe(false)
    expect(shouldBlock({ url: 'https://fonts.gstatic.com/f.woff2', pageUrl: page, resourceType: 'font' })).toBe(false)
  })
  it('does not block a site its own first-party requests', () => {
    expect(shouldBlock({ url: 'https://static.criteo.com/a.js', pageUrl: 'https://www.criteo.com/about', resourceType: 'script' })).toBe(false)
  })
  it('honours the per-site allow list', () => {
    const req = { url: 'https://cdn.taboola.com/a.js', pageUrl: page, resourceType: 'script' }
    expect(shouldBlock(req, ['example.com'])).toBe(false)
    expect(shouldBlock(req, ['other.org'])).toBe(true)
  })
  it('does not match lookalike hosts', () => {
    expect(shouldBlock({ url: 'https://notdoubleclick.net/x', pageUrl: page, resourceType: 'script' })).toBe(false)
  })
})

describe('siteOf', () => {
  it('handles country second-level domains', () => {
    expect(siteOf('www.bbc.co.uk')).toBe('www.bbc.co.uk'.split('.').slice(-3).join('.'))
    expect(siteOf('a.b.example.com')).toBe('example.com')
  })
})
