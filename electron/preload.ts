import { contextBridge, ipcRenderer } from 'electron'
import type { ChatMessage, Prefs, TabContextItem, SimplifyChunk, TabGroupAssignment, TabContextSummary } from '../src/shared/types'

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
      activeTabId?: string
    ): Promise<string> => ipcRenderer.invoke('ai:chat', { messages, tabs, activeTabId }),
    simplifyChunks: (chunks: SimplifyChunk[]): Promise<{ id: string; summary: string; keyPoints: string[] }[]> =>
      ipcRenderer.invoke('ai:simplify-chunks', chunks),
    groupTabs: (tabs: TabContextItem[]): Promise<TabGroupAssignment[]> => ipcRenderer.invoke('ai:group-tabs', tabs),
    inferContext: (url: string, title: string, historyUrls: string[]): Promise<TabContextSummary> => ipcRenderer.invoke('ai:infer-context', { url, title, historyUrls })
  }
})
