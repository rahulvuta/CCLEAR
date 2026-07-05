import type { BookmarkItem } from '../../shared/types'
import { BookmarkStar } from './BookmarkStar'
import { OmniboxIcon } from './OmniboxIcon'

type Props = {
  navUrl: string
  setNavUrl: (url: string) => void
  pageTitle: string
  onGoUrl: () => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onStop: () => void
  onHome: () => void
  onOpenSettings: () => void
  loading: boolean
  bookmarks: BookmarkItem[]
  onBookmarksChange: () => void
  focusModeEnabled: boolean
  setFocusModeEnabled: (v: boolean | ((prev: boolean) => boolean)) => void | Promise<void>
  simplifyBusy?: boolean
}

export function TopBar(props: Props) {
  const {
    navUrl,
    setNavUrl,
    pageTitle,
    onGoUrl,
    onBack,
    onForward,
    onReload,
    onStop,
    onHome,
    onOpenSettings,
    loading,
    bookmarks,
    onBookmarksChange,
    focusModeEnabled,
    setFocusModeEnabled,
    simplifyBusy
  } = props

  return (
    <header className="topRow toolbarRow">
      <div className="navCluster">
        <button type="button" className="iconBtn" title="Back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <button type="button" className="iconBtn" title="Forward" onClick={onForward}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
        {loading ? (
          <button type="button" className="iconBtn" title="Stop" onClick={onStop}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        ) : (
          <button type="button" className="iconBtn" title="Reload" onClick={onReload}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        )}
        <button type="button" className="iconBtn" title="Home" onClick={onHome}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 11l9-8 9 8" />
            <path d="M5 10v10h14V10" />
          </svg>
        </button>
      </div>

      <form
        className="addrForm omniboxForm"
        onSubmit={(e) => {
          e.preventDefault()
          onGoUrl()
        }}
      >
        <div className="omnibox">
          <OmniboxIcon url={navUrl} />
          <input
            className="addrInput omniboxInput"
            value={navUrl}
            onChange={(e) => setNavUrl(e.target.value)}
            placeholder="Search Google or type a URL"
            spellCheck={false}
          />
          <BookmarkStar url={navUrl} title={pageTitle} bookmarks={bookmarks} onChange={onBookmarksChange} />
        </div>
      </form>

      <div className="toolbarRight">
        {focusModeEnabled && (
          <span className="simplifyStatus" title={simplifyBusy ? 'Simplifying page' : 'Page simplified'}>
            {simplifyBusy ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spinning" aria-hidden>
                  <line x1="12" y1="2" x2="12" y2="6" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                  <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                  <line x1="2" y1="12" x2="6" y2="12" />
                  <line x1="18" y1="12" x2="22" y2="12" />
                  <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                  <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                </svg>
                Simplifying
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Simplified
              </>
            )}
          </span>
        )}
        <button
          type="button"
          className={`iconBtn focusModeBtn${focusModeEnabled ? ' focusModeBtnActive' : ''}`}
          title={focusModeEnabled ? 'Turn off Focus mode' : 'Turn on Focus mode'}
          aria-pressed={focusModeEnabled}
          onClick={() => setFocusModeEnabled(!focusModeEnabled)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <button type="button" className="iconBtn" title="Settings" onClick={onOpenSettings}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  )
}
