import type { ChatMessage, Prefs, TabContextItem, SimplifyChunk } from '../shared/types'

export type AiHealth = { ok: boolean; error?: string }

export type ADHDApi = {
  prefs: {
    get(): Promise<Prefs>
    set(patch: Partial<Prefs>): Promise<Prefs>
  }
  ai: {
    health(): Promise<AiHealth>
    chat(messages: ChatMessage[], tabs: TabContextItem[], activeTabId?: string): Promise<string>
    simplifyChunks(chunks: SimplifyChunk[]): Promise<{ id: string; summary: string; keyPoints: string[] }[]>
  }
}

declare global {
  interface Window {
    adhdBrowser: ADHDApi
  }
}

export {}
