import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ContextMenu, type ContextMenuEntry } from './ContextMenu'

export type UITab = {
  id: string
  title: string
  url: string
  group?: string
  favicon?: string
  pinned?: boolean
  muted?: boolean
}

type Props = {
  tabs: UITab[]
  activeId: string
  setActiveId: Dispatch<SetStateAction<string>>
  onClose: (id: string) => void
  onNewTab: () => void
  onNewTabRight: (id: string) => void
  onDuplicate: (id: string) => void
  onTogglePin: (id: string) => void
  onToggleMute: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseToRight: (id: string) => void
  onCopyUrl: (id: string) => void
  onReopenClosed: () => void
}

export function TabStrip({
  tabs,
  activeId,
  setActiveId,
  onClose,
  onNewTab,
  onNewTabRight,
  onDuplicate,
  onTogglePin,
  onToggleMute,
  onCloseOthers,
  onCloseToRight,
  onCopyUrl,
  onReopenClosed
}: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  const pinned = tabs.filter((t) => t.pinned)
  const rest = tabs.filter((t) => !t.pinned)

  function groupsFor(list: UITab[]) {
    const groupedTabs: { group: string; tabs: UITab[] }[] = []
    let currentGroup = ''
    let currentGroupTabs: UITab[] = []
    list.forEach((t) => {
      const g = t.group || ''
      if (g !== currentGroup) {
        if (currentGroupTabs.length > 0) {
          groupedTabs.push({ group: currentGroup, tabs: currentGroupTabs })
        }
        currentGroup = g
        currentGroupTabs = [t]
      } else {
        currentGroupTabs.push(t)
      }
    })
    if (currentGroupTabs.length > 0) {
      groupedTabs.push({ group: currentGroup, tabs: currentGroupTabs })
    }
    return groupedTabs
  }

  function itemsFor(id: string): ContextMenuEntry[] {
    const tab = tabs.find((t) => t.id === id)
    if (!tab) return []
    return [
      { type: 'item', label: 'New tab to the right', action: () => onNewTabRight(id) },
      { type: 'item', label: 'Duplicate', action: () => onDuplicate(id) },
      { type: 'item', label: tab.pinned ? 'Unpin' : 'Pin', action: () => onTogglePin(id) },
      { type: 'item', label: tab.muted ? 'Unmute' : 'Mute', action: () => onToggleMute(id) },
      { type: 'separator' },
      { type: 'item', label: 'Copy URL', action: () => onCopyUrl(id) },
      { type: 'separator' },
      { type: 'item', label: 'Close', action: () => onClose(id) },
      { type: 'item', label: 'Close others', action: () => onCloseOthers(id) },
      { type: 'item', label: 'Close to the right', action: () => onCloseToRight(id) },
      { type: 'separator' },
      { type: 'item', label: 'Reopen closed tab', action: onReopenClosed }
    ]
  }

  function renderTab(tab: UITab) {
    const label = tab.title || (tab.url === 'about:blank' ? 'New tab' : tab.url) || 'New tab'
    return (
      <div
        key={tab.id}
        className={`tab${tab.pinned ? ' tabPinned' : ''}`}
        role="tab"
        data-active={tab.id === activeId ? 'true' : 'false'}
        aria-selected={tab.id === activeId}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, id: tab.id })
        }}
      >
        <button type="button" className="tabTitle" title={tab.url} onClick={() => setActiveId(tab.id)}>
          {tab.favicon && <img src={tab.favicon} className="tabFavicon" alt="" />}
          {!tab.pinned && <span className="tabTitleText">{label}</span>}
          {tab.muted && <span className="tabMuted" title="Muted" aria-label="Muted">M</span>}
        </button>
        {!tab.pinned && (
          <button
            type="button"
            className="tabClose"
            aria-label="Close tab"
            title="Close"
            onClick={(e) => {
              e.stopPropagation()
              onClose(tab.id)
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="tabStripOuter titleBarDrag">
      <div className="tabStrip">
        {pinned.length > 0 && <div className="tabGroup">{pinned.map(renderTab)}</div>}
        {groupsFor(rest).map((g, idx) => (
          <div key={`g-${idx}`} className="tabGroupContainer">
            {g.group && <div className="tabGroupLabel">{g.group}</div>}
            <div className={`tabGroup ${g.group ? 'hasGroup' : ''}`}>
              {g.tabs.map(renderTab)}
            </div>
          </div>
        ))}
        <button type="button" className="tabNewBtn" title="New tab" onClick={onNewTab}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={itemsFor(menu.id)} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}
