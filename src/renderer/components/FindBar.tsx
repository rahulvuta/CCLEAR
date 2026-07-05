import { useEffect, useRef } from 'react'

type Props = {
  open: boolean
  query: string
  setQuery: (q: string) => void
  activeMatch: number
  matchCount: number
  onFind: (forward: boolean) => void
  onClose: () => void
}

export function FindBar({ open, query, setQuery, activeMatch, matchCount, onFind, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="findBar" role="search">
      <input
        ref={inputRef}
        className="findBarInput"
        value={query}
        placeholder="Find in page"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onFind(!e.shiftKey)
          }
          if (e.key === 'Escape') onClose()
        }}
      />
      <span className="findBarCount">
        {query && matchCount > 0 ? `${activeMatch} of ${matchCount}` : query ? 'No matches' : ''}
      </span>
      <button type="button" className="iconBtn" title="Previous" onClick={() => onFind(false)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>
      <button type="button" className="iconBtn" title="Next" onClick={() => onFind(true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <button type="button" className="iconBtn" title="Close" onClick={onClose}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
