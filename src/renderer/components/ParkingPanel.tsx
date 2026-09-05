import { useEffect, useState } from 'react'
import type { ParkedItem } from '../../shared/session'

type Props = {
  items: ParkedItem[]
  onClose: () => void
  onRestore: (item: ParkedItem) => void
  onDelete: (id: string) => void
  onAddThought: (text: string) => void
}

function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}

/** Right-aligned drawer: things set aside so they stop competing for attention. */
export function ParkingPanel({ items, onClose, onRestore, onDelete, onAddThought }: Props) {
  const [text, setText] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="parkPanel" role="dialog" aria-label="Parking lot">
      <div className="parkHead">
        <strong>Parking lot</strong>
        <button type="button" className="iconBtn" aria-label="Close parking lot" onClick={onClose}>×</button>
      </div>
      <p className="parkHint">Set things aside now, come back when you have time. ⇧⌘P parks the current tab.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) {
            onAddThought(text.trim())
            setText('')
          }
        }}
      >
        <input className="sessionInput" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Park a thought (e.g. email Ms. Lee)" maxLength={200} />
      </form>
      <ul className="parkList">
        {items.length === 0 && <li className="popEmpty">Nothing parked.</li>}
        {items.map((it) => (
          <li key={it.id} className="parkItem">
            <div className="parkMain">
              <span className="parkTitle" title={it.url}>{it.kind === 'tab' ? it.title || it.url : it.title}</span>
              <span className="parkMeta">{it.kind === 'tab' ? 'Tab' : 'Thought'} · {ago(it.createdAt)}{it.note ? ` · ${it.note}` : ''}</span>
            </div>
            {it.kind === 'tab' && <button type="button" className="sessionBtn" onClick={() => onRestore(it)}>Reopen</button>}
            <button type="button" className="stepRemove" aria-label={`Delete ${it.title}`} onClick={() => onDelete(it.id)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
