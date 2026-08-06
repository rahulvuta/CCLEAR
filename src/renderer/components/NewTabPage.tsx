import { useState, useEffect } from 'react'

type Props = {
  onNavigate: (url: string) => void
  recentHistory: string[]
}

const DEFAULT_LINKS = [
  { name: 'Google', url: 'https://google.com' },
  { name: 'YouTube', url: 'https://youtube.com' },
  { name: 'Wikipedia', url: 'https://wikipedia.org' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'News', url: 'https://news.ycombinator.com' },
]

const FOCUS_TIPS = [
  "Break big tasks into small bites.",
  "One tab at a time. You've got this.",
  "Breathe in for 4, hold for 4, out for 4.",
  "What's the ONE thing you need to do right now?",
  "Progress, not perfection.",
  "Close the tabs you're not using.",
  "Set a 25-minute timer and focus on one thing.",
  "You don't have to finish — just start.",
]

export function NewTabPage({ onNavigate, recentHistory }: Props) {
  const [searchValue, setSearchValue] = useState('')
  const [tipIndex, setTipIndex] = useState(0)
  const [time, setTime] = useState(new Date())
  const [links, setLinks] = useState(DEFAULT_LINKS)

  useEffect(() => {
    setTipIndex(Math.floor(Math.random() * FOCUS_TIPS.length))
    const timer = setInterval(() => setTime(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!recentHistory || recentHistory.length === 0) return
    window.cclearBrowser.ai.recommendLinks(recentHistory).then((recs) => {
      if (recs && recs.length > 0) {
        setLinks(recs)
      }
    }).catch(() => {})
  }, [recentHistory])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchValue.trim()
    if (!q) return
    if (q.includes('.') && !q.includes(' ')) {
      onNavigate(q.startsWith('http') ? q : `https://${q}`)
    } else {
      onNavigate(`https://www.google.com/search?q=${encodeURIComponent(q)}`)
    }
  }

  const hours = time.getHours()
  let greeting = 'Good evening'
  if (hours < 12) greeting = 'Good morning'
  else if (hours < 17) greeting = 'Good afternoon'

  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const removeLink = (url: string) => {
    setLinks((prev) => prev.filter((l) => l.url !== url))
  }

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDraggedIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    // Optional: set drag image here
  }

  const handleDragEnter = (idx: number) => {
    if (draggedIdx === null || draggedIdx === idx) return
    setLinks(prev => {
      const copy = [...prev]
      const [moved] = copy.splice(draggedIdx, 1)
      copy.splice(idx, 0, moved)
      return copy
    })
    setDraggedIdx(idx)
  }

  const handleDragEnd = () => {
    setDraggedIdx(null)
  }

  const handleAddLink = () => {
    const url = prompt('Enter website URL (e.g., https://example.com):')
    if (!url) return
    let finalUrl = url.trim()
    if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl
    
    let name = 'New Link'
    try { 
      const host = new URL(finalUrl).hostname 
      name = host.startsWith('www.') ? host.slice(4) : host
      name = name.split('.')[0]
      name = name.charAt(0).toUpperCase() + name.slice(1)
    } catch {}
    
    setLinks(prev => {
      if (prev.length >= 6) return prev
      return [...prev, { name, url: finalUrl }]
    })
  }

  return (
    <div className="ntpRoot">
      {/* Ambient background shapes */}
      <div className="ntpAmbient">
        <div className="ntpOrb ntpOrb1" />
        <div className="ntpOrb ntpOrb2" />
        <div className="ntpOrb ntpOrb3" />
      </div>

      <div className="ntpContent">
        {/* Clock */}
        <div className="ntpClock">{timeStr}</div>

        {/* Brand */}
        <h1 className="ntpBrand">CCLEAR</h1>
        <p className="ntpSlogan">Clear mind. Clear focus.</p>

        {/* Greeting */}
        <p className="ntpGreeting">{greeting}</p>

        {/* Search */}
        <form className="ntpSearchForm" onSubmit={handleSearch}>
          <div className="ntpSearchWrap">
            <svg className="ntpSearchIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="ntpSearchInput"
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search or type a URL"
              autoFocus
            />
          </div>
        </form>

        {/* Quick links */}
        <div className="ntpLinks">
          {links.map((link, idx) => {
            let hostname = link.url
            try { hostname = new URL(link.url).hostname } catch {}
            return (
              <div 
                key={link.url} 
                className="ntpLinkWrapper"
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragEnter={() => handleDragEnter(idx)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                style={{ opacity: draggedIdx === idx ? 0.5 : 1 }}
              >
                <button
                  className="ntpLinkCard"
                  onClick={() => onNavigate(link.url)}
                  title={link.url}
                >
                  <img 
                    src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`} 
                    alt=""
                    style={{ width: 24, height: 24, borderRadius: 4, marginBottom: 2 }}
                    draggable="false"
                  />
                  <span className="ntpLinkName">{link.name}</span>
                </button>
                <button
                  type="button"
                  className="ntpLinkDelete"
                  title="Remove link"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeLink(link.url)
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )
          })}
          {links.length < 6 && (
            <div className="ntpLinkWrapper" style={{ opacity: draggedIdx !== null ? 0 : 1, transition: 'opacity 0.2s' }}>
              <button
                className="ntpLinkCard ntpLinkAdd"
                onClick={handleAddLink}
                title="Add shortcut"
              >
                <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <span className="ntpLinkName">Add shortcut</span>
              </button>
            </div>
          )}
        </div>

        {/* Focus tip */}
        <div className="ntpTip">
          <span className="ntpTipLabel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .5 2.2 1.5 3.1.8.9 1.3 1.5 1.5 2.5" />
              <line x1="9" y1="18" x2="15" y2="18" />
              <line x1="10" y1="22" x2="14" y2="22" />
            </svg>
          </span>
          <span>{FOCUS_TIPS[tipIndex]}</span>
        </div>
      </div>
    </div>
  )
}
