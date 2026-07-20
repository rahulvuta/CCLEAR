import { randomUUID } from 'node:crypto'
import Store from 'electron-store'
import type {
  BookmarkItem,
  BookmarkWrite,
  BrowserSession,
  DownloadRecord,
  HistoryEntry,
  SessionTab
} from '../../src/shared/types'
import { isInternalUrl } from '../../src/shared/chromeUrls'

const HISTORY_MAX = 2000
const DOWNLOADS_MAX = 100
const CLOSED_MAX = 20

type BrowserData = {
  bookmarks: BookmarkItem[]
  history: HistoryEntry[]
  downloads: DownloadRecord[]
  session: BrowserSession
}

const emptySession = (): BrowserSession => ({ tabs: [], activeId: '', closed: [] })

const store = new Store<BrowserData>({
  name: 'cclear-browser-data',
  defaults: {
    bookmarks: [],
    history: [],
    downloads: [],
    session: emptySession()
  }
})

function nextOrder(items: BookmarkItem[], parentId: string | null): number {
  const sibs = items.filter((b) => b.parentId === parentId)
  return sibs.reduce((m, b) => Math.max(m, b.order), -1) + 1
}

export function listBookmarks(): BookmarkItem[] {
  return store.get('bookmarks') ?? []
}

export function addBookmark(input: BookmarkWrite): BookmarkItem {
  const items = listBookmarks()
  const parentId = input.parentId === undefined ? null : input.parentId
  const type = input.type ?? (input.url ? 'url' : 'folder')
  const item: BookmarkItem = {
    id: randomUUID(),
    type,
    title: input.title.trim() || (type === 'folder' ? 'Folder' : 'Bookmark'),
    url: type === 'url' ? input.url : undefined,
    parentId,
    order: nextOrder(items, parentId),
    createdAt: Date.now()
  }
  store.set('bookmarks', [...items, item])
  return item
}

export function updateBookmark(id: string, patch: Partial<Pick<BookmarkItem, 'title' | 'url' | 'parentId' | 'order'>>): BookmarkItem | null {
  const items = listBookmarks()
  const idx = items.findIndex((b) => b.id === id)
  if (idx < 0) return null
  const next = { ...items[idx], ...patch }
  if (patch.title != null) next.title = patch.title.trim() || next.title
  items[idx] = next
  store.set('bookmarks', items)
  return next
}

export function removeBookmark(id: string): boolean {
  const items = listBookmarks()
  const drop = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const b of items) {
      if (b.parentId && drop.has(b.parentId) && !drop.has(b.id)) {
        drop.add(b.id)
        grew = true
      }
    }
  }
  const next = items.filter((b) => !drop.has(b.id))
  if (next.length === items.length) return false
  store.set('bookmarks', next)
  return true
}

export function moveBookmark(id: string, parentId: string | null, order: number): BookmarkItem | null {
  const items = listBookmarks()
  const idx = items.findIndex((b) => b.id === id)
  if (idx < 0) return null
  if (parentId === id) return items[idx]
  items[idx] = { ...items[idx], parentId, order }
  store.set('bookmarks', items)
  return items[idx]
}

export function listHistory(): HistoryEntry[] {
  return store.get('history') ?? []
}

export function addHistory(entry: { url: string; title: string; favicon?: string }): HistoryEntry | null {
  const url = entry.url.trim()
  if (isInternalUrl(url)) return null
  const items = listHistory()
  const last = items[0]
  if (last && last.url === url && Date.now() - last.visitedAt < 120_000) {
    const updated: HistoryEntry = {
      ...last,
      title: entry.title || last.title,
      favicon: entry.favicon || last.favicon,
      visitedAt: Date.now()
    }
    store.set('history', [updated, ...items.slice(1)])
    return updated
  }
  const row: HistoryEntry = {
    id: randomUUID(),
    url,
    title: entry.title || url,
    visitedAt: Date.now(),
    favicon: entry.favicon
  }
  store.set('history', [row, ...items].slice(0, HISTORY_MAX))
  return row
}

export function searchHistory(query: string): HistoryEntry[] {
  const q = query.trim().toLowerCase()
  const items = listHistory()
  if (!q) return items
  return items.filter((h) => h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q))
}

export function clearHistory(): void {
  store.set('history', [])
}

export function listDownloads(): DownloadRecord[] {
  return store.get('downloads') ?? []
}

export function upsertDownload(row: DownloadRecord): DownloadRecord {
  const items = listDownloads()
  const idx = items.findIndex((d) => d.id === row.id)
  const next = idx >= 0 ? items.map((d) => (d.id === row.id ? row : d)) : [row, ...items]
  store.set('downloads', next.slice(0, DOWNLOADS_MAX))
  return row
}

export function getSession(): BrowserSession {
  const s = store.get('session')
  return {
    tabs: s?.tabs ?? [],
    activeId: s?.activeId ?? '',
    closed: s?.closed ?? []
  }
}

export function saveSession(patch: { tabs: SessionTab[]; activeId: string }): BrowserSession {
  const prev = getSession()
  const next: BrowserSession = { tabs: patch.tabs, activeId: patch.activeId, closed: prev.closed }
  store.set('session', next)
  return next
}

export function pushClosed(tab: SessionTab): BrowserSession {
  const prev = getSession()
  const next: BrowserSession = {
    ...prev,
    closed: [tab, ...prev.closed].slice(0, CLOSED_MAX)
  }
  store.set('session', next)
  return next
}

export function popClosed(): { tab: SessionTab | null; session: BrowserSession } {
  const prev = getSession()
  const [tab, ...rest] = prev.closed
  const next: BrowserSession = { ...prev, closed: rest }
  store.set('session', next)
  return { tab: tab ?? null, session: next }
}
