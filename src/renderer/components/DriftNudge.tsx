import { useEffect, useRef } from 'react'
import type { Nudge } from '../hooks/useDrift'

type Props = {
  nudge: Nudge
  goal: string
  onBack: () => void
  onRelevant: () => void
  onPark: () => void
  onSnooze: () => void
  onDismiss: () => void
}

/** Quiet, non-modal check-in. Never steals focus from the page; Esc dismisses. */
export function DriftNudge({ nudge, goal, onBack, onRelevant, onPark, onSnooze, onDismiss }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <div className="nudge" role="status" aria-live="polite" ref={ref}>
      <div className="nudgeText">
        <strong>Is “{(nudge.title || nudge.host || 'this page').slice(0, 60)}” part of your goal?</strong>
        <span className="nudgeGoal">Goal: {goal}</span>
      </div>
      <div className="nudgeBtns">
        <button type="button" className="nudgeBtn nudgePrimary" onClick={onBack}>Back to task</button>
        <button type="button" className="nudgeBtn" onClick={onRelevant}>This is relevant</button>
        <button type="button" className="nudgeBtn" onClick={onPark}>Park it</button>
        <button type="button" className="nudgeLink" onClick={onSnooze}>Snooze 10 min</button>
      </div>
    </div>
  )
}
