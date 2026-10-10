import type { ChatMessage, Prefs, TabContextItem, SimplifyChunk, SimplifyResult, TabGroupAssignment, TabContextSummary } from '../shared/types'
import type { PagePassageSnapshot, PagePassageSelection } from '../ai/pageActions'
import type { ProposedAction } from '../ai/tools'
import type { SessionState } from '../shared/session'
import type { ReaderSummary } from '../shared/reading'

export type AiHealth = { ok: boolean; error?: string }

export type CCLEARApi = {
  prefs: {
    get(): Promise<Prefs>
    set(patch: Partial<Prefs>): Promise<Prefs>
  }
  ai: {
    selectPagePassages(query: string, snapshot: PagePassageSnapshot): Promise<PagePassageSelection>
    health(): Promise<AiHealth>
    assist(payload: {
      requestId: string
      messages: ChatMessage[]
      tabs: TabContextItem[]
      activeTabId?: string
      screenText?: string
      screenImageBase64?: string
      goal?: string
    }): Promise<{ text: string; actions: ProposedAction[] }>
    cancel(requestId: string): Promise<void>
    simplifySentences(sentences: Array<{ id: string; text: string }>): Promise<Array<{ id: string; text: string; changed: boolean }>>
    askTabs(p: { requestId: string; question: string; tabs: Array<{ id: string; title: string; url: string; text: string }> }): Promise<{ answer: string; sources: Array<{ n: number; tabId: string; title: string; url: string }> }>
    askPage(p: { requestId: string; question: string; snapshot: PagePassageSnapshot }): Promise<
      { kind: 'none' } | { kind: 'answer'; answer: string; grounded: boolean; sources: Array<{ n: number; id: string; text: string; context: string }> }
    >
    onChatProgress(callback: (payload: { think: string; content: string }) => void): () => void
    simplifyChunks(chunks: SimplifyChunk[]): Promise<SimplifyResult[]>
    groupTabs(tabs: TabContextItem[]): Promise<TabGroupAssignment[]>
    inferContext(url: string, title: string, historyUrls: string[]): Promise<TabContextSummary>
    recommendLinks(historyUrls: string[]): Promise<{ name: string; url: string }[]>
  }
  session: {
    load(): Promise<SessionState | null>
    save(state: SessionState): Promise<boolean>
    suggestSteps(goal: string): Promise<string[]>
    judge(p: { goal: string; steps?: string[]; title: string; url: string; text?: string }): Promise<{ relevant: boolean; why: string } | null>
  }
  ledger: {
    get(): Promise<import('../shared/ledger').LedgerSummary>
  }
  app: {
    info(): Promise<{ version: string; demo: boolean; demoUrl: string }>
  }
  models: {
    status(): Promise<{
      ollama: boolean
      error?: string
      installed: Array<{ name: string; sizeGB: number }>
      active: string
      activeInstalled: boolean
      vision: string
      visionInstalled: boolean
      ramGB: number
      recommended: { name: string; reason: string; tested: boolean }
      simplifyChecks: string
    }>
    select(name: string): Promise<boolean>
    pull(name: string): Promise<{ ok: boolean; error?: string }>
    cancelPull(name: string): Promise<void>
    onPullProgress(cb: (p: { name: string; status: string; completed: number; total: number }) => void): () => void
  }
  blocker: {
    count(wcId: number): Promise<number>
    setEnabled(on: boolean): Promise<void>
  }
  reading: {
    summarize(p: { url: string; title: string; text: string }): Promise<ReaderSummary>
  }
  onShortcut: (callback: (action: string, ...args: unknown[]) => void) => () => void
}

declare global {
  interface Window {
    cclearBrowser: CCLEARApi
  }
}

export {}
