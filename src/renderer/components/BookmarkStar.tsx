import { useEffect, useMemo, useRef, useState } from 'react'
import type { BookmarkItem } from '../../shared/types'

type Props = {
  url: string
  title: string
  bookmarks: BookmarkItem[]
  onChange: () => void
}

function isBookmarkable(url: string): boolean {
  const t = url.trim()
  return !!t && !/^about:/i.test(t) && !/^cclear:/i.test(t)
}

export function BookmarkStar({ url, title, bookmarks, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [folderId, setFolderId] = useState<string>('')

  const existing = useMemo(
    () => bookmarks.find((b) => b.type === 'url' && b.url === url),
    [bookmarks, url]
  )
  const folders = useMemo(
    () => bookmarks.filter((b) => b.type === 'folder').sort((a, b) => a.title.localeCompare(b.title)),
    [bookmarks]
  )
  const canStar = isBookmarkable(url)

  useEffect(() => {
    if (!open) return
    setEditTitle(existing?.title || title || url)
    setFolderId(existing?.parentId ?? '')
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, existing, title, url])

  async function toggleStar() {
    if (!canStar) return
    if (existing) {
      setOpen(true)
      return
    }
    await window.cclearBrowser.bookmarks.add({
      type: 'url',
      title: title || url,
      url,
      parentId: null
    })
    onChange()
    setOpen(true)
  }

  async function saveEdit() {
    if (!existing) {
      setOpen(false)
      return
    }
    await window.cclearBrowser.bookmarks.update(existing.id, {
      title: editTitle.trim() || existing.title,
      parentId: folderId || null
    })
    onChange()
    setOpen(false)
  }

  async function remove() {
    if (!existing) return
    await window.cclearBrowser.bookmarks.remove(existing.id)
    onChange()
    setOpen(false)
  }

  return (
    <div className="bookmarkStarWrap" ref={wrapRef}>
      <button
        type="button"
        className={`iconBtn bookmarkStarBtn${existing ? ' bookmarkStarFilled' : ''}`}
        title={existing ? 'Edit bookmark' : 'Bookmark this page'}
        disabled={!canStar}
        aria-pressed={!!existing}
        onClick={() => void toggleStar()}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={existing ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </button>
      {open && existing && (
        <div className="bookmarkPopover">
          <div className="bookmarkPopoverTitle">Bookmark</div>
          <label className="chromeField">
            <span>Name</span>
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          </label>
          <label className="chromeField">
            <span>Folder</span>
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">Bookmarks bar</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.title}</option>
              ))}
            </select>
          </label>
          <div className="bookmarkPopoverActions">
            <button type="button" className="chromeBtn" onClick={() => void saveEdit()}>Done</button>
            <button type="button" className="chromeBtn chromeBtnGhost" onClick={() => void remove()}>Remove</button>
          </div>
        </div>
      )}
    </div>
  )
}
