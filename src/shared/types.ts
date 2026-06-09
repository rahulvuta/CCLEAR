export type TabContextItem = {
  id: string
  title: string
  url: string
  isActive: boolean
}

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
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
}

export type Prefs = {
  focusModeEnabled: boolean
}
