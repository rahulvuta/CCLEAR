import { useEffect } from 'react'
import { DEFAULT_READING, type ReadingFont, type ReadingPrefs, type ReadingTint } from '../../shared/reading'

type Props = {
  prefs: ReadingPrefs
  onChange: (patch: Partial<ReadingPrefs>) => void
  onReader: () => void
  readerError: string
  focusModeOn: boolean
  showingOriginal: boolean
  onToggleOriginal: () => void
  onClose: () => void
}

const FONTS: Array<{ id: ReadingFont; label: string }> = [
  { id: 'site', label: 'Page default' },
  { id: 'sans', label: 'Clear sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'mono', label: 'Mono' }
]
const TINTS: Array<{ id: ReadingTint; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'cream', label: 'Cream' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'night', label: 'Night' }
]

export function ReadingPanel({ prefs, onChange, onReader, readerError, focusModeOn, showingOriginal, onToggleOriginal, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="readPanel" role="dialog" aria-label="Make this page easier to read">
      <div className="readHead">
        <strong>Make it easier to read</strong>
        <button type="button" className="iconBtn" aria-label="Close" onClick={onClose}>×</button>
      </div>

      <button type="button" className="sessionBtn sessionBtnPrimary readerBtn" onClick={onReader}>Open reader view</button>
      {readerError && <div className="readErr" role="alert">{readerError}</div>}
      <p className="parkHint">Strips the page down to the article with a quick summary. Your original page is never changed.</p>

      <label className="readSwitch">
        <input type="checkbox" checked={prefs.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        <span>Use my reading settings on pages</span>
      </label>

      <fieldset className="readGroup" disabled={!prefs.enabled}>
        <label className="readRow">Font
          <select value={prefs.font} onChange={(e) => onChange({ font: e.target.value as ReadingFont })}>
            {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        <label className="readRow">Text size {prefs.size}%
          <input type="range" min={90} max={180} step={5} value={prefs.size} onChange={(e) => onChange({ size: Number(e.target.value) })} />
        </label>
        <label className="readRow">Line spacing {prefs.lineHeight.toFixed(1)}
          <input type="range" min={1.3} max={2.4} step={0.1} value={prefs.lineHeight} onChange={(e) => onChange({ lineHeight: Number(e.target.value) })} />
        </label>
        <label className="readRow">Letter spacing
          <input type="range" min={0} max={0.12} step={0.01} value={prefs.letterSpacing} onChange={(e) => onChange({ letterSpacing: Number(e.target.value) })} />
        </label>
        <label className="readRow">Background
          <select value={prefs.tint} onChange={(e) => onChange({ tint: e.target.value as ReadingTint })}>
            {TINTS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className="readSwitch"><input type="checkbox" checked={prefs.narrow} onChange={(e) => onChange({ narrow: e.target.checked })} /><span>Narrow lines</span></label>
        <label className="readSwitch"><input type="checkbox" checked={prefs.ruler} onChange={(e) => onChange({ ruler: e.target.checked })} /><span>Line focus (follows your mouse)</span></label>
        <label className="readSwitch"><input type="checkbox" checked={prefs.dim} onChange={(e) => onChange({ dim: e.target.checked })} /><span>Dim paragraphs I am not reading</span></label>
      </fieldset>

      {focusModeOn && (
        <button type="button" className="sessionBtn" onClick={onToggleOriginal}>
          {showingOriginal ? 'Show simplified text' : 'Show original text'}
        </button>
      )}
      <button type="button" className="nudgeLink" onClick={() => onChange({ ...DEFAULT_READING, enabled: prefs.enabled })}>Reset to defaults</button>
    </div>
  )
}
