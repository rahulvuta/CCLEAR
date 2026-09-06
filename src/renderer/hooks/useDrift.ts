import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssistLevel, Session, Verdict } from '../../shared/session'
import { DRIFT_PRESETS, driftStep, INITIAL_DRIFT, snooze, type DriftConfig, type DriftState } from '../../session/drift'
import { scoreRelevance } from '../../session/relevance'
import type { UITab } from '../components/TabStrip'

export type TabVerdict = { verdict: Verdict; reason: string }
export type Nudge = { tabId: string; url: string; title: string; host: string; reason: string }

type Params = {
  tabs: UITab[]
  activeId: string
  session: Session | null
  assistLevel: AssistLevel
  /** Visible text of a tab, used only to help judge pages the cheap scorer is unsure about. */
  getText: (tabId: string) => Promise<string>
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Demo mode shortens dwell so a live demo does not have to wait; set localStorage['cclear.demo']='1'. */
function demoScale(): number {
  try {
    return localStorage.getItem('cclear.demo') === '1' ? 1 / 8 : 1
  } catch {
    return 1
  }
}

export function useDrift({ tabs, activeId, session, assistLevel, getText }: Params) {
  const [judged, setJudged] = useState<Record<string, { relevant: boolean; why: string }>>({})
  const [nudge, setNudge] = useState<Nudge | null>(null)
  const driftRef = useRef<DriftState>(INITIAL_DRIFT)
  const inflight = useRef(new Set<string>())
  /** Seconds spent on-task / off-task and nudges shown since the last read. */
  const counters = useRef({ on: 0, off: 0, nudges: 0 })

  const goalKey = session ? `${session.id}|${session.goal}` : ''
  const stepsText = useMemo(() => session?.steps.map((s) => s.text).join('|') ?? '', [session?.steps])
  const allowed = session?.allowedHosts

  // New goal => forget what we judged and timed for the old one.
  useEffect(() => {
    setJudged({})
    setNudge(null)
    driftRef.current = INITIAL_DRIFT
  }, [goalKey])

  const verdicts = useMemo(() => {
    const out: Record<string, TabVerdict> = {}
    if (!session) return out
    for (const t of tabs) {
      const rel = scoreRelevance(
        { goal: session.goal, steps: session.steps.map((s) => s.text), allowedHosts: session.allowedHosts },
        { url: t.url, title: t.title }
      )
      let verdict = rel.verdict
      let reason = rel.reason
      if (verdict === 'unsure') {
        const j = judged[`${goalKey}|${t.url}`]
        if (j) {
          verdict = j.relevant ? 'on' : 'off'
          reason = j.why || (j.relevant ? 'Related to your goal' : 'Not related to your goal')
        }
      }
      out[t.id] = { verdict, reason }
    }
    return out
    // stepsText/allowed make this recompute when the goal context changes
  }, [tabs, session, judged, goalKey, stepsText, allowed])

  // Ask the local model about the active page when the cheap scorer cannot tell.
  const active = tabs.find((t) => t.id === activeId)
  useEffect(() => {
    if (!session || assistLevel === 'off' || !active || !active.url || active.url === 'about:blank') return
    const v = verdicts[active.id]
    const key = `${goalKey}|${active.url}`
    if (!v || v.verdict !== 'unsure' || judged[key] || inflight.current.has(key)) return
    const timer = setTimeout(async () => {
      inflight.current.add(key)
      try {
        const text = await getText(active.id).catch(() => '')
        const res = await window.cclearBrowser.session.judge({
          goal: session.goal,
          steps: session.steps.map((s) => s.text),
          title: active.title,
          url: active.url,
          text
        })
        if (res) setJudged((p) => ({ ...p, [key]: res }))
      } finally {
        inflight.current.delete(key)
      }
    }, 3500)
    return () => clearTimeout(timer)
  }, [session, assistLevel, active?.id, active?.url, active?.title, verdicts, judged, goalKey, getText])

  // One-second heartbeat feeding the pure drift state machine.
  const latest = useRef({ verdicts, active, assistLevel, session })
  latest.current = { verdicts, active, assistLevel, session }
  useEffect(() => {
    const timer = setInterval(() => {
      const { verdicts: vs, active: a, assistLevel: level, session: s } = latest.current
      const base = DRIFT_PRESETS[level]
      const scale = demoScale()
      const cfg: DriftConfig | null = base && { ...base, dwellMs: base.dwellMs * scale, cooldownMs: base.cooldownMs * scale }
      if (!s || !a || !cfg) {
        driftRef.current = { ...driftRef.current, offSince: null }
        return
      }
      const host = hostOf(a.url)
      const v = vs[a.id]?.verdict ?? 'on'
      if (document.hasFocus()) {
        if (v === 'off') counters.current.off += 1
        else if (v === 'on') counters.current.on += 1
      }
      const r = driftStep(
        driftRef.current,
        { now: Date.now(), key: `${a.id}|${host}`, verdict: host ? v : 'on', attending: document.hasFocus() && !document.hidden },
        cfg
      )
      driftRef.current = r.state
      if (r.fire) counters.current.nudges += 1
      if (r.fire) setNudge({ tabId: a.id, url: a.url, title: a.title, host, reason: vs[a.id]?.reason ?? '' })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // The nudge is moot once the user has moved on by themselves.
  useEffect(() => {
    if (nudge && (activeId !== nudge.tabId || active?.url !== nudge.url)) setNudge(null)
  }, [nudge, activeId, active?.url])

  return {
    verdicts,
    nudge,
    /** Reads and resets the counters. */
    takeCounters: () => {
      const c = counters.current
      counters.current = { on: 0, off: 0, nudges: 0 }
      return c
    },
    dismissNudge: () => setNudge(null),
    snoozeNudge: (ms = 10 * 60_000) => {
      driftRef.current = snooze(driftRef.current, Date.now(), ms)
      setNudge(null)
    }
  }
}
