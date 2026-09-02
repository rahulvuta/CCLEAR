import type { Session } from '../shared/session'

export type Recap = {
  goal: string
  minutes: number
  onTaskPct: number | null
  stepsDone: number
  stepsTotal: number
  parked: number
  nudges: number
  /** One plain, kind sentence. No streaks, no guilt. */
  headline: string
}

export type RecapInput = {
  session: Session
  now: number
  onSeconds: number
  offSeconds: number
  nudges: number
  parkedDuring: number
}

export function buildRecap(i: RecapInput): Recap {
  const minutes = Math.max(1, Math.round((i.now - i.session.startedAt) / 60000))
  const timed = i.onSeconds + i.offSeconds
  const onTaskPct = timed >= 60 ? Math.round((i.onSeconds / timed) * 100) : null
  const stepsDone = i.session.steps.filter((s) => s.done).length
  const stepsTotal = i.session.steps.length

  let headline: string
  if (stepsTotal > 0 && stepsDone === stepsTotal) headline = 'You finished every step. Nice work.'
  else if (stepsDone > 0) headline = `You completed ${stepsDone} of ${stepsTotal} steps. That is real progress.`
  else if (i.parkedDuring > 0) headline = 'You set aside distractions to stay with your goal.'
  else headline = 'You gave this goal some focused time.'

  return { goal: i.session.goal, minutes, onTaskPct, stepsDone, stepsTotal, parked: i.parkedDuring, nudges: i.nudges, headline }
}
