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
    simplifyBusy
  } = props

  return (
    <header className="topRow">
      <div className="navCluster">
        <button type="button" className="iconBtn" title="Back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <button type="button" className="iconBtn" title="Forward" onClick={onForward}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <button type="button" className="iconBtn" title="Reload" onClick={onReload}>
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
          value={navUrl}
          onChange={(e) => setNavUrl(e.target.value)}
          placeholder="Search or enter address"
          spellCheck={false}
        />
      </form>
      <div className="toolbarRight">
        {focusModeEnabled && (
          <span className="simplifyStatus" style={{ fontSize: '12px', color: 'var(--muted)', marginRight: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {simplifyBusy ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spinning"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                Simplifying...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Simplified
              </>
            )}
          </span>
        )}
        <label className="toggle">
          <input
            className="switch"
            type="checkbox"
            checked={focusModeEnabled}
            onChange={(e) => setFocusModeEnabled(e.target.checked)}
          />
          Focus mode
        </label>
      </div>
    </header>
  )
}
