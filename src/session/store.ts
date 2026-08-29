import { EMPTY_SESSION_STATE, type AssistLevel, type ParkedItem, type ReadingProgress, type SavedTab, type Session, type SessionState, type SessionStep } from '../shared/session'

export type SessionAction =
  | { type: 'hydrate'; state: Partial<SessionState> | null }
  | { type: 'start'; goal: string; id: string; now: number }
  | { type: 'end'; now: number }
  | { type: 'setSteps'; steps: string[]; idGen: () => string }
  | { type: 'addStep'; text: string; id: string }
  | { type: 'toggleStep'; id: string }
  | { type: 'removeStep'; id: string }
  | { type: 'allowHost'; host: string }
  | { type: 'addTime'; on: number; off: number; nudges: number }
  | { type: 'park'; item: ParkedItem }
  | { type: 'unpark'; id: string }
  | { type: 'saveTabs'; tabs: SavedTab[] }
  | { type: 'progress'; progress: ReadingProgress }
  | { type: 'assistLevel'; level: AssistLevel }
  | { type: 'friction'; host: string; on: boolean }
  | { type: 'blockerAllow'; host: string; on: boolean }

const MAX_PARKED = 200
const MAX_PROGRESS = 300

function trimMap<T extends { at: number }>(m: Record<string, T>, max: number): Record<string, T> {
  const entries = Object.entries(m)
  if (entries.length <= max) return m
  return Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, max))
}

export function normalizeHost(h: string): string {
  return h.trim().toLowerCase().replace(/^www\./, '')
}

function withSession(state: SessionState, fn: (s: Session) => Session): SessionState {
  return state.current ? { ...state, current: fn(state.current) } : state
}

export function reduceSession(state: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case 'hydrate':
      return a.state ? { ...EMPTY_SESSION_STATE, ...a.state, version: 1 } : state
    case 'start': {
      const goal = a.goal.trim().slice(0, 200)
      if (!goal) return state
      const ended = state.current ? [pastOf(state.current, state, a.now)] : []
      return { ...state, history: [...ended, ...state.history].slice(0, 50), current: { id: a.id, goal, startedAt: a.now, steps: [], allowedHosts: [] } }
    }
    case 'end':
      if (!state.current) return state
      return { ...state, history: [pastOf(state.current, state, a.now), ...state.history].slice(0, 50), current: null }
    case 'setSteps':
      return withSession(state, (s) => ({
        ...s,
        steps: a.steps.map((t) => t.trim()).filter(Boolean).slice(0, 8).map((text): SessionStep => ({ id: a.idGen(), text: text.slice(0, 160), done: false }))
      }))
    case 'addStep': {
      const text = a.text.trim().slice(0, 160)
      if (!text) return state
      return withSession(state, (s) => ({ ...s, steps: [...s.steps, { id: a.id, text, done: false }].slice(0, 12) }))
    }
    case 'toggleStep':
      return withSession(state, (s) => ({ ...s, steps: s.steps.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)) }))
    case 'removeStep':
      return withSession(state, (s) => ({ ...s, steps: s.steps.filter((x) => x.id !== a.id) }))
    case 'addTime':
      return withSession(state, (x) => ({ ...x, onSeconds: (x.onSeconds ?? 0) + a.on, offSeconds: (x.offSeconds ?? 0) + a.off, nudges: (x.nudges ?? 0) + a.nudges }))
    case 'allowHost': {
      const host = normalizeHost(a.host)
      if (!host) return state
      return withSession(state, (s) => (s.allowedHosts.includes(host) ? s : { ...s, allowedHosts: [...s.allowedHosts, host] }))
    }
    case 'park':
      return { ...state, parked: [a.item, ...state.parked].slice(0, MAX_PARKED) }
    case 'unpark':
      return { ...state, parked: state.parked.filter((p) => p.id !== a.id) }
    case 'saveTabs':
      return { ...state, tabs: a.tabs.slice(0, 40) }
    case 'progress':
      return { ...state, progress: trimMap({ ...state.progress, [a.progress.url]: a.progress }, MAX_PROGRESS) }
    case 'assistLevel':
      return { ...state, assistLevel: a.level }
    case 'friction': {
      const host = normalizeHost(a.host)
      const set = new Set(state.frictionHosts)
      if (a.on) set.add(host)
      else set.delete(host)
      return { ...state, frictionHosts: [...set] }
    }
    case 'blockerAllow': {
      const host = normalizeHost(a.host)
      const set = new Set(state.blockerAllow)
      if (a.on) set.add(host)
      else set.delete(host)
      return { ...state, blockerAllow: [...set] }
    }
  }
}

function pastOf(s: Session, state: SessionState, now: number) {
  return {
    id: s.id,
    goal: s.goal,
    startedAt: s.startedAt,
    endedAt: now,
    stepsDone: s.steps.filter((x) => x.done).length,
    stepsTotal: s.steps.length,
    parked: state.parked.filter((p) => p.createdAt >= s.startedAt).length,
    onSeconds: s.onSeconds,
    offSeconds: s.offSeconds,
    nudges: s.nudges
  }
}

/** Key used to store reading progress: URL without the hash. */
export function progressKey(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.toString()
  } catch {
    return url
  }
}
