import { useEffect, useRef, useState } from 'react'
import type { Session } from '../../shared/session'
import type { TabVerdict } from '../hooks/useDrift'

type Props = {
  session: Session | null
  verdict?: TabVerdict
  parkedCount: number
  stepsLoading: boolean
  onStart: (goal: string) => void
  onEnd: () => void
  onToggleStep: (id: string) => void
  onAddStep: (text: string) => void
  onRemoveStep: (id: string) => void
  onOpenParking: () => void
}

const VERDICT_LABEL = { on: 'On task', unsure: 'Not sure', off: 'Off task' } as const

function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, ref }
}

export function SessionBar(p: Props) {
  const [draft, setDraft] = useState('')
  const [stepDraft, setStepDraft] = useState('')
  const steps = usePopover()

  if (!p.session) {
    return (
      <form
        className="sessionBar sessionBarEmpty"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) {
            p.onStart(draft)
            setDraft('')
          }
        }}
      >
        <label className="sessionPrompt" htmlFor="cclear-goal-input">What are you here to do?</label>
        <input
          id="cclear-goal-input"
          className="sessionInput"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Write my APUSH essay on the Industrial Revolution"
          maxLength={200}
        />
        <button type="submit" className="sessionBtn sessionBtnPrimary" disabled={!draft.trim()}>Start</button>
        <button type="button" className="sessionBtn" onClick={p.onOpenParking} title="Parking lot (⇧⌘P parks this tab)">
          Parked{p.parkedCount ? ` · ${p.parkedCount}` : ''}
        </button>
      </form>
    )
  }

  const s = p.session
  const done = s.steps.filter((x) => x.done).length
  const v = p.verdict

  return (
    <div className="sessionBar" role="region" aria-label="Current goal">
      <span className="sessionLabel">Goal</span>
      <span className="sessionGoal" title={s.goal}>{s.goal}</span>

      {v && (
        <span className={`verdictChip verdict-${v.verdict}`} title={v.reason}>
          <span className="verdictDot" aria-hidden />
          {VERDICT_LABEL[v.verdict]}
        </span>
      )}

      <div className="popWrap" ref={steps.ref}>
        <button
          type="button"
          className="sessionBtn"
          aria-expanded={steps.open}
          onClick={() => steps.setOpen(!steps.open)}
        >
          {p.stepsLoading ? 'Planning…' : s.steps.length ? `Steps ${done}/${s.steps.length}` : 'Steps'}
        </button>
        {steps.open && (
          <div className="popPanel" role="dialog" aria-label="Steps">
            {s.steps.length === 0 && <div className="popEmpty">{p.stepsLoading ? 'Breaking your goal into steps…' : 'No steps yet. Add one below.'}</div>}
            <ul className="stepList">
              {s.steps.map((x) => (
                <li key={x.id} className="stepItem">
                  <label>
                    <input type="checkbox" checked={x.done} onChange={() => p.onToggleStep(x.id)} />
                    <span className={x.done ? 'stepDone' : ''}>{x.text}</span>
                  </label>
                  <button type="button" className="stepRemove" aria-label={`Remove step ${x.text}`} onClick={() => p.onRemoveStep(x.id)}>×</button>
                </li>
              ))}
            </ul>
            <form
              className="stepAdd"
              onSubmit={(e) => {
                e.preventDefault()
                if (stepDraft.trim()) {
                  p.onAddStep(stepDraft)
                  setStepDraft('')
                }
              }}
            >
              <input className="sessionInput" value={stepDraft} onChange={(e) => setStepDraft(e.target.value)} placeholder="Add a step" maxLength={160} />
            </form>
          </div>
        )}
      </div>

      <button type="button" className="sessionBtn" onClick={p.onOpenParking} title="Parking lot (⇧⌘P parks this tab)">
        Parked{p.parkedCount ? ` · ${p.parkedCount}` : ''}
      </button>

      <button type="button" className="sessionBtn sessionEnd" onClick={p.onEnd} title="Finish this goal">Done</button>
    </div>
  )
}
