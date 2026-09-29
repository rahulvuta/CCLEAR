import { describe, expect, it } from 'vitest'
import { filterCommands, fuzzyScore, type Command } from '../../src/shared/palette'

const cmd = (id: string, title: string, extra: Partial<Command> = {}): Command => ({ id, title, group: 'Actions', run: () => {}, ...extra })

describe('fuzzyScore', () => {
  it('prefers prefix and word-start matches', () => {
    expect(fuzzyScore('park', 'Park this tab')).toBeGreaterThan(fuzzyScore('park', 'Open sparkles'))
  })
  it('matches subsequences and rejects non-matches', () => {
    expect(fuzzyScore('rdv', 'Reader view')).toBeGreaterThan(0)
    expect(fuzzyScore('xyz', 'Reader view')).toBe(0)
  })
})

describe('filterCommands', () => {
  const items = [cmd('a', 'Open reader view'), cmd('b', 'Park this tab'), cmd('c', 'Settings', { keywords: 'preferences model' }), cmd('d', 'Switch to: Wikipedia', { group: 'Tabs' })]
  it('ranks the best match first', () => {
    expect(filterCommands('park', items)[0].id).toBe('b')
  })
  it('searches keywords too', () => {
    expect(filterCommands('preferences', items).map((c) => c.id)).toContain('c')
  })
  it('returns the leading items for an empty query', () => {
    expect(filterCommands('', items, 2)).toHaveLength(2)
  })
})
