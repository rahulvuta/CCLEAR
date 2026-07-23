import type { SimplifyChunk, SimplifyResult } from '../shared/types'

/** Default cap when source is short */
export const MAX_SUMMARY_WORDS = 22
export const MAX_KEY_PHRASES = 2
export const MAX_BOLD_TERMS = 4

const FILLER_RE = [
  /\bit is important to note that\b/gi,
  /\bit should be noted that\b/gi,
  /\bin order to\b/gi,
  /\bdue to the fact that\b/gi,
  /\bfor the most part\b/gi,
  /\bat the end of the day\b/gi,
  /\bas a matter of fact\b/gi,
  /\bneedless to say\b/gi,
  /\bthe fact that\b/gi
]

export function clampSummaryWords(summary: string, maxWords = MAX_SUMMARY_WORDS): string {
  const t = summary.trim().replace(/\s+/g, ' ')
  if (!t) return ''
  const words = t.split(/\s+/)
  if (words.length <= maxWords) return t
  return words.slice(0, maxWords).join(' ') + '…'
}

function normalizeSpanText(text: string): string {
  return text
    .trim()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
}

export function alignSpansToSummary(summary: string, spans: string[], max: number): string[] {
  const out: string[] = []
  const normSummary = normalizeSpanText(summary)
  const low = normSummary.toLowerCase()
  for (const span of spans) {
    const k = normalizeSpanText(String(span))
    if (!k || k.length < 2) continue
    if (low.includes(k.toLowerCase())) {
      const pos = low.indexOf(k.toLowerCase())
      out.push(summary.slice(pos, pos + k.length))
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

function dynamicWordCap(sourceWordCount: number): number {
  if (sourceWordCount <= 30) return Math.min(MAX_SUMMARY_WORDS, sourceWordCount)
  if (sourceWordCount > 40) return Math.max(22, Math.min(40, Math.floor(sourceWordCount * 0.65)))
  return Math.max(12, Math.floor(sourceWordCount * 0.55))
}

const GENERIC_PHRASE_START = /^(the|our|this|it|a|an)\s+[a-z]/i

function isMeaningfulPhrase(phrase: string): boolean {
  const p = phrase.trim()
  if (!p) return false
  if (/\d/.test(p)) return true
  const words = p.split(/\s+/).filter(Boolean)
  const hasProper = words.some((w) => /^[A-Z][a-z]{2,}/.test(w.replace(/[^a-zA-Z]/g, '')))
  if (hasProper) return true
  if (GENERIC_PHRASE_START.test(p)) return false
  return words.length >= 2
}

function stripFiller(text: string): string {
  let t = text
  for (const re of FILLER_RE) {
    t = t.replace(re, '')
  }
  t = t.replace(/\([^)]{4,120}\)/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

function plainLanguageRewrite(text: string): string {
  const t = stripFiller(text.trim().replace(/\s+/g, ' '))
  if (!t) return ''

  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean)
  const wordTotal = t.split(/\s+/).filter(Boolean).length
  const take = wordTotal > 50 ? Math.min(3, sentences.length) : Math.min(2, sentences.length)
  const lead = sentences.slice(0, take).join(' ')
  return lead || t
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}

function overlapsRange(
  ranges: Array<{ start: number; end: number }>,
  start: number,
  end: number
): boolean {
  return ranges.some((r) => start < r.end && end > r.start)
}

function findPhrasePositions(summary: string, phrase: string): number[] {
  const positions: number[] = []
  const low = summary.toLowerCase()
  const pl = phrase.toLowerCase()
  let idx = 0
  while (idx < summary.length) {
    const pos = low.indexOf(pl, idx)
    if (pos < 0) break
    positions.push(pos)
    idx = pos + 1
  }
  return positions
}

function pickKeyPhrases(summary: string, original: string, n: number, strict = true): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const ranges: Array<{ start: number; end: number }> = []

  const tryAdd = (phrase: string, skipMeaningful = false) => {
    const p = phrase.trim().replace(/\s+/g, ' ')
    const wc = wordCount(p)
    if (wc < 2 || wc > 7 || seen.has(p.toLowerCase())) return
    if (strict && !skipMeaningful && !isMeaningfulPhrase(p)) return
    if (!summary.toLowerCase().includes(p.toLowerCase())) return

    const positions = findPhrasePositions(summary, p)
    for (const pos of positions) {
      const end = pos + p.length
      if (!overlapsRange(ranges, pos, end)) {
        seen.add(p.toLowerCase())
        ranges.push({ start: pos, end })
        found.push(summary.slice(pos, end))
        return
      }
    }
  }

  const origWords = original.split(/\s+/).filter(Boolean)
  for (let len = 7; len >= 2; len--) {
    for (let i = 0; i <= origWords.length - len; i++) {
      const span = origWords.slice(i, i + len).join(' ')
      if (summary.toLowerCase().includes(span.toLowerCase())) {
        tryAdd(span.replace(/[.,;:!?]+$/g, ''))
        if (found.length >= n) return found.slice(0, n)
      }
    }
  }

  const defPatterns = original.match(
    /\b(?:called|known as|means|is a|is the|refers to)\s+[^.!?]{2,50}/gi
  )
  if (defPatterns) {
    for (const d of defPatterns) {
      const clause = d.replace(/^(called|known as|means|is a|is the|refers to)\s+/i, '').trim()
      if (clause) tryAdd(clause.replace(/[.,;:!?]+$/g, ''))
      if (found.length >= n) return found.slice(0, n)
    }
  }

  const capTerms = original.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g)
  if (capTerms) {
    for (const t of capTerms) {
      if (summary.toLowerCase().includes(t.toLowerCase())) tryAdd(t)
      if (found.length >= n) return found.slice(0, n)
    }
  }

  const contextual = original.match(
    /\b(?:\$[\d,]+(?:\.\d+)?[kKmMbB]?|\d+(?:\.\d+)?%|\b(?:19|20)\d{2}\b)[^.!?]{0,40}/g
  )
  if (contextual) {
    for (const c of contextual) {
      tryAdd(c.trim().replace(/[.,;:!?]+$/g, ''))
      if (found.length >= n) return found.slice(0, n)
    }
  }

  const withUnits = original.match(
    /\b\d[\d,.]*\s*(?:million|billion|trillion|miles?|km|light-years?|years?|%)\b[^.!?]{0,30}/gi
  )
  if (withUnits) {
    for (const c of withUnits) {
      tryAdd(c.trim().replace(/[.,;:!?]+$/g, ''))
      if (found.length >= n) return found.slice(0, n)
    }
  }

  const words = summary.split(/\s+/).filter(Boolean)
  for (let len = 4; len >= 2; len--) {
    for (let i = 0; i <= words.length - len; i++) {
      const span = words.slice(i, i + len).join(' ')
      tryAdd(span.replace(/[.,;:!?]+$/g, ''))
      if (found.length >= n) return found.slice(0, n)
    }
  }

  return found.slice(0, n)
}

function isInsidePhrase(
  pos: number,
  len: number,
  phrases: string[],
  summary: string
): boolean {
  const low = summary.toLowerCase()
  for (const p of phrases) {
    let idx = 0
    while (idx < summary.length) {
      const start = low.indexOf(p.toLowerCase(), idx)
      if (start < 0) break
      const end = start + p.length
      if (pos >= start && pos + len <= end) return true
      idx = start + 1
    }
  }
  return false
}

const STOP_BOLD_TERMS = new Set([
  'which', 'that', 'this', 'with', 'from', 'their', 'there', 'when', 'where',
  'what', 'have', 'been', 'were', 'will', 'would', 'could', 'should', 'also',
  'than', 'then', 'into', 'over', 'under', 'after', 'before', 'about'
])

function pickBoldTerms(
  summary: string,
  original: string,
  keyPhrases: string[],
  n: number
): string[] {
  const found: string[] = []
  const seen = new Set<string>()

  const tryAdd = (term: string) => {
    const t = term.trim().replace(/[.,;:!?]+$/g, '')
    const wc = wordCount(t)
    if (wc < 1 || wc > 2 || t.length < 2 || seen.has(t.toLowerCase())) return
    if (STOP_BOLD_TERMS.has(t.toLowerCase())) return
    if (!summary.toLowerCase().includes(t.toLowerCase())) return

    const pos = summary.toLowerCase().indexOf(t.toLowerCase())
    if (pos < 0 || isInsidePhrase(pos, t.length, keyPhrases, summary)) return

    seen.add(t.toLowerCase())
    found.push(summary.slice(pos, pos + t.length))
  }

  const signals = (original + ' ' + summary).match(
    /\b\d+(?:\.\d+)?%|\$[\d,]+(?:\.\d+)?[kKmMbB]?|\b(?:19|20)\d{2}\b|\b\d{1,3}(?:,\d{3})+\b/g
  )
  if (signals) {
    for (const s of signals) {
      tryAdd(s)
      if (found.length >= n) return found.slice(0, n)
    }
  }

  const units = (original + ' ' + summary).match(
    /\b\d[\d,.]*\s*(?:million|billion|trillion|miles?|km|light-years?|years?|%)\b/gi
  )
  if (units) {
    for (const u of units) {
      tryAdd(u.trim())
      if (found.length >= n) return found.slice(0, n)
    }
  }

  const techTerms = (original + ' ' + summary).match(
    /\b(?:[A-Z][a-z]+(?:\s+[a-z]+)|[a-z]+(?:\s+[a-z]+){1,2})\b/g
  )
  if (techTerms) {
    for (const term of techTerms.sort((a, b) => b.length - a.length)) {
      const t = term.trim()
      if (t.split(/\s+/).length === 2 && original.toLowerCase().includes(t.toLowerCase())) {
        tryAdd(t)
      }
      if (found.length >= n) return found.slice(0, n)
    }
  }

  for (const w of summary.split(/\s+/)) {
    const core = w.replace(/[^a-zA-Z0-9'-]/g, '')
    if (/^[A-Z][a-z]{2,}/.test(core)) tryAdd(w)
    if (found.length >= n) return found.slice(0, n)
  }

  return found.slice(0, n)
}

function pickBestAnchorTerm(summary: string): string {
  const words = summary.split(/\s+/).filter(Boolean)
  let best = ''
  let bestScore = 0
  for (const w of words) {
    const core = w.replace(/[^a-zA-Z0-9'-]/g, '')
    if (!core || core.length < 2) continue
    const score =
      (/\d/.test(core) ? 4 : 0) +
      (/^[A-Z][a-z]{2,}/.test(core) ? 3 : 0) +
      Math.min(core.length, 8)
    if (score > bestScore) {
      bestScore = score
      best = w.replace(/[.,;:!?]+$/g, '')
    }
  }
  return best
}

export function splitLegacyKeyPoints(keyPoints: string[]): { keyPhrases: string[]; boldTerms: string[] } {
  const keyPhrases: string[] = []
  const boldTerms: string[] = []
  for (const kp of keyPoints) {
    const k = String(kp).trim()
    if (!k) continue
    if (wordCount(k) >= 2) keyPhrases.push(k)
    else boldTerms.push(k)
  }
  return { keyPhrases, boldTerms }
}

export function finalizeModelSimplify(
  summary: string,
  opts: {
    keyPhrases?: string[]
    boldTerms?: string[]
    keyPoints?: string[]
    chunkText?: string
  }
): { summary: string; keyPhrases: string[]; boldTerms: string[] } {
  const sig = opts.chunkText ?? summary
  const sourceWords = wordCount(sig)

  let s = summary.trim().replace(/\s+/g, ' ')
  const cap = dynamicWordCap(sourceWords)
  s = clampSummaryWords(s, cap)

  if (sourceWords > 30 && wordCount(s) > cap) {
    s = clampSummaryWords(s, cap)
  }

  const legacy = opts.keyPoints?.length ? splitLegacyKeyPoints(opts.keyPoints) : { keyPhrases: [], boldTerms: [] }
  let keyPhrases = [...(opts.keyPhrases ?? []), ...legacy.keyPhrases]
  let boldTerms = [...(opts.boldTerms ?? []), ...legacy.boldTerms]

  keyPhrases = alignSpansToSummary(s, keyPhrases, MAX_KEY_PHRASES)
    .filter((p) => wordCount(p) >= 2 && isMeaningfulPhrase(p))
  boldTerms = alignSpansToSummary(s, boldTerms, MAX_BOLD_TERMS).filter((t) => wordCount(t) <= 2)

  if (keyPhrases.length < 1) {
    const extra = pickKeyPhrases(s, sig, MAX_KEY_PHRASES).filter(isMeaningfulPhrase)
    keyPhrases = alignSpansToSummary(s, [...keyPhrases, ...extra], MAX_KEY_PHRASES)
  }

  if (keyPhrases.length < 1) {
    const fallback = pickKeyPhrases(s, sig, 1, false)
    keyPhrases = alignSpansToSummary(s, [...keyPhrases, ...fallback], MAX_KEY_PHRASES)
  }

  if (boldTerms.length < 2) {
    const extra = pickBoldTerms(s, sig, keyPhrases, MAX_BOLD_TERMS)
    boldTerms = alignSpansToSummary(s, [...boldTerms, ...extra], MAX_BOLD_TERMS)
  }

  if (boldTerms.length < 1) {
    const anchor = pickBestAnchorTerm(s)
    if (anchor) boldTerms = alignSpansToSummary(s, [anchor], MAX_BOLD_TERMS)
  }

  return { summary: s, keyPhrases: keyPhrases.slice(0, MAX_KEY_PHRASES), boldTerms: boldTerms.slice(0, MAX_BOLD_TERMS) }
}

export function heuristicSummarizeParagraph(text: string): {
  summary: string
  keyPhrases: string[]
  boldTerms: string[]
} {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return { summary: '', keyPhrases: [], boldTerms: [] }

  const wordsAll = t.split(/\s+/).filter(Boolean)
  let rewritten = plainLanguageRewrite(t)
  const cap = dynamicWordCap(wordsAll.length)
  let summary = clampSummaryWords(rewritten, cap)

  if (summary.length < 28 && wordsAll.length > 10) {
    summary = clampSummaryWords(plainLanguageRewrite(wordsAll.join(' ')), cap)
  }

  const critical = t.match(
    /\b(?:\$\d[\d,.]*|\d+(?:\.\d+)?%|\d[\d,.]*\s*(?:million|billion|miles?|km|light-years?)|\b(?:19|20)\d{2}\b(?:\s*[-–]\s*(?:19|20)?\d{2,4})?)/gi
  )
  if (critical) {
    for (const c of critical.slice(0, 2)) {
      if (!summary.includes(c)) {
        summary = `${c} — ${summary}`
      }
    }
    summary = clampSummaryWords(summary, cap + 4)
  }

  const keyPhrases = alignSpansToSummary(
    summary,
    pickKeyPhrases(summary, t, MAX_KEY_PHRASES).filter(isMeaningfulPhrase),
    MAX_KEY_PHRASES
  )
  const boldTerms = alignSpansToSummary(
    summary,
    pickBoldTerms(summary, t, keyPhrases, MAX_BOLD_TERMS),
    MAX_BOLD_TERMS
  )

  return { summary, keyPhrases, boldTerms }
}

export function heuristicSimplifyChunks(chunks: SimplifyChunk[]): SimplifyResult[] {
  return chunks.map((c) => {
    const { summary, keyPhrases, boldTerms } = heuristicSummarizeParagraph(c.text)
    return { id: c.id, summary, keyPhrases, boldTerms }
  })
}
