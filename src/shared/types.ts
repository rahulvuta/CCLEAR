export type TabContextItem = {
  id: string
  title: string
  url: string
  isActive: boolean
}

import type { ProposedAction } from '../ai/tools'

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
  /** Actions the assistant proposed; `state` tracks the user's choice on confirm cards. */
  actions?: Array<ProposedAction & { state: 'pending' | 'done' | 'dismissed' | 'failed' }>
  /** Page passages an answer was drawn from; clicking one scrolls the page to it. */
  sources?: Array<{ n: number; id: string; text: string; context: string; url: string }>
  /** Open tabs an answer was drawn from; clicking one switches to it. */
  tabSources?: Array<{ n: number; tabId: string; title: string; url: string }>
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
  /** Document Y of the block's top edge, used to simplify what is on screen first */
  y?: number
}

export type SimplifyResult = {
  id: string
  status?: 'simplified' | 'preserved'
  summary: string
  highlightPhrases: string[]
  termEmphasis: string[]
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

import type { ReadingPrefs } from './reading'

export type Prefs = {
  focusModeEnabled: boolean
  reading?: ReadingPrefs
  /** Ollama model chosen in Settings. */
  aiModel?: string
}
