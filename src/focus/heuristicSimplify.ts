import type { SimplifyChunk } from '../shared/types'

/** Target max words — visibly shorter than typical body copy */
export const MAX_SUMMARY_WORDS = 22
export const MAX_KEY_FRAGMENTS = 3

export function clampSummaryWords(summary: string, maxWords = MAX_SUMMARY_WORDS): string {
  const t = summary.trim().replace(/\s+/g, ' ')
  if (!t) return ''
  const words = t.split(/\s+/)
  if (words.length <= maxWords) return t
  return words.slice(0, maxWords).join(' ') + '…'
}

export function alignKeyPointsToSummary(
  summary: string,
  keyPoints: string[],
  max = MAX_KEY_FRAGMENTS
): string[] {
  const out: string[] = []
  const low = summary.toLowerCase()
  for (const kp of keyPoints) {
    const k = String(kp).trim()
    if (!k || k.length < 2) continue
    if (low.includes(k.toLowerCase())) {
      out.push(k)
      continue
    }
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
      const re = new RegExp(esc.replace(/\\ /g, '\\s+'), 'i')
      const m = summary.match(re)
      if (m) out.push(m[0])
    } catch {
      //
    }
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

function pickHighlightFragments(summary: string, original: string, n: number): string[] {
  const found: string[] = []
  const seen = new Set<string>()

  const tryAdd = (s: string) => {
    const t = s.trim()
    if (t.length < 2 || seen.has(t.toLowerCase())) return
    if (!summary.toLowerCase().includes(t.toLowerCase())) return
    seen.add(t.toLowerCase())
    found.push(t)
  }

  const signals = original.match(
    /\b\d+(?:\.\d+)?%|\$[\d,]+(?:\.\d+)?[kKmM]?|\b(?:19|20)\d{2}\b|\b\d{1,3}(?:,\d{3})+\b/g
  )
  if (signals) {
    for (const s of signals) {
      tryAdd(s)
      if (found.length >= n) return found.slice(0, n)
    }
  }

  const tokens = summary.split(/\s+/).filter((w) => w.replace(/[^a-z0-9'-]/gi, '').length >= 5)
  tokens.sort((a, b) => b.length - a.length)
  for (const t of tokens) {
    tryAdd(t.replace(/[.,;:!?]+$/g, ''))
    if (found.length >= n) return found.slice(0, n)
  }

  for (const t of summary.split(/\s+/)) {
    const core = t.replace(/[^a-z0-9'-]/gi, '')
    if (core.length >= 4) tryAdd(t.replace(/[.,;:!?]+$/g, ''))
    if (found.length >= n) break
  }

  return found.slice(0, n)
}

export function heuristicSummarizeParagraph(text: string): { summary: string; keyPoints: string[] } {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return { summary: '', keyPoints: [] }

  const wordsAll = t.split(/\s+/).filter(Boolean)
  /** Prefer first sentence only as the source slice (usually the lead) */
  let sliceSource = t
  const fm = t.match(/^[\s\S]{14,}?[.!?](?:\s|$)/)
  if (fm && fm[0].length <= 700) {
    sliceSource = fm[0].trim()
  }
  let words = sliceSource.split(/\s+/).filter(Boolean)

  let summary = words.slice(0, MAX_SUMMARY_WORDS).join(' ')
  if (words.length > MAX_SUMMARY_WORDS) summary += '…'

  /** If first sentence is tiny, use hard word cap from full text */
  if (summary.length < 28 && wordsAll.length > 10) {
    summary = wordsAll.slice(0, MAX_SUMMARY_WORDS).join(' ')
    if (wordsAll.length > MAX_SUMMARY_WORDS) summary += '…'
  }

  summary = clampSummaryWords(summary.replace(/\s+/g, ' '), MAX_SUMMARY_WORDS)

  /** Ensure leading numbers / stakes appear in the short line when present in source */
  const critical = t.match(
    /\b(?:\$\d[\d,.]*|\d+(?:\.\d+)?%|\b(?:19|20)\d{2}\b(?:\s*[-–]\s*(?:19|20)?\d{2,4})?)/g
  )
  if (critical && critical[0] && !summary.includes(critical[0])) {
    summary = `${critical[0]} · ${summary}`
    summary = clampSummaryWords(summary, MAX_SUMMARY_WORDS + 2)
  }

  const keyPoints = pickHighlightFragments(summary, t, MAX_KEY_FRAGMENTS)
  return {
    summary,
    keyPoints: alignKeyPointsToSummary(summary, keyPoints, MAX_KEY_FRAGMENTS)
  }
}

export function heuristicSimplifyChunks(
  chunks: SimplifyChunk[]
): { id: string; summary: string; keyPoints: string[] }[] {
  return chunks.map((c) => {
    const { summary, keyPoints } = heuristicSummarizeParagraph(c.text)
    return { id: c.id, summary, keyPoints }
  })
}

/** Tighten model output so it stays short + highlights align */
export function finalizeModelSimplify(
  summary: string,
  keyPoints: string[],
  chunkText?: string
): { summary: string; keyPoints: string[] } {
  const sig = chunkText ?? summary
  let s = clampSummaryWords(summary.trim(), MAX_SUMMARY_WORDS)
  let kp = keyPoints.map(String).filter(Boolean)
  kp = alignKeyPointsToSummary(s, kp, MAX_KEY_FRAGMENTS)
  if (kp.length < 2) {
    const extra = pickHighlightFragments(s, sig, MAX_KEY_FRAGMENTS)
    kp = alignKeyPointsToSummary(s, [...kp, ...extra], MAX_KEY_FRAGMENTS)
  }
  return { summary: s, keyPoints: kp }
}
