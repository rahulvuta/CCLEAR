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
} from '../shared/types'

export type AiHealth = { ok: boolean; error?: string }

export type CCLEARApi = {
  prefs: {
    get(): Promise<Prefs>
    set(patch: Partial<Prefs>): Promise<Prefs>
  }
  ai: {
    health(): Promise<AiHealth>
    chat(
      messages: ChatMessage[],
      tabs: TabContextItem[],
      activeTabId?: string,
      screenText?: string,
      screenImageBase64?: string
    ): Promise<string>
    simplifyChunks(chunks: SimplifyChunk[]): Promise<SimplifyResult[]>
    groupTabs(tabs: TabContextItem[]): Promise<TabGroupAssignment[]>
    inferContext(url: string, title: string, historyUrls: string[]): Promise<TabContextSummary>
    recommendLinks(historyUrls: string[]): Promise<{ name: string; url: string }[]>
  }
  bookmarks: {
    list(): Promise<BookmarkItem[]>
    add(input: BookmarkWrite): Promise<BookmarkItem>
    update(id: string, patch: Partial<Pick<BookmarkItem, 'title' | 'url' | 'parentId' | 'order'>>): Promise<BookmarkItem | null>
    remove(id: string): Promise<boolean>
    move(id: string, parentId: string | null, order: number): Promise<BookmarkItem | null>
  }
  history: {
    list(): Promise<HistoryEntry[]>
    search(query: string): Promise<HistoryEntry[]>
    clear(): Promise<HistoryEntry[]>
    add(entry: { url: string; title: string; favicon?: string }): Promise<HistoryEntry | null>
  }
  downloads: {
    list(): Promise<DownloadRecord[]>
    cancel(id: string): Promise<DownloadRecord[]>
    showInFolder(id: string): Promise<boolean>
    open(id: string): Promise<boolean>
    onChanged(callback: (items: DownloadRecord[]) => void): () => void
  }
  session: {
    get(): Promise<BrowserSession>
    save(payload: { tabs: SessionTab[]; activeId: string }): Promise<BrowserSession>
    pushClosed(tab: SessionTab): Promise<BrowserSession>
    popClosed(): Promise<{ tab: SessionTab | null; session: BrowserSession }>
  }
  onShortcut: (callback: (action: string, ...args: unknown[]) => void) => () => void
}

declare global {
  interface Window {
    cclearBrowser: CCLEARApi
  }
}

export {}
