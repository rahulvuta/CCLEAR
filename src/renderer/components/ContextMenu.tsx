import { useEffect, useRef } from 'react'

export type ContextMenuEntry =
  | { type: 'item'; label: string; action: () => void; danger?: boolean; disabled?: boolean }
  | { type: 'separator' }

type Props = {
  x: number
  y: number
  items: ContextMenuEntry[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const maxX = typeof window !== 'undefined' ? window.innerWidth - 220 : x
  const maxY = typeof window !== 'undefined' ? window.innerHeight - 12 : y
  const left = Math.max(8, Math.min(x, maxX))
  const top = Math.max(8, Math.min(y, maxY))

  return (
    <div ref={ref} className="ctxMenu" style={{ left, top }} role="menu">
      {items.map((item, i) => {
        if (item.type === 'separator') return <div key={`s-${i}`} className="ctxMenuSep" />
        return (
          <button
            key={`${item.label}-${i}`}
            type="button"
            className={`ctxMenuItem${item.danger ? ' ctxMenuDanger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              item.action()
              onClose()
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
