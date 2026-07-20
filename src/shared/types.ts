export type TabContextItem = {
  id: string
  title: string
  url: string
  isActive: boolean
}

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type SimplifyChunk = {
  id: string
  text: string
}

export type PageBlockForSimplify = {
  id: string
  text: string
  outerHtmlLength: number
  /** Tag used when restoring simplified blocks to the DOM */
  tagName: string
}

export type TabGroupAssignment = {
  id: string
  group: string
}

export type TabContextSummary = {
  originUrl?: string
  inferredReason: string
  summary: string
}

export type Prefs = {
  focusModeEnabled: boolean
  showBookmarksBar: boolean
  restoreTabsOnStartup: boolean
  homepage: string
}

export type BookmarkItem = {
  id: string
  type: 'folder' | 'url'
  title: string
  url?: string
  parentId: string | null
  order: number
  createdAt: number
}

export type HistoryEntry = {
  id: string
  url: string
  title: string
  visitedAt: number
  favicon?: string
}

export type DownloadRecord = {
  id: string
  filename: string
  url: string
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted'
  receivedBytes: number
  totalBytes: number
  savePath: string
  startedAt: number
}

export type SessionTab = {
  id: string
  url: string
  title: string
  pinned?: boolean
  muted?: boolean
}

export type BrowserSession = {
  tabs: SessionTab[]
  activeId: string
  closed: SessionTab[]
}

export type BookmarkWrite = {
  type?: 'folder' | 'url'
  title: string
  url?: string
  parentId?: string | null
}

export type SimplifyEmphasis = {
  keyPhrases: string[]
  boldTerms: string[]
}

export type SimplifyResult = {
  id: string
  summary: string
  keyPhrases: string[]
  boldTerms: string[]
}
