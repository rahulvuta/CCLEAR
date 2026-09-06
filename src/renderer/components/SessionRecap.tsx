import { useEffect } from 'react'
import type { Recap } from '../../session/recap'

type Props = { recap: Recap; onNewGoal: () => void; onClose: () => void }

export function SessionRecap({ recap, onNewGoal, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="paletteBackdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="recapCard" role="dialog" aria-label="Session recap">
        <h2>{recap.headline}</h2>
        <p className="recapGoal">{recap.goal}</p>
        <dl className="recapStats">
          <div><dt>Time</dt><dd>{recap.minutes} min</dd></div>
          {recap.stepsTotal > 0 && <div><dt>Steps</dt><dd>{recap.stepsDone} / {recap.stepsTotal}</dd></div>}
          {recap.onTaskPct !== null && <div><dt>On task</dt><dd>{recap.onTaskPct}%</dd></div>}
          <div><dt>Parked</dt><dd>{recap.parked}</dd></div>
        </dl>
        <div className="nudgeBtns" style={{ justifyContent: 'center' }}>
          <button type="button" className="nudgeBtn nudgePrimary" autoFocus onClick={onNewGoal}>Start another goal</button>
          <button type="button" className="nudgeBtn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
