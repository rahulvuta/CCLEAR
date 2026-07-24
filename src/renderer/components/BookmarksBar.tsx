import { useMemo, useState } from 'react'
import type { BookmarkItem } from '../../shared/types'
import { ContextMenu, type ContextMenuEntry } from './ContextMenu'

type Props = {
  bookmarks: BookmarkItem[]
  visible: boolean
  onOpen: (url: string) => void
  onOpenManager: () => void
  onChange: () => void
}

export function BookmarksBar({ bookmarks, visible, onOpen, onOpenManager, onChange }: Props) {
  const [folderOpen, setFolderOpen] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  const barItems = useMemo(
    () =>
      bookmarks
        .filter((b) => b.parentId == null)
        .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt),
    [bookmarks]
  )

  if (!visible) return null

  const childrenOf = (id: string) =>
    bookmarks.filter((b) => b.parentId === id).sort((a, b) => a.order - b.order)

  const contextItems = (id: string): ContextMenuEntry[] => {
    const item = bookmarks.find((b) => b.id === id)
    if (!item) return []
    return [
      ...(item.type === 'url' && item.url
        ? [{ type: 'item' as const, label: 'Open', action: () => onOpen(item.url!) }]
        : []),
      { type: 'item', label: 'Edit in bookmark manager', action: onOpenManager },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Delete',
        danger: true,
        action: () => {
          void window.cclearBrowser.bookmarks.remove(id).then(onChange)
        }
      }
    ]
  }

  return (
    <div className="bookmarksBar">
      {barItems.length === 0 ? (
        <button type="button" className="bookmarksBarEmpty" onClick={onOpenManager}>
          Bookmarks appear here. Open bookmark manager
        </button>
      ) : (
        barItems.map((item) => {
          if (item.type === 'folder') {
            const kids = childrenOf(item.id)
            return (
              <div key={item.id} className="bookmarksBarItemWrap">
                <button
                  type="button"
                  className="bookmarksBarItem"
                  title={item.title}
                  onClick={() => setFolderOpen(folderOpen === item.id ? null : item.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, id: item.id })
                  }}
                >
                  <span className="bookmarksBarFolderMark" aria-hidden />
                  <span className="bookmarksBarLabel">{item.title}</span>
                </button>
                {folderOpen === item.id && (
                  <div className="bookmarksFolderMenu">
                    {kids.length === 0 && <div className="bookmarksFolderEmpty">Empty folder</div>}
                    {kids.map((kid) => (
                      <button
                        key={kid.id}
                        type="button"
                        className="bookmarksFolderItem"
                        onClick={() => {
                          if (kid.url) onOpen(kid.url)
                          setFolderOpen(null)
                        }}
                      >
                        {kid.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          }
          return (
            <button
              key={item.id}
              type="button"
              className="bookmarksBarItem"
              title={item.url}
              onClick={() => item.url && onOpen(item.url)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, id: item.id })
              }}
            >
              {item.url && (
                <img
                  className="bookmarksBarFavicon"
                  alt=""
                  src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(safeHost(item.url))}&sz=32`}
                />
              )}
              <span className="bookmarksBarLabel">{item.title}</span>
            </button>
          )
        })
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={contextItems(menu.id)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
