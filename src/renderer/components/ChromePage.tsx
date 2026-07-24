import { useEffect, useMemo, useState } from 'react'
import type { BookmarkItem, DownloadRecord, HistoryEntry, Prefs } from '../../shared/types'
import type { ChromePageKind } from '../../shared/chromeUrls'

type Props = {
  kind: ChromePageKind
  bookmarks: BookmarkItem[]
  onBookmarksChange: () => void
  prefs: Prefs
  onPrefsChange: (patch: Partial<Prefs>) => void
  onOpen: (url: string, newTab?: boolean) => void
}

export function ChromePage(props: Props) {
  const title =
    props.kind === 'bookmarks' ? 'Bookmarks' :
    props.kind === 'history' ? 'History' :
    props.kind === 'downloads' ? 'Downloads' :
    'Settings'

  return (
    <div className="chromePage">
      <header className="chromePageHeader">
        <h1>{title}</h1>
      </header>
      {props.kind === 'bookmarks' && (
        <BookmarksManager bookmarks={props.bookmarks} onChange={props.onBookmarksChange} onOpen={props.onOpen} />
      )}
      {props.kind === 'history' && <HistoryManager onOpen={props.onOpen} />}
      {props.kind === 'downloads' && <DownloadsManager />}
      {props.kind === 'settings' && (
        <SettingsManager prefs={props.prefs} onPrefsChange={props.onPrefsChange} />
      )}
    </div>
  )
}

