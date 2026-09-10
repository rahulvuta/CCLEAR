import { useEffect, useState } from 'react'

type Props = { host: string; goal?: string; seconds?: number; onContinue: () => void; onLeave: () => void }

/** A deliberate pause, not a block: wait a few seconds, then choose. */
export function FrictionGate({ host, goal, seconds = 8, onContinue, onLeave }: Props) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return (
    <div className="frictionGate" role="alertdialog" aria-label={`Pause before ${host}`}>
      <div className="frictionCard">
        <h2>Quick pause</h2>
        <p>You are about to open <strong>{host}</strong>.</p>
        {goal && <p className="frictionGoal">Your goal: {goal}</p>}
        <p>Take a breath. Is this what you want to be doing right now?</p>
        <div className="nudgeBtns">
          <button type="button" className="nudgeBtn nudgePrimary" onClick={onLeave} autoFocus>Go back to my task</button>
          <button type="button" className="nudgeBtn" disabled={left > 0} onClick={onContinue}>
            {left > 0 ? `Continue in ${left}…` : 'Continue anyway'}
          </button>
        </div>
      </div>
    </div>
  )
}
