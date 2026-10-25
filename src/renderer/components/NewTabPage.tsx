import { useState, useEffect } from 'react'

import type { ParkedItem, ReadingProgress, Session } from '../../shared/session'

export type NewTabSessionProps = {
  session: Session | null
  parked: ParkedItem[]
  recentProgress: ReadingProgress[]
  onStartGoal: (goal: string) => void
  onEndGoal: () => void
  onToggleStep: (id: string) => void
  onAddStep: (text: string) => void
  onRemoveStep: (id: string) => void
  onOpenParking: () => void
  onRestoreParked: (item: ParkedItem) => void
  stepsLoading: boolean
}

type Props = {
  onNavigate: (url: string) => void
  recentHistory: string[]
} & NewTabSessionProps

const DEFAULT_LINKS = [
  { name: 'Google', url: 'https://google.com' },
  { name: 'YouTube', url: 'https://youtube.com' },
  { name: 'Wikipedia', url: 'https://wikipedia.org' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'News', url: 'https://news.ycombinator.com' },
]

function initialLinks() {
  try {
    const demo = localStorage.getItem('cclear.demoUrl')
    if (demo) {
      return [
        { name: 'Industrial Revolution', url: `${demo}/industrial-revolution.html` },
        { name: 'Minecraft clips', url: `${demo}/gaming-clips.html` },
        { name: 'Wikipedia', url: 'https://wikipedia.org' }
      ]
    }
    const saved = JSON.parse(localStorage.getItem('cclear.shortcuts.v1') || 'null')
    if (Array.isArray(saved) && saved.length <= 6 && saved.every((link) =>
      typeof link?.name === 'string' && typeof link?.url === 'string' && /^https?:\/\//i.test(link.url)
    )) return saved as typeof DEFAULT_LINKS
  } catch {
    // ignore
  }
  return DEFAULT_LINKS
}

const FOCUS_TIPS = [
  'Break a large task into one small next step.',
  'Keep the tab you need. Park the rest for later.',
  'If a page is hard to read, try Reading or Simplify.',
  'A short pause can make the next step clearer.',
]

let recommendedOnce = false