function BookmarksManager({
  bookmarks,
  onChange,
  onOpen
}: {
  bookmarks: BookmarkItem[]
  onChange: () => void
  onOpen: (url: string, newTab?: boolean) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [newFolder, setNewFolder] = useState('')

  const roots = useMemo(
    () => bookmarks.filter((b) => b.parentId == null).sort((a, b) => a.order - b.order),
    [bookmarks]
  )

  const children = (id: string) =>
    bookmarks.filter((b) => b.parentId === id).sort((a, b) => a.order - b.order)

  async function addFolder() {
    const title = newFolder.trim() || 'New folder'
    await window.cclearBrowser.bookmarks.add({ type: 'folder', title, parentId: null })
    setNewFolder('')
    onChange()
  }

  async function saveTitle(id: string) {
    await window.cclearBrowser.bookmarks.update(id, { title: editTitle.trim() || 'Bookmark' })
    setEditing(null)
    onChange()
  }

  function Row({ item, depth }: { item: BookmarkItem; depth: number }) {
    const kids = item.type === 'folder' ? children(item.id) : []
    return (
      <>
        <div className="chromeListRow" style={{ paddingLeft: 12 + depth * 18 }}>
          {item.type === 'folder' ? (
            <span className="chromeRowKind">Folder</span>
          ) : (
            <img
              className="chromeRowFavicon"
              alt=""
              src={item.url ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(item.url))}&sz=32` : ''}
            />
          )}
          {editing === item.id ? (
            <input
              className="chromeInlineInput"
              value={editTitle}
              autoFocus
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={() => void saveTitle(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveTitle(item.id)
                if (e.key === 'Escape') setEditing(null)
              }}
            />
          ) : (
            <button
              type="button"
              className="chromeRowTitle"
              onClick={() => {
                if (item.url) onOpen(item.url)
              }}
              onDoubleClick={() => {
                setEditing(item.id)
                setEditTitle(item.title)
              }}
            >
              {item.title}
            </button>
          )}
          {item.url && <span className="chromeRowMeta">{item.url}</span>}
          <div className="chromeRowActions">
            <button
              type="button"
              className="chromeLinkBtn"
              onClick={() => {
                setEditing(item.id)
                setEditTitle(item.title)
              }}
            >
              Rename
            </button>
            {item.url && (
              <button type="button" className="chromeLinkBtn" onClick={() => onOpen(item.url!, true)}>
                New tab
              </button>
            )}
            <button
              type="button"
              className="chromeLinkBtn chromeLinkDanger"
              onClick={() => void window.cclearBrowser.bookmarks.remove(item.id).then(onChange)}
            >
              Delete
            </button>
          </div>
        </div>
        {kids.map((k) => (
          <Row key={k.id} item={k} depth={depth + 1} />
        ))}
      </>
    )
  }

  return (
    <div className="chromePageBody">
      <div className="chromeToolbarRow">
        <input
          className="chromeSearch"
          placeholder="New folder name"
          value={newFolder}
          onChange={(e) => setNewFolder(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addFolder()
          }}
        />
        <button type="button" className="chromeBtn" onClick={() => void addFolder()}>
          Add folder
        </button>
      </div>
      {roots.length === 0 ? (
        <p className="chromeEmpty">No bookmarks yet. Use the star in the address bar to save a page.</p>
      ) : (
        <div className="chromeList">{roots.map((item) => <Row key={item.id} item={item} depth={0} />)}</div>
      )}
    </div>
  )
}

function HistoryManager({ onOpen }: { onOpen: (url: string, newTab?: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<HistoryEntry[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const rows = query.trim()
        ? await window.cclearBrowser.history.search(query)
        : await window.cclearBrowser.history.list()
      if (!cancelled) setItems(rows)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [query])

  async function clearAll() {
    await window.cclearBrowser.history.clear()
    setItems([])
  }

  const grouped = groupHistory(items)

  return (
    <div className="chromePageBody">
      <div className="chromeToolbarRow">
        <input
          className="chromeSearch"
          placeholder="Search history"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="chromeBtn chromeBtnGhost" onClick={() => void clearAll()}>
          Clear browsing history
        </button>
      </div>
      {items.length === 0 ? (
        <p className="chromeEmpty">No history yet.</p>
      ) : (
        grouped.map((g) => (
          <section key={g.label} className="chromeSection">
            <h2>{g.label}</h2>
            <div className="chromeList">
              {g.items.map((h) => (
                <div key={h.id} className="chromeListRow">
                  <img
                    className="chromeRowFavicon"
                    alt=""
                    src={h.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(h.url))}&sz=32`}
                  />
                  <button type="button" className="chromeRowTitle" onClick={() => onOpen(h.url)}>
                    {h.title || h.url}
                  </button>
                  <span className="chromeRowMeta">{h.url}</span>
                  <span className="chromeRowTime">{formatTime(h.visitedAt)}</span>
                  <button type="button" className="chromeLinkBtn" onClick={() => onOpen(h.url, true)}>
                    New tab
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function DownloadsManager() {
  const [items, setItems] = useState<DownloadRecord[]>([])

  useEffect(() => {
    void window.cclearBrowser.downloads.list().then(setItems)
    return window.cclearBrowser.downloads.onChanged(setItems)
  }, [])

  return (
    <div className="chromePageBody">
      {items.length === 0 ? (
        <p className="chromeEmpty">No downloads yet.</p>
      ) : (
        <div className="chromeList">
          {items.map((d) => {
            const pct = d.totalBytes > 0 ? Math.min(100, Math.round((d.receivedBytes / d.totalBytes) * 100)) : 0
            return (
              <div key={d.id} className="chromeListRow chromeDownloadRow">
                <div className="chromeDownloadMain">
                  <div className="chromeRowTitleStatic">{d.filename}</div>
                  <div className="chromeRowMeta">{d.url}</div>
                  {d.state === 'progressing' && (
                    <div className="downloadBar"><div className="downloadBarFill" style={{ width: `${pct}%` }} /></div>
                  )}
                  <div className="chromeRowTime">{downloadStatus(d, pct)}</div>
                </div>
                <div className="chromeRowActions">
                  {d.state === 'progressing' && (
                    <button type="button" className="chromeLinkBtn" onClick={() => void window.cclearBrowser.downloads.cancel(d.id)}>
                      Cancel
                    </button>
                  )}
                  {d.state === 'completed' && (
                    <>
                      <button type="button" className="chromeLinkBtn" onClick={() => void window.cclearBrowser.downloads.open(d.id)}>
                        Open
                      </button>
                      <button type="button" className="chromeLinkBtn" onClick={() => void window.cclearBrowser.downloads.showInFolder(d.id)}>
                        Show in folder
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SettingsManager({
  prefs,
  onPrefsChange
}: {
  prefs: Prefs
  onPrefsChange: (patch: Partial<Prefs>) => void
}) {
  const [homepage, setHomepage] = useState(prefs.homepage)

  useEffect(() => {
    setHomepage(prefs.homepage)
  }, [prefs.homepage])

  return (
    <div className="chromePageBody settingsBody">
      <label className="settingsRow">
        <input
          type="checkbox"
          checked={prefs.showBookmarksBar}
          onChange={(e) => onPrefsChange({ showBookmarksBar: e.target.checked })}
        />
        <span>Show bookmarks bar</span>
      </label>
      <label className="settingsRow">
        <input
          type="checkbox"
          checked={prefs.restoreTabsOnStartup}
          onChange={(e) => onPrefsChange({ restoreTabsOnStartup: e.target.checked })}
        />
        <span>Continue where you left off</span>
      </label>
      <label className="chromeField settingsHomepage">
        <span>Home page</span>
        <input
          value={homepage}
          onChange={(e) => setHomepage(e.target.value)}
          onBlur={() => onPrefsChange({ homepage: homepage.trim() || 'about:blank' })}
          placeholder="about:blank"
        />
      </label>
      <p className="settingsHint">Focus mode is toggled from the toolbar. Chat is toggled with Cmd/Ctrl+Shift+S.</p>
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function groupHistory(items: HistoryEntry[]): { label: string; items: HistoryEntry[] }[] {
  const groups: { label: string; items: HistoryEntry[] }[] = []
  for (const h of items) {
    const label = dayLabel(h.visitedAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(h)
    else groups.push({ label, items: [h] })
  }
  return groups
}

function dayLabel(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const yest = new Date()
  yest.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

function downloadStatus(d: DownloadRecord, pct: number): string {
  if (d.state === 'completed') return 'Completed'
  if (d.state === 'cancelled') return 'Cancelled'
  if (d.state === 'interrupted') return 'Interrupted'
  if (d.totalBytes > 0) return `${pct}%`
  return 'Downloading'
}
