import type { SimplifyChunk, SimplifyResult } from '../shared/types'
import { isProseBlock, shouldSkipChromeText } from './blockFilters'

export const MAX_SUMMARY_WORDS = 40
export const MIN_KEEP_WORDS = 12
export const MAX_HIGHLIGHT_PHRASES = 2
export const MAX_TERM_EMPHASIS = 2

const STOP = new Set(
  'a an the and or but if of to in on for with from as at by is are was were be been being this that these those it its'.split(
    ' '
  )
)

const NEG_RE = /\b(not|never|no|neither|nor|without|cannot|can't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|won't|wouldn't)\b/i

/** Reason / mechanism / outcome — must survive a shorten. */
export const CAUSE_RE =
  /\b(because|therefore|thus|hence|due to|so that|which means|as a result|that's why|that is why|this is why|why)\b/i

const FILLER_RE = /^(?:if you visited\b|.*\btravel aside)/i

const COMPARE_RE = /\b(shorter|longer|more|less|fewer) than\b/i
const OUTCOME_RE = /\bseparated into\b/i
const HARD_SUFFIX_RE = /(?:ology|osis|ometer|imetry|ograph|ography)$/i
const COMMON_TION = new Set(
  'information education nation action question section condition position attention relation direction collection production protection'.split(
    ' '
  )
)

export type EmphasisFields = {
  summary: string
  highlightPhrases: string[]
  termEmphasis: string[]
}

export function clampSummaryWords(summary: string, maxWords = MAX_SUMMARY_WORDS): string {
  return clipAtBoundary(summary, maxWords)
}

/**
 * How hard to cut. The longer the paragraph, the harder: a 150-word wall should become ~50 words,
 * while a 25-word sentence only needs a light trim. (The old flat 50-75% left big paragraphs big.)
 */
function compression(n: number): { min: number; max: number; target: number } {
  if (n <= MIN_KEEP_WORDS) return { min: n, max: n, target: n }
  // target = what we ask the model for (aggressive); max = the most we will still accept (a real cut, not a trim);
  // min = a floor so a rewrite cannot throw the content away. Models undershoot hard targets, so max is looser.
  const [floor, ceil, mid] = n <= 30 ? [0.4, 0.85, 0.62] : n <= 60 ? [0.2, 0.7, 0.45] : [0.15, 0.6, 0.33]
  return { min: Math.max(MIN_KEEP_WORDS - 2, Math.ceil(n * floor)), max: Math.floor(n * ceil), target: Math.round(n * mid) }
}

export function targetWordBudget(sourceWords: number): number {
  return compression(sourceWords).target
}

export function summaryWordRange(text: string): { min: number; max: number; target: number } {
  return compression(wordCount(stripWikiCites(text)))
}

/** Drop Wikipedia-style [16] markers; they are not part of the claim. */
export function stripWikiCites(text: string): string {
  return text
    .replace(/\[\s*\d+\s*\]/g, '')
    .replace(/\[(?:citation needed|note \d+)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Keep only whole sentences when enforcing a word budget. If the first sentence
 * is too long, return the input unchanged: a long sentence is safer than a
 * shorter fragment whose grammar or meaning has been damaged.
 */
export function clipAtBoundary(text: string, maxWords = MAX_SUMMARY_WORDS): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return ''
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return t

  const kept: string[] = []
  let used = 0
  for (const sentence of splitSentences(t)) {
    const sentenceWords = wordCount(sentence)
    if (used + sentenceWords > maxWords) break
    kept.push(sentence)
    used += sentenceWords
  }
  return kept.length > 0 ? kept.join(' ') : t
}

export function yearsIn(text: string): string[] {
  return text.match(/\b(?:19|20)\d{2}\b/g) ?? []
}

export function urlsIn(text: string): string[] {
  return text.match(/https?:\/\/\S+/gi) ?? []
}

export function dropsNegation(source: string, summary: string): boolean {
  if (!NEG_RE.test(source)) return false
  return !NEG_RE.test(summary)
}

export function dropsCause(source: string, summary: string): boolean {
  if (!CAUSE_RE.test(source)) return false
  return !CAUSE_RE.test(summary)
}

export function introducesForeignMetadata(source: string, summary: string): boolean {
  const src = source.toLowerCase()
  for (const u of urlsIn(summary)) {
    if (!source.toLowerCase().includes(u.toLowerCase())) return true
  }
  if (urlsIn(summary).length && !urlsIn(source).length) return true
  for (const y of yearsIn(summary)) {
    if (!src.includes(y)) return true
  }
  const hosts = summary.match(/\b[\w.-]+\.(com|org|gov|edu|net|io)\b/gi) ?? []
  for (const h of hosts) {
    if (!src.includes(h.toLowerCase())) return true
  }
  return false
}

function numericDetailsIn(text: string): string[] {
  return text.match(/(?:[$£€]\s*)?\b\d+(?:[.,]\d+)*(?:st|nd|rd|th|s|%)?/g) ?? []
}

/** Explicit quantities are meaning-bearing and must not disappear. */
export function dropsNumericDetails(source: string, summary: string): boolean {
  const summaryNumbers = new Set(numericDetailsIn(summary).map((n) => n.toLowerCase()))
  return numericDetailsIn(source).some((n) => !summaryNumbers.has(n.toLowerCase()))
}

function contentTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  )
}

/** True when the summary does not invent content-bearing tokens. */
export function summaryCoveredBySource(source: string, summary: string): boolean {
  const src = contentTokens(source)
  if (src.size === 0) return summary.trim().length === 0
  for (const tok of contentTokens(summary)) {
    if (!src.has(tok)) return false
  }
  return true
}

const TRAILING_FRAGMENT_RE =
  /\b(?:a|an|the|and|or|but|if|because|although|though|while|when|unless|until|from|to|of|in|on|at|by|for|with|without|is|are|was|were|be|been|being|am|do|does|did|have|has|had|can|could|may|might|must|shall|should|will|would|you(?:'re|\u2019re)|we(?:'re|\u2019re)|they(?:'re|\u2019re))\s*[.!?]?$/i

const LEADING_DEPENDENT_RE =
  /^(?:if|when|while|because|although|though|unless|until|before|after|from)\b/i

/** A simplified block must read as standalone prose, not as a clipped clause. */
export function isCompleteSummary(summary: string): boolean {
  const s = summary.trim().replace(/\s+/g, ' ')
  if (!s || !/[.!?][\s\])}"'\u2019\u201d]*$/.test(s)) return false
  if (TRAILING_FRAGMENT_RE.test(s)) return false

  let parens = 0
  for (const ch of s) {
    if (ch === '(') parens += 1
    if (ch === ')') parens -= 1
    if (parens < 0) return false
  }
  if (parens !== 0) return false

  for (const sentence of splitSentences(s)) {
    if (/^(?:and|or|but)\b/i.test(sentence)) return false
    // A leading dependent phrase needs a comma followed by an independent clause.
    if (LEADING_DEPENDENT_RE.test(sentence) && !sentence.includes(',')) return false
  }
  return true
}

function normalizedSentence(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Accept only complete source sentences in their original order. A bag-of-words
 * check cannot catch role reversals ("cats chase dogs" vs "dogs chase cats") or
 * modifier-scope changes, while extractive selection preserves both.
 */
export function isOrderedSentenceSelection(source: string, summary: string): boolean {
  const sourceSentences = splitSentences(stripWikiCites(source)).map(normalizedSentence)
  const summarySentences = splitSentences(stripWikiCites(summary)).map(normalizedSentence)
  if (summarySentences.length === 0) return false

  let sourceIndex = 0
  for (const sentence of summarySentences) {
    const found = sourceSentences.indexOf(sentence, sourceIndex)
    if (found < 0) return false
    sourceIndex = found + 1
  }
  return true
}

export function isFaithfulSummary(source: string, summary: string): boolean {
  const s = summary.trim()
  if (!s) return false
  const normalizedSource = stripWikiCites(source).replace(/\s+/g, ' ').trim()
  if (s.replace(/\s+/g, ' ') === normalizedSource) return true
  if (!isCompleteSummary(s)) return false
  if (dropsNegation(source, s)) return false
  if (dropsCause(source, s)) return false
  if (dropsNumericDetails(source, s)) return false
  if (introducesForeignMetadata(source, s)) return false
  if (!summaryCoveredBySource(source, s)) return false
  if (!isOrderedSentenceSelection(source, s)) return false
  const kept = splitSentences(s).map(normalizedSentence)
  return splitSentences(normalizedSource).every((sentence) =>
    isFillerSentence(sentence) || kept.includes(normalizedSentence(sentence)))
}

function phraseWordCount(p: string): number {
  return p.trim().split(/\s+/).filter(Boolean).length
}

function splitSentences(text: string): string[] {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
  return Array.from(segmenter.segment(text), (s) => s.segment.trim()).filter(Boolean)
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}

function isFillerSentence(s: string): boolean {
  return FILLER_RE.test(s) && !CAUSE_RE.test(s) && !NEG_RE.test(s) && !numericDetailsIn(s).length
}

/**
 * Offline fallback: remove explicit asides only. Sentence scoring cannot tell
 * whether a low-scoring sentence defines the topic or explains its mechanism.
 * Rewriting to the requested budget requires the model and its quality check.
 */
export function extractiveCompress(text: string): string {
  const t = stripWikiCites(text)
  const sentences = splitSentences(t)
  return sentences.filter((s) => !isFillerSentence(s)).join(' ') || t
}

const NOT_TERM = new Set(
  'when white light other some like just made used also into over only even still much many more most such each both same very through around about after before between every another using based called shines shine travels learned visited passing ocean lazy short long kinds tiny universe windows land magic energy waves wave colors color because therefore specially shaped crystal having being doing going could would should there their them then than what which while where france britain england english america american china india london paris germany german spain spanish italy italian russia russian canada canadian australia australian japan japanese'.split(
    ' '
  )
)

const HANGING = new Set(
  'a an the and or but if of to in on for with from as at by is are was were be been via both which than usual old north'.split(
    ' '
  )
)

export function isCompletePhrase(p: string, maxWords = 6): boolean {
  const k = p.trim().replace(/\s+/g, ' ')
  const words = k.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > maxWords) return false
  const first = stripTrailPunct(words[0]).toLowerCase()
  const last = stripTrailPunct(words[words.length - 1]).toLowerCase()
  if (HANGING.has(last)) return false
  if (HANGING.has(first) && first !== 'because' && first !== 'therefore') return false
  if (/^(via|from|the|and|or)$/i.test(first)) return false
  if (/[("']$/.test(k)) return false
  if (/^\(/.test(k) && !k.includes(')')) return false
  if (/"[^"]*$/.test(k) && (k.match(/"/g) || []).length % 2 === 1) return false
  return true
}

function phrasesOverlap(a: string, b: string): boolean {
  const al = a.toLowerCase()
  const bl = b.toLowerCase()
  if (al.includes(bl) || bl.includes(al)) return true
  const aw = al.split(/\s+/)
  const bw = bl.split(/\s+/)
  if (aw.length >= 3 && bw.length >= 3) {
    const aCore = aw.slice(1, -1).join(' ')
    const bCore = bw.slice(1, -1).join(' ')
    if (aCore && bCore && (al.includes(bCore) || bl.includes(aCore))) return true
  }
  return false
}

function isClaimPhrase(k: string): boolean {
  return CAUSE_RE.test(k) || COMPARE_RE.test(k) || OUTCOME_RE.test(k)
}

/** Phrase highlights: the main why / comparison / outcome only. */
export function filterHighlightPhrases(summary: string, source: string, phrases: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const sumLow = summary.toLowerCase()
  const srcLow = source.toLowerCase()
  const sumWords = phraseWordCount(summary)
  let hasWhy = false
  let hasOutcome = false
  for (const raw of phrases) {
    const k = String(raw).trim().replace(/\s+/g, ' ')
    if (!isClaimPhrase(k)) continue
    const allowLong = CAUSE_RE.test(k)
    if (!isCompletePhrase(k, allowLong ? 10 : 6)) continue
    if (phraseWordCount(k) >= Math.max(8, Math.floor(sumWords * 0.45))) continue
    if (seen.has(k.toLowerCase())) continue
    if (!sumLow.includes(k.toLowerCase()) || !srcLow.includes(k.toLowerCase())) continue
    if (out.some((p) => phrasesOverlap(p, k))) continue
    const why = CAUSE_RE.test(k)
    const outcome = COMPARE_RE.test(k) || OUTCOME_RE.test(k)
    if (why && hasWhy) continue
    if (outcome && !why && hasOutcome) continue
    if (out.length >= 1 && !(why && hasOutcome) && !(outcome && hasWhy)) continue
    seen.add(k.toLowerCase())
    const i = sumLow.indexOf(k.toLowerCase())
    out.push(summary.slice(i, i + k.length))
    if (why) hasWhy = true
    if (outcome) hasOutcome = true
    if (out.length >= MAX_HIGHLIGHT_PHRASES) break
  }
  return out
}

function isDefinedIn(summary: string, term: string): boolean {
  const t = term.replace(/[^A-Za-z0-9'-]/g, '')
  if (!t) return false
  const re = new RegExp(
    `\\b(?:a|an|the)\\s+${t}\\s+is\\b|\\bcalled\\s+${t}\\b`,
    'i'
  )
  return re.test(summary)
}

function isHardWord(core: string): boolean {
  const c = core.toLowerCase()
  if (/(?:ed|ing)$/.test(c) && c.length < 12) return false
  if (COMMON_TION.has(c)) return false
  if (c.length >= 10) return true
  if (HARD_SUFFIX_RE.test(c) && c.length >= 6) return true
  return false
}

/** Subject jargon and hard words — never country / person Title Case. */
export function filterTermEmphasis(summary: string, source: string, terms: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const srcLow = source.toLowerCase()
  const sumLow = summary.toLowerCase()
  for (const raw of terms) {
    const k = String(raw).trim()
    if (!k || /\s/.test(k)) continue
    const core = k.replace(/[^A-Za-z0-9'-]/g, '')
    if (core.length < 3) continue
    if (STOP.has(core.toLowerCase())) continue
    if (HANGING.has(core.toLowerCase()) || NOT_TERM.has(core.toLowerCase())) continue
    if (seen.has(core.toLowerCase())) continue
    if (!srcLow.includes(core.toLowerCase()) || !sumLow.includes(core.toLowerCase())) continue

    const isAcronym = /^[A-Z]{2,6}$/.test(core)
    const isTitleCase = /^[A-Z][a-z]{2,}$/.test(k)
    const hyphenSci = /^[a-z]{3,}-[a-z]{3,}$/.test(k)
    const defined = isDefinedIn(summary, core)
    const hard = isHardWord(core) && !isTitleCase

    if (isTitleCase && !isAcronym && !defined) continue
    if (!isAcronym && !defined && !hyphenSci && !hard) continue

    seen.add(core.toLowerCase())
    out.push(k)
    if (out.length >= MAX_TERM_EMPHASIS) break
  }
  return out
}

function stripTrailPunct(s: string): string {
  return s.replace(/[.,;:!?]+$/g, '')
}

function pickQuotedTerms(summary: string): string[] {
  const terms: string[] = []
  const re = /["\u201C\u201D']([^"\u201C\u201D']{3,48})["\u201C\u201D']/g
  let m: RegExpExecArray | null
  while ((m = re.exec(summary))) {
    const inner = m[1].trim()
    if (phraseWordCount(inner) === 1 && !/^[A-Z][a-z]+$/.test(inner)) terms.push(inner)
  }
  return terms
}

function pickDefinedTerms(summary: string): string[] {
  const out: string[] = []
  const re = /\b(?:a|an|the)\s+([A-Za-z][A-Za-z-]{3,})\s+is\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(summary))) out.push(m[1])
  const called = /\bcalled\s+([A-Za-z][A-Za-z-]{3,})\b/gi
  while ((m = called.exec(summary))) out.push(m[1])
  return out
}

function pickHardWords(summary: string): string[] {
  const out: string[] = []
  for (const raw of summary.split(/\s+/).filter(Boolean)) {
    const w = stripTrailPunct(raw)
    if (/^[A-Z]/.test(w)) continue
    const core = w.replace(/[^A-Za-z0-9'-]/g, '')
    if (isHardWord(core)) out.push(w)
  }
  return out
}

function pickTermEmphasis(summary: string, source: string): string[] {
  const hyphen = summary.match(/\b[a-z]{3,}-[a-z]{3,}\b/g) ?? []
  return filterTermEmphasis(summary, source, [
    ...pickDefinedTerms(summary),
    ...pickQuotedTerms(summary),
    ...hyphen,
    ...pickHardWords(summary)
  ])
}

function phraseUntilPunct(words: string[], start: number, maxWords: number): string {
  const out: string[] = []
  for (let i = start; i < words.length && out.length < maxWords; i++) {
    out.push(words[i])
    if (/[.!?;]$/.test(words[i])) break
  }
  return stripTrailPunct(out.join(' '))
}

/** Why / comparison / outcome only — not mild compounds or quoted trivia. */
function pickClaimPhrases(summary: string): string[] {
  const words = summary.split(/\s+/).filter(Boolean)
  const bare = words.map((w) => stripTrailPunct(w).toLowerCase())
  const out: string[] = []

  for (let i = 0; i < bare.length; i++) {
    if (bare[i] === 'because' || bare[i] === 'therefore') {
      out.push(phraseUntilPunct(words, i, 10))
    }
    if (bare[i] === 'due' && bare[i + 1] === 'to') {
      out.push(phraseUntilPunct(words, i, 8))
    }
    if (bare[i] === 'this' && bare[i + 1] === 'is' && bare[i + 2] === 'why') {
      out.push(phraseUntilPunct(words, i, 10))
    }
    if (bare[i] === 'so' && bare[i + 1] === 'that') {
      out.push(phraseUntilPunct(words, i, 8))
    }
    if (bare[i] === 'more' && bare[i + 1] === 'than') {
      const start = Math.max(0, i - 3)
      out.push(phraseUntilPunct(words, start, Math.min(8, i - start + 4)))
    }
    if (bare[i] === 'separated' && bare[i + 1] === 'into') {
      out.push(phraseUntilPunct(words, i, 6))
    }
    if ((bare[i] === 'shorter' || bare[i] === 'longer') && bare[i + 1] === 'than') {
      const start = Math.max(0, i - 2)
      out.push(phraseUntilPunct(words, start, 6))
    }
  }
  return out
}

function pickHighlightPhrases(summary: string, source: string): string[] {
  return filterHighlightPhrases(summary, source, pickClaimPhrases(summary))
}

function keepOriginal(text: string): EmphasisFields {
  return {
    summary: text.trim().replace(/\s+/g, ' '),
    highlightPhrases: [],
    termEmphasis: []
  }
}

export function heuristicSummarizeParagraph(text: string): EmphasisFields {
  const t = stripWikiCites(text.trim().replace(/\s+/g, ' '))
  if (!t) return { summary: '', highlightPhrases: [], termEmphasis: [] }
  if (shouldSkipChromeText(t) || !isProseBlock(t)) return keepOriginal(t)

  const summary = extractiveCompress(t)
  if (!isFaithfulSummary(t, summary.replace(/…$/, ''))) {
    return keepOriginal(t)
  }

  return {
    summary,
    highlightPhrases: pickHighlightPhrases(summary, t),
    termEmphasis: pickTermEmphasis(summary, t)
  }
}

export function heuristicSimplifyChunks(chunks: SimplifyChunk[]): SimplifyResult[] {
  return chunks.map((c) => {
    const fields = heuristicSummarizeParagraph(c.text)
    return { id: c.id, ...fields }
  })
}

export function emphasizeSimplification(summary: string, source: string): EmphasisFields {
  return {
    summary,
    highlightPhrases: pickHighlightPhrases(summary, source),
    termEmphasis: pickTermEmphasis(summary, source)
  }
}

export function finalizeModelSimplify(
  summary: string,
  highlightPhrases: string[],
  termEmphasis: string[],
  chunkText: string
): EmphasisFields {
  const source = stripWikiCites(chunkText.trim())
  if (shouldSkipChromeText(source) || !isProseBlock(source)) return keepOriginal(source)

  const sourceWords = wordCount(source)
  const range = summaryWordRange(source)
  const s = stripWikiCites(summary.trim()).replace(/\s+/g, ' ')
  const summaryWords = wordCount(s)
  if (sourceWords > MIN_KEEP_WORDS && (summaryWords > range.max || summaryWords < range.min)) {
    return heuristicSummarizeParagraph(source)
  }
  if (!s || !isFaithfulSummary(source, s)) {
    return heuristicSummarizeParagraph(source)
  }

  return {
    summary: s,
    highlightPhrases: filterHighlightPhrases(s, source, [...highlightPhrases, ...pickClaimPhrases(s)]),
    termEmphasis: filterTermEmphasis(s, source, [...termEmphasis, ...pickTermEmphasis(s, source)])
  }
}