export function NewTabPage({ onNavigate, recentHistory, session, parked, recentProgress, onStartGoal, onEndGoal, onToggleStep, onAddStep, onRemoveStep, onOpenParking, onRestoreParked, stepsLoading }: Props) {
  const [goalDraft, setGoalDraft] = useState('')
  const [stepDraft, setStepDraft] = useState('')
  const [addingLink, setAddingLink] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const [tipIndex, setTipIndex] = useState(0)
  const [time, setTime] = useState(new Date())
  const [links, setLinks] = useState(initialLinks)

  useEffect(() => {
    setTipIndex(Math.floor(Math.random() * FOCUS_TIPS.length))
    const timer = setInterval(() => setTime(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (recommendedOnce || !recentHistory || recentHistory.length === 0) return
    if (localStorage.getItem('cclear.shortcuts.v1')) return
    recommendedOnce = true
    window.cclearBrowser.ai.recommendLinks(recentHistory).then((recs) => {
      if (recs && recs.length > 0) {
        setLinks(recs)
      }
    }).catch(() => {})
  }, [recentHistory])

  useEffect(() => {
    localStorage.setItem('cclear.shortcuts.v1', JSON.stringify(links))
  }, [links])

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
  const dateStr = time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
  const completedSteps = session?.steps.filter((step) => step.done).length ?? 0
  const nextStepId = session?.steps.find((step) => !step.done)?.id

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

  const handleAddLink = (e?: React.FormEvent) => {
    e?.preventDefault()
    const url = linkDraft.trim()
    setAddingLink(false)
    setLinkDraft('')
    if (!url) return
    let finalUrl = url
    if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl
    let name = 'New Link'
    try {
      const host = new URL(finalUrl).hostname
      name = host.startsWith('www.') ? host.slice(4) : host
      name = name.split('.')[0]
      name = name.charAt(0).toUpperCase() + name.slice(1)
    } catch {
      return
    }
    setLinks((prev) => (prev.length >= 6 ? prev : [...prev, { name, url: finalUrl }]))
  }

  return (
    <div className="ntpRoot">
      <div className="ntpContent">
        <header className="ntpHeader">
          <div className="ntpIdentity"><span className="ntpIdentityMark">C</span><span>CCLEAR</span></div>
          <div className="ntpHeaderActions">
            <time className="ntpClock" dateTime={time.toISOString()}>{dateStr} · {timeStr}</time>
            <button type="button" className="ntpHeaderBtn" onClick={onOpenParking}>Parked{parked.length ? ` · ${parked.length}` : ''}</button>
          </div>
        </header>

        <div className="ntpLead">
          <span className="ntpEyebrow">A fresh page</span>
          <h1 className="ntpGreeting">{greeting}.</h1>
          <p className="ntpSlogan">Start with the next useful step.</p>
        </div>

        <form className="ntpSearchForm" onSubmit={handleSearch}>
          <div className="ntpSearchWrap">
            <svg className="ntpSearchIcon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="ntpSearchInput"
              type="text"
              aria-label="Search or enter a web address"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search the web or enter an address"
              autoFocus
            />
            <span className="ntpSearchHint">↵</span>
          </div>
        </form>

        <div className="ntpGrid">
          {session ? (
            <section className="ntpGoal" aria-label="Current focus">
              <div className="ntpGoalTop">
                <div>
                  <span className="ntpGoalLabel">Current focus</span>
                  <h2 className="ntpGoalText">{session.goal}</h2>
                </div>
                {session.steps.length > 0 && <span className="ntpProgressCount">{completedSteps}<span>/{session.steps.length}</span></span>}
              </div>
              {session.steps.length > 0 && (
                <>
                  <div className="ntpProgressTrack" aria-label={`${completedSteps} of ${session.steps.length} steps complete`}>
                    <div style={{ width: `${completedSteps / session.steps.length * 100}%` }} />
                  </div>
                  <div className="ntpStepHeading">Your steps</div>
                  <ul className="ntpSteps">
                    {session.steps.map((step) => (
                      <li key={step.id} className={step.id === nextStepId ? 'ntpStepNext' : ''}>
                        <label>
                          <input type="checkbox" checked={step.done} onChange={() => onToggleStep(step.id)} />
                          <span className={step.done ? 'stepDone' : ''}>{step.text}</span>
                        </label>
                        {step.id === nextStepId && <span className="ntpNextBadge">Next</span>}
                        <button type="button" className="ntpStepRemove" aria-label={`Remove step ${step.text}`} onClick={() => onRemoveStep(step.id)}>×</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {session.steps.length === 0 && <p className="ntpEmpty">{stepsLoading ? 'Planning steps…' : 'Add one small step to get started.'}</p>}
              <div className="ntpGoalFooter">
                <form className="ntpStepAdd" onSubmit={(e) => { e.preventDefault(); if (stepDraft.trim()) { onAddStep(stepDraft.trim()); setStepDraft('') } }}>
                  <input value={stepDraft} onChange={(e) => setStepDraft(e.target.value)} aria-label="Add a step" placeholder="Add a step" maxLength={160} />
                  <button type="submit" disabled={!stepDraft.trim()}>Add</button>
                </form>
                <button type="button" className="ntpFinish" onClick={onEndGoal}>Finish focus</button>
              </div>
            </section>
          ) : (
            <form
              className="ntpGoalForm"
              onSubmit={(e) => {
                e.preventDefault()
                if (goalDraft.trim()) {
                  onStartGoal(goalDraft)
                  setGoalDraft('')
                }
              }}
            >
              <span className="ntpGoalLabel">Start here</span>
              <label htmlFor="ntp-goal" className="ntpGoalText">What do you want to get done?</label>
              <p className="ntpEmpty">A short goal is enough. CCLEAR will help you break it down.</p>
              <div className="ntpGoalEntry">
                <input id="ntp-goal" className="ntpGoalInput" value={goalDraft} onChange={(e) => setGoalDraft(e.target.value)} placeholder="e.g. Finish my history essay" maxLength={200} />
                <button type="submit" className="sessionBtn sessionBtnPrimary" disabled={!goalDraft.trim()}>Start focus</button>
              </div>
            </form>
          )}

          <aside className="ntpAside">
            {(parked.length > 0 || recentProgress.length > 0) && (
              <section className="ntpSideSection" aria-label="Continue where you left off">
                <h2 className="ntpSectionTitle">Continue</h2>
                <div className="ntpResume">
                  {recentProgress.slice(0, 3).map((progress) => (
                    <button key={progress.url} type="button" className="ntpResumeItem" onClick={() => onNavigate(progress.url)} title={progress.url}>
                      <span className="ntpResumeIcon" aria-hidden="true">↗</span>
                      <span className="ntpResumeCopy"><span className="ntpResumeTitle">{progress.title || progress.url}</span><span className="ntpResumeMeta">{progress.heading ? `${progress.heading} · ` : ''}{Math.round(progress.ratio * 100)}% read</span></span>
                    </button>
                  ))}
                  {parked.filter((item) => item.kind === 'tab').slice(0, 3).map((item) => (
                    <button key={item.id} type="button" className="ntpResumeItem" onClick={() => onRestoreParked(item)} title={item.url}>
                      <span className="ntpResumeIcon" aria-hidden="true">↗</span>
                      <span className="ntpResumeCopy"><span className="ntpResumeTitle">{item.title}</span><span className="ntpResumeMeta">Parked tab</span></span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="ntpSideSection" aria-label="Shortcuts">
              <h2 className="ntpSectionTitle">Shortcuts</h2>
              <div className="ntpLinks">
                {links.map((link, idx) => (
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
                    <button type="button" className="ntpLinkCard" onClick={() => onNavigate(link.url)} title={link.url}>
                      <span className="ntpLinkIcon" aria-hidden="true">{link.name.charAt(0).toUpperCase()}</span>
                      <span className="ntpLinkName">{link.name}</span>
                    </button>
                    <button type="button" className="ntpLinkDelete" aria-label={`Remove ${link.name} shortcut`} title="Remove shortcut" onClick={() => removeLink(link.url)}>×</button>
                  </div>
                ))}
                {addingLink && (
                  <form className="ntpAddForm" onSubmit={handleAddLink}>
                    <input className="sessionInput" aria-label="Shortcut URL" autoFocus value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} onBlur={() => handleAddLink()} placeholder="example.com" />
                  </form>
                )}
                {links.length < 6 && !addingLink && (
                  <button type="button" className="ntpLinkCard ntpLinkAdd" onClick={() => setAddingLink(true)} title="Add shortcut">
                    <span className="ntpLinkIcon" aria-hidden="true">+</span><span className="ntpLinkName">Add shortcut</span>
                  </button>
                )}
              </div>
            </section>
          </aside>
        </div>

        <div className="ntpTip">
          <span className="ntpTipLabel">Keep in mind</span>
          <span>{FOCUS_TIPS[tipIndex]}</span>
        </div>
      </div>
    </div>
  )
}
