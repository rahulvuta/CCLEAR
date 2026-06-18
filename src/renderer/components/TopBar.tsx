type Props = {
  navUrl: string
  setNavUrl: (url: string) => void
  onGoUrl: () => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  focusModeEnabled: boolean
  setFocusModeEnabled: (v: boolean | ((prev: boolean) => boolean)) => void | Promise<void>
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
    setFocusModeEnabled
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
