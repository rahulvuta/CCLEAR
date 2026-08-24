export type AssistLevel = 'off' | 'quiet' | 'balanced' | 'coach'

export type SessionStep = { id: string; text: string; done: boolean }

export type Session = {
  id: string
  goal: string
  startedAt: number
  steps: SessionStep[]
  /** Hosts the user said are relevant to this goal ("This is relevant"). */
  allowedHosts: string[]
  /** Time accounting for the end-of-session recap. */
  onSeconds?: number
  offSeconds?: number
  nudges?: number
}

export type ParkedItem = {
  id: string
  kind: 'tab' | 'thought'
  title: string
  url?: string
  favicon?: string
  note?: string
  createdAt: number
  /** Reading position to restore when a parked tab is reopened. */
  scrollRatio?: number
}

export type ReadingProgress = {
  url: string
  title: string
  /** 0..1 position through the page. */
  ratio: number
  /** Nearest heading above the viewport. */
  heading?: string
  at: number
}

export type SavedTab = { url: string; title: string; favicon?: string; active?: boolean }

export type PastSession = {
  id: string
  goal: string
  startedAt: number
  endedAt: number
  stepsDone: number
  stepsTotal: number
  parked: number
  onSeconds?: number
  offSeconds?: number
  nudges?: number
}

/** Everything that must survive a restart. */
export type SessionState = {
  version: 1
  current: Session | null
  parked: ParkedItem[]
  history: PastSession[]
  tabs: SavedTab[]
  progress: Record<string, ReadingProgress>
  assistLevel: AssistLevel
  /** Hosts the user wants a pause before opening (friction sites). */
  frictionHosts: string[]
  /** Hosts the user turned the blocker off for. */
  blockerAllow: string[]
}

export const EMPTY_SESSION_STATE: SessionState = {
  version: 1,
  current: null,
  parked: [],
  history: [],
  tabs: [],
  progress: {},
  assistLevel: 'balanced',
  frictionHosts: [],
  blockerAllow: []
}

export type Verdict = 'on' | 'unsure' | 'off'
