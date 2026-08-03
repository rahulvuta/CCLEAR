import type { ChatMessage, Prefs, TabContextItem, SimplifyChunk, SimplifyResult, TabGroupAssignment, TabContextSummary } from '../shared/types'
import type { PagePassageSnapshot, PagePassageSelection } from '../ai/pageActions'

export type AiHealth = { ok: boolean; error?: string }

export type CCLEARApi = {
  prefs: {
    get(): Promise<Prefs>
    set(patch: Partial<Prefs>): Promise<Prefs>
  }
  ai: {
    selectPagePassages(query: string, snapshot: PagePassageSnapshot): Promise<PagePassageSelection>
    health(): Promise<AiHealth>
    chat(messages: ChatMessage[], tabs: TabContextItem[], activeTabId?: string, screenText?: string): Promise<string>
    onChatProgress(callback: (payload: { think: string; content: string }) => void): () => void
    simplifyChunks(chunks: SimplifyChunk[]): Promise<SimplifyResult[]>
    groupTabs(tabs: TabContextItem[]): Promise<TabGroupAssignment[]>
    inferContext(url: string, title: string, historyUrls: string[]): Promise<TabContextSummary>
    recommendLinks(historyUrls: string[]): Promise<{ name: string; url: string }[]>
  }
  onShortcut: (callback: (action: string, ...args: unknown[]) => void) => () => void
}

declare global {
  interface Window {
    cclearBrowser: CCLEARApi
  }
}

export {}
