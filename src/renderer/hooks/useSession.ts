import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { EMPTY_SESSION_STATE, type SessionState } from '../../shared/session'
import { reduceSession, type SessionAction } from '../../session/store'

/** Session state that survives restarts (goal, steps, parked items, reading progress, settings). */
export function useSession() {
  const [state, dispatch] = useReducer(reduceSession, EMPTY_SESSION_STATE)
  const [ready, setReady] = useState(false)
  const [restored, setRestored] = useState<SessionState | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    window.cclearBrowser.session
      .load()
      .then((saved) => {
        if (cancelled) return
        if (saved) {
          dispatch({ type: 'hydrate', state: saved })
          setRestored(saved)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void window.cclearBrowser.session.save(state).catch(() => {})
    }, 400)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [state, ready])

  // Flush on close so the last few seconds of state are not lost.
  const stateRef = useRef(state)
  stateRef.current = state
  useEffect(() => {
    const flush = () => void window.cclearBrowser.session.save(stateRef.current).catch(() => {})
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  const startGoal = useCallback(async (goal: string) => {
    const g = goal.trim()
    if (!g) return
    dispatch({ type: 'start', goal: g, id: crypto.randomUUID(), now: Date.now() })
    const steps = await window.cclearBrowser.session.suggestSteps(g).catch(() => [])
    if (steps.length) dispatch({ type: 'setSteps', steps, idGen: () => crypto.randomUUID() })
  }, [])

  const act = useCallback((a: SessionAction) => dispatch(a), [])

  return { state, dispatch: act, ready, restored, startGoal }
}
