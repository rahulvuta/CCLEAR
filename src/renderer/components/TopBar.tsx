type Props = {
  navUrl: string
  setNavUrl: (url: string) => void
  onGoUrl: () => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  focusModeEnabled: boolean
  setFocusModeEnabled: (v: boolean | ((prev: boolean) => boolean)) => void | Promise<void>
  simplifyBusy?: boolean
  readingOpen?: boolean
  onToggleReading?: () => void
  blockedCount?: number
  onOpenSettings?: () => void
  onOpenPalette?: () => void
}

export function TopBar(props: Props) {
  const {
    navUrl,
    setNavUrl,
    onGoUrl,
    onBack,
    onForward,
    onReload,
    focusModeEnabled,
    setFocusModeEnabled,
    simplifyBusy,
    readingOpen,
    onToggleReading,
    blockedCount,
    onOpenSettings,
    onOpenPalette
  } = props

  return (
    <header className="topRow">
      <span className="brand" aria-label="CCLEAR">C</span>
      <div className="navCluster">
        <button type="button" className="iconBtn" title="Back" aria-label="Back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <button type="button" className="iconBtn" title="Forward" aria-label="Forward" onClick={onForward}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <button type="button" className="iconBtn" title="Reload" aria-label="Reload" onClick={onReload}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
        </button>
      </div>
      <form
        className="addrForm"
        onSubmit={(e) => {
          e.preventDefault()
          onGoUrl()
        }}
      >
        <input
          className="addrInput"
          aria-label="Search or enter address"
          value={navUrl === 'about:blank' ? '' : navUrl}
          onChange={(e) => setNavUrl(e.target.value)}
          placeholder="Search or enter address"
          spellCheck={false}
        />
      </form>
      <div className="toolbarRight">
        {focusModeEnabled && (
          <span className="simplifyStatus" role="status">
            {simplifyBusy ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spinning"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                <span className="simplifyStatusText">Simplifying…</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span className="simplifyStatusText">Simplify on</span>
              </>
            )}
          </span>
        )}
        {typeof blockedCount === 'number' && blockedCount > 0 && (
          <button type="button" className="shieldBtn" onClick={onOpenSettings} title="Ads and trackers blocked on this page">
            {blockedCount} blocked
          </button>
        )}
        {onOpenPalette && (
          <button type="button" className="topReadBtn" onClick={onOpenPalette} title="Commands, tabs and questions (⌘⇧P)" aria-label="Open command palette">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.2 4.2"/></svg>
          </button>
        )}
        {onToggleReading && (
          <button type="button" className="topReadBtn" aria-expanded={readingOpen} onClick={onToggleReading} title="Reading tools: reader view, fonts, line focus">
            <span className="readingGlyph" aria-hidden="true">Aa</span><span className="toolbarLabel">Reading</span>
          </button>
        )}
        {onOpenSettings && (
          <button type="button" className="topReadBtn" onClick={onOpenSettings} aria-label="Settings" title="Settings">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          </button>
        )}
        <label className="toggle">
          <input
            className="switch"
            type="checkbox"
            checked={focusModeEnabled}
            onChange={(e) => setFocusModeEnabled(e.target.checked)}
          />
          <span>Simplify</span>
        </label>
      </div>
    </header>
  )
}
