export type ReadingFont = 'site' | 'sans' | 'serif' | 'rounded' | 'mono'
export type ReadingTint = 'none' | 'sepia' | 'cream' | 'night'

export type ReadingPrefs = {
  /** Master switch: apply these settings to pages. */
  enabled: boolean
  font: ReadingFont
  /** Percent of the page's own size. */
  size: number
  lineHeight: number
  letterSpacing: number
  narrow: boolean
  ruler: boolean
  dim: boolean
  tint: ReadingTint
}

export const DEFAULT_READING: ReadingPrefs = {
  enabled: false,
  font: 'site',
  size: 110,
  lineHeight: 1.7,
  letterSpacing: 0.01,
  narrow: true,
  ruler: false,
  dim: false,
  tint: 'none'
}

export type ReaderContent = {
  title: string
  url: string
  blocks: Array<{ tag: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'blockquote'; text: string }>
}

export type ReaderSummary = { tldr: string; points: string[]; fromModel: boolean }

export function clampReading(p: Partial<ReadingPrefs> | undefined): ReadingPrefs {
  const m = { ...DEFAULT_READING, ...(p ?? {}) }
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
  return {
    enabled: Boolean(m.enabled),
    font: (['site', 'sans', 'serif', 'rounded', 'mono'] as const).includes(m.font) ? m.font : 'site',
    size: num(m.size, 90, 180, DEFAULT_READING.size),
    lineHeight: num(m.lineHeight, 1.3, 2.4, DEFAULT_READING.lineHeight),
    letterSpacing: num(m.letterSpacing, 0, 0.12, DEFAULT_READING.letterSpacing),
    narrow: Boolean(m.narrow),
    ruler: Boolean(m.ruler),
    dim: Boolean(m.dim),
    tint: (['none', 'sepia', 'cream', 'night'] as const).includes(m.tint) ? m.tint : 'none'
  }
}
