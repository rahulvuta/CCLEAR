import { contextBridge, ipcRenderer } from 'electron'
import type { PagePassageSnapshot, PagePassageSelection } from '../src/ai/pageActions'
import type { ChatMessage, Prefs, TabContextItem, SimplifyChunk, SimplifyResult, TabGroupAssignment, TabContextSummary } from '../src/shared/types'

contextBridge.exposeInMainWorld('cclearBrowser', {
  prefs: {
    get: (): Promise<Prefs> => ipcRenderer.invoke('prefs:get'),
    set: (patch: Partial<Prefs>): Promise<Prefs> => ipcRenderer.invoke('prefs:set', patch)
  },
  ai: {
    selectPagePassages: (query: string, snapshot: PagePassageSnapshot): Promise<PagePassageSelection> =>
      ipcRenderer.invoke('ai:select-page-passages', { query, snapshot }),
    health: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('ai:health'),
    chat: (
      messages: ChatMessage[],
      tabs: TabContextItem[],
      activeTabId?: string,
      screenText?: string
    ): Promise<string> => ipcRenderer.invoke('ai:chat', { messages, tabs, activeTabId, screenText }),
    onChatProgress: (callback: (payload: { think: string; content: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { think: string; content: string }) => {
        callback(payload)
      }
      ipcRenderer.on('ai:chat-progress', handler)
      return () => {
        ipcRenderer.removeListener('ai:chat-progress', handler)
      }
    },
    simplifyChunks: (chunks: SimplifyChunk[]): Promise<SimplifyResult[]> =>
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
