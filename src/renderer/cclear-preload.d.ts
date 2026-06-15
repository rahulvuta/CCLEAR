import type { ChatMessage, Prefs, TabContextItem, SimplifyChunk, TabGroupAssignment, TabContextSummary } from '../shared/types'

export type AiHealth = { ok: boolean; error?: string }

export type CCLEARApi = {
  prefs: {
    get(): Promise<Prefs>
    set(patch: Partial<Prefs>): Promise<Prefs>
  }
  ai: {
    health(): Promise<AiHealth>
    chat(messages: ChatMessage[], tabs: TabContextItem[], activeTabId?: string): Promise<string>
    simplifyChunks(chunks: SimplifyChunk[]): Promise<{ id: string; summary: string; keyPoints: string[] }[]>
    groupTabs(tabs: TabContextItem[]): Promise<TabGroupAssignment[]>
    inferContext(url: string, title: string, historyUrls: string[]): Promise<TabContextSummary>
  }
}

declare global {
  interface Window {
    cclearBrowser: CCLEARApi
  }
}

export {}
