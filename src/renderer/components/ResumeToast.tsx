import { useEffect } from 'react'

type Props = { text: string; onResume: () => void; onDismiss: () => void }

export function ResumeToast({ text, onResume, onDismiss }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 15000)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <div className="resumeToast" role="status" aria-live="polite">
      <span>{text}</span>
      <button type="button" className="nudgeBtn nudgePrimary" onClick={onResume}>Pick up here</button>
      <button type="button" className="nudgeLink" onClick={onDismiss}>Start at top</button>
    </div>
  )
}
