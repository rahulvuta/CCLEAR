import { contextBridge, ipcRenderer } from 'electron'
import type { PagePassageSnapshot, PagePassageSelection } from '../src/ai/pageActions'
import type { ProposedAction } from '../src/ai/tools'
import type { SessionState } from '../src/shared/session'
import type { ReaderSummary } from '../src/shared/reading'
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
    assist: (payload: {
      requestId: string
      messages: ChatMessage[]
      tabs: TabContextItem[]
      activeTabId?: string
      screenText?: string
      screenImageBase64?: string
      goal?: string
    }): Promise<{ text: string; actions: ProposedAction[] }> => ipcRenderer.invoke('ai:assist', payload),
    cancel: (requestId: string): Promise<void> => ipcRenderer.invoke('ai:cancel', requestId),
    simplifySentences: (sentences: Array<{ id: string; text: string }>): Promise<Array<{ id: string; text: string; changed: boolean }>> => ipcRenderer.invoke('ai:simplify-sentences', sentences),
    askTabs: (p: { requestId: string; question: string; tabs: Array<{ id: string; title: string; url: string; text: string }> }) => ipcRenderer.invoke('ai:ask-tabs', p),
    askPage: (p: { requestId: string; question: string; snapshot: PagePassageSnapshot }) => ipcRenderer.invoke('ai:ask-page', p),
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
  session: {
    load: (): Promise<SessionState | null> => ipcRenderer.invoke('session:load'),
    save: (state: SessionState): Promise<boolean> => ipcRenderer.invoke('session:save', state),
    suggestSteps: (goal: string): Promise<string[]> => ipcRenderer.invoke('session:suggest-steps', goal),
    judge: (p: { goal: string; steps?: string[]; title: string; url: string; text?: string }): Promise<{ relevant: boolean; why: string } | null> =>
      ipcRenderer.invoke('session:judge', p)
  },
  ledger: {
    get: () => ipcRenderer.invoke('ledger:get')
  },
  app: {
    info: (): Promise<{ version: string; demo: boolean; demoUrl: string }> => ipcRenderer.invoke('app:info')
  },
  models: {
    status: () => ipcRenderer.invoke('models:status'),
    select: (name: string): Promise<boolean> => ipcRenderer.invoke('models:select', name),
    pull: (name: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('models:pull', name),
    cancelPull: (name: string): Promise<void> => ipcRenderer.invoke('models:cancel-pull', name),
    onPullProgress: (cb: (p: { name: string; status: string; completed: number; total: number }) => void) => {
      const h = (_e: Electron.IpcRendererEvent, p: { name: string; status: string; completed: number; total: number }) => cb(p)
      ipcRenderer.on('models:pull-progress', h)
      return () => { ipcRenderer.removeListener('models:pull-progress', h) }
    }
  },
  blocker: {
    count: (wcId: number): Promise<number> => ipcRenderer.invoke('blocker:count', wcId),
    setEnabled: (on: boolean): Promise<void> => ipcRenderer.invoke('blocker:set-enabled', on)
  },
  reading: {
    summarize: (p: { url: string; title: string; text: string }): Promise<ReaderSummary> => ipcRenderer.invoke('reading:summarize', p)
  },
  onShortcut: (callback: (action: string, ...args: unknown[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string, ...args: unknown[]) => {
      callback(action, ...args)
    }
    ipcRenderer.on('shortcut', handler)
    return () => { ipcRenderer.removeListener('shortcut', handler) }
  }
})
