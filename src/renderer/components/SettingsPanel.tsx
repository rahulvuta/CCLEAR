import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { AssistLevel } from '../../shared/session'
import type { LedgerSummary } from '../../shared/ledger'
import { MARK_COLORS, MARK_COLOR_NAMES, markColor, type MarkColor } from '../../shared/markColors'

type Status = Awaited<ReturnType<typeof window.cclearBrowser.models.status>>

type Props = {
  assistLevel: AssistLevel
  onAssistLevel: (l: AssistLevel) => void
  frictionHosts: string[]
  onFriction: (host: string, on: boolean) => void
  eco: boolean
  onEco: (on: boolean) => void
  blockerEnabled: boolean
  onBlockerEnabled: (on: boolean) => void
  siteHost: string
  siteAllowed: boolean
  onSiteAllowed: (on: boolean) => void
  onClose: () => void
  onModelChanged: () => void
  onOpenOllama: () => void
}

const LEVELS: AssistLevel[] = ['off', 'quiet', 'balanced', 'coach']
type ThemeChoice = 'light' | 'dark' | 'system'
const THEMES: ThemeChoice[] = ['light', 'dark', 'system']

export function SettingsPanel(p: Props) {
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    const saved = document.documentElement.dataset.theme
    return saved === 'dark' || saved === 'system' ? saved : 'light'
  })
  const [highlightColor, setHighlightColor] = useState<MarkColor>(() => markColor(localStorage.getItem('cclear.highlightColor')))
  const [status, setStatus] = useState<Status | null>(null)
  const [pulling, setPulling] = useState<{ name: string; pct: number; text: string } | null>(null)
  const [pullError, setPullError] = useState('')
  const [host, setHost] = useState('')
  const [ledger, setLedger] = useState<LedgerSummary | null>(null)

  const refresh = useCallback(() => {
    window.cclearBrowser.models.status().then(setStatus).catch(() => setStatus(null))
  }, [])
  useEffect(refresh, [refresh])
  useEffect(() => {
    const load = () => window.cclearBrowser.ledger.get().then(setLedger).catch(() => {})
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [])
  useEffect(
    () =>
      window.cclearBrowser.models.onPullProgress((e) => {
        const pct = e.total ? Math.round((e.completed / e.total) * 100) : 0
        setPulling({ name: e.name, pct, text: e.status })
      }),
    []
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p])

  const pull = async (name: string) => {
    setPullError('')
    setPulling({ name, pct: 0, text: 'Starting…' })
    const r = await window.cclearBrowser.models.pull(name)
    setPulling(null)
    if (!r.ok) setPullError(r.error ?? 'Download failed')
    else {
      await window.cclearBrowser.models.select(name)
      p.onModelChanged()
    }
    refresh()
  }

  const chooseTheme = (choice: ThemeChoice) => {
    setTheme(choice)
    document.documentElement.dataset.theme = choice
    try { localStorage.setItem('cclear.theme', choice) } catch { /* preference stays until restart */ }
  }

  return (
    <div className="readPanel settingsPanel" role="dialog" aria-label="Settings">
      <div className="readHead">
        <strong>Settings</strong>
        <button type="button" className="iconBtn" aria-label="Close settings" onClick={p.onClose}>×</button>
      </div>

      <section className="setSection">
        <h3>Appearance</h3>
        <div className="segRow" role="radiogroup" aria-label="Color theme">
          {THEMES.map((choice) => (
            <button key={choice} type="button" role="radio" aria-checked={theme === choice} className={`segBtn${theme === choice ? ' segOn' : ''}`} onClick={() => chooseTheme(choice)}>
              {choice[0].toUpperCase() + choice.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="setSection">
        <h3>Default highlight color</h3>
        <p className="parkHint">Used when you or the assistant highlight without naming a color.</p>
        <div className="markColorChoices" role="radiogroup" aria-label="Default highlight color">
          {MARK_COLOR_NAMES.map((color) => (
            <button key={color} type="button" role="radio" aria-label={color} aria-checked={highlightColor === color} className="markColorChoice" style={{ '--mark-swatch': MARK_COLORS[color] } as CSSProperties} onClick={() => {
              setHighlightColor(color)
              localStorage.setItem('cclear.highlightColor', color)
              window.dispatchEvent(new Event('cclear:highlight-color'))
            }}><span /></button>
          ))}
        </div>
      </section>

      <section className="setSection">
        <h3>Local AI</h3>
        {!status && <p className="parkHint">Checking…</p>}
        {status && !status.ollama && (
          <div className="setWarn" role="alert">
            <p>Ollama is not running. Install and start it to use local AI. Browsing, goals, and manual steps still work.</p>
            <button type="button" className="sessionBtn sessionBtnPrimary" onClick={p.onOpenOllama}>Install Ollama</button>
          </div>
        )}
        {status?.ollama && !status.activeInstalled && (
          <div className="setWarn" role="alert">
            The model <code>{status.active}</code> is not installed yet.
          </div>
        )}
        {status && (
          <>
            <p className="parkHint">
              Your Mac has {status.ramGB} GB of memory. Recommended: <strong>{status.recommended.name}</strong> — {status.recommended.reason}
            </p>
            {status.ollama && (
              <label className="readRow">Model used for everything
                <select
                  value={status.active}
                  onChange={async (e) => {
                    await window.cclearBrowser.models.select(e.target.value)
                    p.onModelChanged()
                    refresh()
                  }}
                >
                  {!status.installed.some((m) => m.name === status.active) && <option value={status.active}>{status.active} (not installed)</option>}
                  {status.installed.filter((m) => !/llava|vision|embed/i.test(m.name)).map((m) => (
                    <option key={m.name} value={m.name}>{m.name} · {m.sizeGB} GB</option>
                  ))}
                </select>
              </label>
            )}
            {status.ollama && !status.installed.some((m) => m.name === status.recommended.name) && !pulling && (
              <button type="button" className="sessionBtn sessionBtnPrimary" onClick={() => void pull(status.recommended.name)}>
                Download {status.recommended.name}
              </button>
            )}
            {pulling && (
              <div className="pullBar" role="progressbar" aria-valuenow={pulling.pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="pullFill" style={{ width: `${pulling.pct}%` }} />
                <span>{pulling.name}: {pulling.text} {pulling.pct ? `${pulling.pct}%` : ''}</span>
                <button type="button" className="nudgeLink" onClick={() => void window.cclearBrowser.models.cancelPull(pulling.name)}>Cancel</button>
              </div>
            )}
            {pullError && <div className="readErr" role="alert">{pullError}</div>}
            {status.ollama && (
              <p className="parkHint">
                Simplify-mode rewrites are checked by{' '}
                {status.simplifyChecks === 'rules'
                  ? 'rules only (numbers, dates, grammar). For model fact-checking, install qwen3:8b. Every paragraph is one click from its original.'
                  : `${status.simplifyChecks} as a second reader. Every paragraph is one click from its original.`}
              </p>
            )}
            {status.ollama && !status.visionInstalled && (
              <p className="parkHint">Optional: “look at my screen” questions need <code>{status.vision}</code> (<code>ollama pull {status.vision}</code>).</p>
            )}
          </>
        )}
        <button type="button" className="nudgeLink" onClick={refresh}>Refresh</button>
      </section>

      <section className="setSection">
        <h3>Performance</h3>
        <label className="readSwitch">
          <input type="checkbox" checked={p.eco} onChange={(e) => { p.onEco(e.target.checked); setTimeout(refresh, 200) }} />
          <span>Lighter on my computer</span>
        </label>
        <p className="parkHint">
          Unloads the AI model from memory after 3 idle minutes (instead of 30), runs one AI task at a time, simplifies only what you are about to read, and skips the larger second model. Turn it off to let a larger installed model (qwen3:8b) double-check rewrites; that is slower and stricter, so it simplifies noticeably less.
        </p>
      </section>

      <section className="setSection">
        <h3>Check-ins</h3>
        <div className="segRow" role="radiogroup" aria-label="How often CCLEAR checks in">
          {LEVELS.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={p.assistLevel === l} className={`segBtn${p.assistLevel === l ? ' segOn' : ''}`} onClick={() => p.onAssistLevel(l)}>
              {l[0].toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="setSection">
        <h3>Distractions</h3>
        <label className="readSwitch"><input type="checkbox" checked={p.blockerEnabled} onChange={(e) => p.onBlockerEnabled(e.target.checked)} /><span>Block third-party ads and trackers</span></label>
        {p.siteHost && (
          <label className="readSwitch"><input type="checkbox" checked={!p.siteAllowed} disabled={!p.blockerEnabled} onChange={(e) => p.onSiteAllowed(!e.target.checked)} /><span>Block on {p.siteHost}</span></label>
        )}
        <p className="parkHint"><strong>Pause sites</strong> get a short “why are you here?” pause before they open.</p>
        <ul className="parkList">
          {p.frictionHosts.map((h) => (
            <li key={h} className="parkItem">
              <span className="parkTitle">{h}</span>
              <button type="button" className="stepRemove" aria-label={`Remove ${h}`} onClick={() => p.onFriction(h, false)}>×</button>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); if (host.trim()) { p.onFriction(host.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''), true); setHost('') } }}>
          <input className="sessionInput" value={host} onChange={(e) => setHost(e.target.value)} placeholder="Add a site, e.g. youtube.com" />
        </form>
      </section>

      <section className="setSection">
        <h3>Privacy</h3>
        {ledger && (
          <div className="ledger" aria-live="polite">
            <div className="ledgerTitle">Network requests made by CCLEAR itself this session: <strong>{ledger.total}</strong></div>
            {ledger.hosts.length === 0 && <div className="parkHint">None yet.</div>}
            <ul className="parkList">
              {ledger.hosts.map((h) => (
                <li key={h.host} className="ledgerRow">
                  <span className={h.local ? 'ledgerLocal' : 'ledgerRemote'}>{h.local ? 'on this Mac' : 'internet'}</span>
                  <span className="parkTitle">{h.host}</span>
                  <span className="parkMeta">{h.count}</span>
                </li>
              ))}
            </ul>
            <p className="parkHint">Websites you visit make their own requests; this list shows requests made by CCLEAR itself. Current-fact questions can trigger a web lookup, and weather questions can trigger a forecast lookup.</p>
          </div>
        )}
        <p className="parkHint">AI generation runs on this Mac through Ollama. Current-fact questions may send a shortened query to DuckDuckGo, article navigation may query Wikipedia, and weather questions may send a place name to Open-Meteo. CCLEAR does not upload page text for AI. Goals, parked items and reading progress are stored on this device.</p>
      </section>
    </div>
  )
}
