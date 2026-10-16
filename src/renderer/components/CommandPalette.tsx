import { useEffect, useMemo, useRef, useState } from 'react'
import { filterCommands, type Command } from '../../shared/palette'

type Props = {
  mode?: 'all' | 'tabs'
  commands: Command[]
  /** Builds the always-available "do something with what I typed" entries. */
  dynamic: (query: string) => Command[]
  onClose: () => void
}

export function CommandPalette({ mode = 'all', commands, dynamic, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const results = useMemo(() => {
    const available = mode === 'tabs' ? commands.filter((command) => command.group === 'Tabs') : commands
    const matched = filterCommands(query, available, 10)
    return query.trim() && mode === 'all' ? [...matched, ...dynamic(query.trim())] : matched
  }, [query, commands, dynamic, mode])

  useEffect(() => setIndex(0), [query, mode])
  useEffect(() => {
    listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const run = (c: Command | undefined) => {
    if (!c) return
    onClose()
    // let the palette unmount before the command moves focus around
    setTimeout(c.run, 0)
  }

  return (
    <div className="paletteBackdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label={mode === 'tabs' ? 'Search tabs' : 'Command palette'}>
        <input
          className="paletteInput"
          autoFocus
          value={query}
          placeholder={mode === 'tabs' ? 'Search open tabs…' : 'Type a command, tab, or question…'}
          aria-controls="palette-list"
          aria-activedescendant={results[index] ? `pal-${results[index].id}` : undefined}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => Math.min(results.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(results[index])
            }
          }}
        />
        <ul className="paletteList" id="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <li className="paletteEmpty">No matches</li>}
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`pal-${c.id}`}
              role="option"
              aria-selected={i === index}
              className={`paletteItem${i === index ? ' paletteActive' : ''}`}
              onMouseMove={() => setIndex(i)}
              onClick={() => run(c)}
            >
              <span className="paletteGroup">{c.group}</span>
              <span className="paletteTitle">{c.title}</span>
              {c.hint && <span className="paletteHint">{c.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
