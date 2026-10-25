import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TabVerdict } from '../hooks/useDrift'
import { GROUP_COLORS, type GroupColor, type GroupMap } from '../tabGroups'

export type UITab = { id: string; title: string; url: string; src?: string; group?: string; favicon?: string }

type Props = {
  tabs: UITab[]
  activeId: string
  groups: GroupMap
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onNewTab: () => void
  onCreateGroup: (id: string) => void
  onMoveToGroup: (id: string, group: string) => void
  onRemoveFromGroup: (id: string) => void
  onMoveBefore: (id: string, beforeId: string) => void
  onToggleGroup: (group: string) => void
  onRenameGroup: (group: string, nextName: string) => void
  onColorGroup: (group: string, color: GroupColor) => void
  onUngroup: (group: string) => void
  onCloseGroup: (group: string) => void
  onAutoGroup: () => void
  groupingBusy: boolean
  verdicts?: Record<string, TabVerdict>
}

type Menu = { kind: 'tab'; id: string; x: number; y: number } | { kind: 'group'; group: string; x: number; y: number }

export function TabStrip(p: Props) {
  const [menu, setMenu] = useState<Menu | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const groupNames = [...new Set(p.tabs.map((tab) => tab.group).filter((name): name is string => Boolean(name)))]
  const runs: { group: string; tabs: UITab[] }[] = []
  for (const tab of p.tabs) {
    const group = tab.group || ''
    const last = runs[runs.length - 1]
    if (last?.group === group) last.tabs.push(tab)
    else runs.push({ group, tabs: [tab] })
  }

  const menuButton = (label: string, action: () => void, danger = false) => (
    <button type="button" role="menuitem" className={danger ? 'tabMenuDanger' : ''} onClick={() => { action(); setMenu(null) }}>{label}</button>
  )

  const popup = menu && createPortal(
    <div
      className="tabContextMenu"
      role="menu"
      aria-label={menu.kind === 'tab' ? 'Tab options' : 'Group options'}
      style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 246)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 330)) }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {menu.kind === 'tab' ? (
        <>
          {menuButton('Add tab to new group', () => p.onCreateGroup(menu.id))}
          {groupNames.length > 0 && <div className="tabMenuCaption">Move to group</div>}
          {groupNames.map((name) => (
            <button key={name} type="button" role="menuitem" onClick={() => { p.onMoveToGroup(menu.id, name); setMenu(null) }}>
              <span className="tabMenuColor" data-color={p.groups[name]?.color || 'blue'} />{name}
            </button>
          ))}
          {p.tabs.find((tab) => tab.id === menu.id)?.group && menuButton('Remove from group', () => p.onRemoveFromGroup(menu.id))}
          <div className="tabMenuRule" />
          {menuButton('Close tab', () => p.onClose(menu.id))}
        </>
      ) : (
        <>
          <div className="tabMenuCaption">Group name</div>
          <form className="tabGroupRename" onSubmit={(event) => { event.preventDefault(); p.onRenameGroup(menu.group, nameDraft); setMenu(null) }}>
            <input aria-label="Group name" maxLength={32} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
            <button type="submit" aria-label="Save group name">Save</button>
          </form>
          <div className="tabMenuCaption">Color</div>
          <div className="tabGroupColors" role="group" aria-label="Group color">
            {GROUP_COLORS.map((color) => (
              <button key={color} type="button" className="tabColorChoice" data-color={color} aria-label={color + ' group color'} aria-pressed={(p.groups[menu.group]?.color || 'blue') === color} onClick={() => p.onColorGroup(menu.group, color)} />
            ))}
          </div>
          <div className="tabMenuRule" />
          {menuButton(p.groups[menu.group]?.collapsed ? 'Expand group' : 'Collapse group', () => p.onToggleGroup(menu.group))}
          {menuButton('Ungroup tabs', () => p.onUngroup(menu.group))}
          {menuButton('Close group', () => p.onCloseGroup(menu.group), true)}
        </>
      )}
    </div>,
    document.body
  )

  return (
    <div className="tabStrip" role="tablist" aria-label="Open tabs">
      {runs.map((run, index) => {
        const collapsed = Boolean(run.group && p.groups[run.group]?.collapsed)
        const color = p.groups[run.group]?.color || 'blue'
        return (
          <div key={run.group + '-' + run.tabs[0].id + '-' + index} className="tabGroupContainer" data-color={color}>
            {run.group && (
              <div className="tabGroupHeader" data-color={color} data-active={run.tabs.some((tab) => tab.id === p.activeId)}>
                <button
                  type="button"
                  className="tabGroupLabel"
                  aria-expanded={!collapsed}
                  aria-label={run.group + ', ' + run.tabs.length + ' tabs'}
                  title={collapsed ? 'Expand group' : 'Collapse group'}
                  onClick={() => p.onToggleGroup(run.group)}
                  onContextMenu={(event) => { event.preventDefault(); setNameDraft(run.group); setMenu({ kind: 'group', group: run.group, x: event.clientX, y: event.clientY }) }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    const id = event.dataTransfer.getData('application/x-cclear-tab')
                    if (id) p.onMoveToGroup(id, run.group)
                    setDraggedId(null)
                  }}
                ><span className="tabGroupDot" />{run.group}<span className="tabGroupCount">{run.tabs.length}</span><span className="tabGroupChevron">⌄</span></button>
                <button type="button" className="tabGroupMore" aria-label={'Edit ' + run.group + ' group'} onClick={(event) => { const r = event.currentTarget.getBoundingClientRect(); setNameDraft(run.group); setMenu({ kind: 'group', group: run.group, x: r.left, y: r.bottom + 6 }) }}>···</button>
              </div>
            )}
            <div className="tabGroup" data-collapsed={collapsed} aria-hidden={collapsed}>
              {run.tabs.map((tab) => (
                <div
                  key={tab.id}
                  className="tab"
                  role="tab"
                  aria-selected={tab.id === p.activeId}
                  data-active={tab.id === p.activeId}
                  data-drop-target={dropId === tab.id}
                  draggable={!collapsed}
                  onContextMenu={(event) => { event.preventDefault(); setMenu({ kind: 'tab', id: tab.id, x: event.clientX, y: event.clientY }) }}
                  onDragStart={(event) => { event.dataTransfer.setData('application/x-cclear-tab', tab.id); event.dataTransfer.effectAllowed = 'move'; setDraggedId(tab.id) }}
                  onDragEnd={() => { setDraggedId(null); setDropId(null) }}
                  onDragOver={(event) => { if (draggedId && draggedId !== tab.id) { event.preventDefault(); setDropId(tab.id) } }}
                  onDragLeave={() => setDropId(null)}
                  onDrop={(event) => {
                    event.preventDefault()
                    const id = event.dataTransfer.getData('application/x-cclear-tab')
                    if (id) p.onMoveBefore(id, tab.id)
                    setDraggedId(null)
                    setDropId(null)
                  }}
                >
                  <button type="button" className="tabTitle" tabIndex={collapsed ? -1 : 0} title={tab.url} onClick={() => p.onActivate(tab.id)}>
                    {p.verdicts?.[tab.id] && tab.url !== 'about:blank' && (
                      <span className={'tabVerdict verdict-' + p.verdicts[tab.id].verdict} title={(p.verdicts[tab.id].verdict === 'on' ? 'On task' : p.verdicts[tab.id].verdict === 'off' ? 'Off task' : 'Not sure') + ': ' + p.verdicts[tab.id].reason} role="img" aria-label={p.verdicts[tab.id].verdict === 'on' ? 'On task' : p.verdicts[tab.id].verdict === 'off' ? 'Off task' : 'Not sure if on task'} />
                    )}
                    {tab.favicon && <img src={tab.favicon} className="tabFavicon" alt="" />}
                    <span className="tabTitleText">{tab.title || (tab.url === 'about:blank' ? 'New tab' : tab.url) || 'New tab'}</span>
                  </button>
                  <button type="button" className="tabClose" tabIndex={collapsed ? -1 : 0} aria-label={'Close ' + (tab.title || 'tab')} title="Close tab" onClick={(event) => { event.stopPropagation(); p.onClose(tab.id) }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <button type="button" className="tabNewBtn" aria-label="New tab" title="New tab" onClick={p.onNewTab}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
      {p.tabs.length >= 4 && <button type="button" className="tabOrganizeBtn" disabled={p.groupingBusy} title="Group similar tabs with local AI" onClick={p.onAutoGroup}>{p.groupingBusy ? 'Grouping…' : 'Group tabs'}</button>}
      {popup}
    </div>
  )
}
