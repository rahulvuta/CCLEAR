import { contextBridge, ipcRenderer } from 'electron'
import type { ChatMessage, Prefs, TabContextItem, SimplifyChunk } from '../src/shared/types'

contextBridge.exposeInMainWorld('adhdBrowser', {
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
      ipcRenderer.invoke('ai:simplify-chunks', chunks)
  }
})
