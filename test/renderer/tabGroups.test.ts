import { describe, expect, it } from 'vitest'
import { cleanGroupName, loadGroupMap, moveBeforeTab, moveIntoGroup, nextGroupName } from '../../src/renderer/tabGroups'

const tabs = [
  { id: 'a', group: 'Research' },
  { id: 'b', group: undefined },
  { id: 'c', group: 'Research' },
  { id: 'd', group: undefined }
]

describe('tab groups', () => {
  it('moves a tab beside the destination group and keeps the original array untouched', () => {
    const moved = moveIntoGroup(tabs, 'd', 'Research')
    expect(moved.map((tab) => tab.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(moved[3].group).toBe('Research')
    expect(tabs[3].group).toBeUndefined()
  })

  it('inherits a target tab’s group when dragged before it', () => {
    const moved = moveBeforeTab(tabs, 'd', 'c')
    expect(moved.map((tab) => tab.id)).toEqual(['a', 'b', 'd', 'c'])
    expect(moved[2].group).toBe('Research')
  })

  it('does not duplicate a name and ignores damaged saved metadata', () => {
    expect(nextGroupName(['Group 1', 'group 2'])).toBe('Group 3')
    expect(cleanGroupName('  Study   notes  ')).toBe('Study notes')
    expect(loadGroupMap('{"Study":{"color":"teal","collapsed":true},"Bad":{"color":"orange","collapsed":false}}'))
      .toEqual({ Study: { color: 'teal', collapsed: true } })
  })
})
