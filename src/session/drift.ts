import type { AssistLevel, Verdict } from '../shared/session'

export type DriftConfig = { dwellMs: number; cooldownMs: number; maxPerHour: number }

/** null = never nudge. Tuned conservative: a nudge is an interruption, so it has to be rare. */
export const DRIFT_PRESETS: Record<AssistLevel, DriftConfig | null> = {
  off: null,
  quiet: { dwellMs: 120_000, cooldownMs: 15 * 60_000, maxPerHour: 2 },
  balanced: { dwellMs: 45_000, cooldownMs: 8 * 60_000, maxPerHour: 4 },
  coach: { dwellMs: 20_000, cooldownMs: 4 * 60_000, maxPerHour: 8 }
}

export type DriftState = {
  /** What we are currently timing: tab+host, and since when. */
  key: string | null
  offSince: number | null
  lastNudgeAt: number
  snoozeUntil: number
  recent: number[]
}

export const INITIAL_DRIFT: DriftState = { key: null, offSince: null, lastNudgeAt: -Infinity, snoozeUntil: 0, recent: [] }

export type DriftInput = {
  now: number
  /** tabId + host of the page being looked at. */
  key: string
  verdict: Verdict
  /** The CCLEAR window is focused and the user is actually looking at this tab. */
  attending: boolean
}

/** Pure step: feed it the current observation (every second or so); it says whether to nudge now. */
export function driftStep(state: DriftState, input: DriftInput, cfg: DriftConfig | null): { state: DriftState; fire: boolean } {
  if (!cfg) return { state: { ...state, key: input.key, offSince: null }, fire: false }

  const { offSince, key } = state
  if (input.verdict !== 'off' || !input.attending) {
    return { state: { ...state, key: input.key, offSince: null }, fire: false }
  }
  if (key !== input.key || offSince === null) {
    return { state: { ...state, key: input.key, offSince: input.now }, fire: false }
  }

  const recent = state.recent.filter((t) => input.now - t < 3_600_000)
  const due =
    input.now - offSince >= cfg.dwellMs &&
    input.now - state.lastNudgeAt >= cfg.cooldownMs &&
    input.now >= state.snoozeUntil &&
    recent.length < cfg.maxPerHour
  if (!due) return { state: { ...state, recent }, fire: false }
  return { state: { ...state, offSince: input.now, lastNudgeAt: input.now, recent: [...recent, input.now] }, fire: true }
}

export function snooze(state: DriftState, now: number, ms: number): DriftState {
  return { ...state, snoozeUntil: now + ms, offSince: null }
}
