import { contextBridge, ipcRenderer } from 'electron'
import type {
  BookmarkItem,
  BookmarkWrite,
  BrowserSession,
  ChatMessage,
  DownloadRecord,
  HistoryEntry,
  Prefs,
  SessionTab,
  SimplifyChunk,
  SimplifyResult,
  TabContextItem,
  TabGroupAssignment,
  TabContextSummary
} from '../src/shared/types'

contextBridge.exposeInMainWorld('cclearBrowser', {
  prefs: {
    get: (): Promise<Prefs> => ipcRenderer.invoke('prefs:get'),
    set: (patch: Partial<Prefs>): Promise<Prefs> => ipcRenderer.invoke('prefs:set', patch)
  },
  ai: {
    health: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('ai:health'),
    chat: (
      messages: ChatMessage[],
      tabs: TabContextItem[],
      activeTabId?: string,
      screenText?: string,
      screenImageBase64?: string
    ): Promise<string> =>
      ipcRenderer.invoke('ai:chat', { messages, tabs, activeTabId, screenText, screenImageBase64 }),
    simplifyChunks: (chunks: SimplifyChunk[]): Promise<SimplifyResult[]> =>
      ipcRenderer.invoke('ai:simplify-chunks', chunks),
    groupTabs: (tabs: TabContextItem[]): Promise<TabGroupAssignment[]> => ipcRenderer.invoke('ai:group-tabs', tabs),
    inferContext: (url: string, title: string, historyUrls: string[]): Promise<TabContextSummary> => ipcRenderer.invoke('ai:infer-context', { url, title, historyUrls }),
    recommendLinks: (historyUrls: string[]): Promise<{ name: string; url: string }[]> => ipcRenderer.invoke('ai:recommend-links', historyUrls)
  },
  bookmarks: {
    list: (): Promise<BookmarkItem[]> => ipcRenderer.invoke('bookmarks:list'),
    add: (input: BookmarkWrite): Promise<BookmarkItem> => ipcRenderer.invoke('bookmarks:add', input),
    update: (id: string, patch: Partial<Pick<BookmarkItem, 'title' | 'url' | 'parentId' | 'order'>>): Promise<BookmarkItem | null> =>
      ipcRenderer.invoke('bookmarks:update', id, patch),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('bookmarks:remove', id),
    move: (id: string, parentId: string | null, order: number): Promise<BookmarkItem | null> =>
      ipcRenderer.invoke('bookmarks:move', id, parentId, order)
  },
  history: {
    list: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:list'),
    search: (query: string): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:search', query),
    clear: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:clear'),
    add: (entry: { url: string; title: string; favicon?: string }): Promise<HistoryEntry | null> =>
      ipcRenderer.invoke('history:add', entry)
  },
  downloads: {
    list: (): Promise<DownloadRecord[]> => ipcRenderer.invoke('downloads:list'),
    cancel: (id: string): Promise<DownloadRecord[]> => ipcRenderer.invoke('downloads:cancel', id),
    showInFolder: (id: string): Promise<boolean> => ipcRenderer.invoke('downloads:showInFolder', id),
    open: (id: string): Promise<boolean> => ipcRenderer.invoke('downloads:open', id),
    onChanged: (callback: (items: DownloadRecord[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, items: DownloadRecord[]) => callback(items)
      ipcRenderer.on('downloads:changed', handler)
      return () => { ipcRenderer.removeListener('downloads:changed', handler) }
    }
  },
  session: {
    get: (): Promise<BrowserSession> => ipcRenderer.invoke('session:get'),
    save: (payload: { tabs: SessionTab[]; activeId: string }): Promise<BrowserSession> =>
      ipcRenderer.invoke('session:save', payload),
    pushClosed: (tab: SessionTab): Promise<BrowserSession> => ipcRenderer.invoke('session:pushClosed', tab),
    popClosed: (): Promise<{ tab: SessionTab | null; session: BrowserSession }> =>
      ipcRenderer.invoke('session:popClosed')
  },
  onShortcut: (callback: (action: string, ...args: unknown[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string, ...args: unknown[]) => {
      callback(action, ...args)
    }
    ipcRenderer.on('shortcut', handler)
    return () => { ipcRenderer.removeListener('shortcut', handler) }
  }
})
