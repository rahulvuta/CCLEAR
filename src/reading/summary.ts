import type { ReaderSummary } from '../shared/reading'

export function firstSentences(text: string, n: number, maxChars = 320): string {
  const sentences = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9“"])/)
  return sentences.slice(0, n).join(' ').slice(0, maxChars).trim()
}

/** No model needed: lead sentences. Honest about being a fallback. */
export function fallbackSummary(text: string): ReaderSummary {
  const paras = text.split('\n').filter((l) => l.length > 60)
  return {
    tldr: firstSentences(paras[0] ?? text, 2),
    points: paras.slice(1, 5).map((p) => firstSentences(p, 1, 200)).filter(Boolean),
    fromModel: false
  }
}

/**
 * Accept model output only if it is well-formed and introduces no numbers that are not in the article.
 * `introducesNumbers(summary, source)` is true when `summary` contains numbers absent from `source`.
 */
export function validateSummary(
  raw: { tldr?: unknown; points?: unknown },
  source: string,
  introducesNumbers: (summary: string, source: string) => boolean
): ReaderSummary | null {
  const tldr = typeof raw.tldr === 'string' ? raw.tldr.trim() : ''
  if (tldr.length < 20 || tldr.length > 420 || introducesNumbers(tldr, source)) return null
  const points = (Array.isArray(raw.points) ? raw.points : [])
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim())
    .filter((p) => p.length >= 12 && p.length <= 220 && !introducesNumbers(p, source))
    .slice(0, 5)
  return { tldr, points, fromModel: true }
}
