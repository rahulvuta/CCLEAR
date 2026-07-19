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
      activeTabId?: string,
      screenText?: string
    ): Promise<string> => ipcRenderer.invoke('ai:chat', { messages, tabs, activeTabId, screenText }),
    simplifyChunks: (chunks: SimplifyChunk[]): Promise<{ id: string; summary: string; keyPoints: string[] }[]> =>
      ipcRenderer.invoke('ai:simplify-chunks', chunks),
    groupTabs: (tabs: TabContextItem[]): Promise<TabGroupAssignment[]> => ipcRenderer.invoke('ai:group-tabs', tabs),
    inferContext: (url: string, title: string, historyUrls: string[]): Promise<TabContextSummary> => ipcRenderer.invoke('ai:infer-context', { url, title, historyUrls }),
    recommendLinks: (historyUrls: string[]): Promise<{ name: string; url: string }[]> => ipcRenderer.invoke('ai:recommend-links', historyUrls)
  },
  onShortcut: (callback: (action: string, ...args: unknown[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string, ...args: unknown[]) => {
      callback(action, ...args)
    }
    ipcRenderer.on('shortcut', handler)
    return () => { ipcRenderer.removeListener('shortcut', handler) }
  }
})
