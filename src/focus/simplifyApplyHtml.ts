function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type Span = { start: number; end: number; type: 'phrase' | 'term' }

function overlapsRange(ranges: Span[], start: number, end: number): boolean {
  return ranges.some((r) => start < r.end && end > r.start)
}

function normalizeForMatch(text: string): string {
  return text
    .trim()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '')
    .toLowerCase()
}

function findSpanPosition(summary: string, needle: string): { start: number; end: number } | null {
  const pl = needle.trim()
  if (!pl) return null
  const low = summary.toLowerCase()
  const pll = pl.toLowerCase()
  let idx = 0
  while (idx < summary.length) {
    const pos = low.indexOf(pll, idx)
    if (pos < 0) break
    return { start: pos, end: pos + pl.length }
  }

  const normSummary = normalizeForMatch(summary)
  const normNeedle = normalizeForMatch(pl)
  if (normNeedle && normSummary.includes(normNeedle)) {
    const normPos = normSummary.indexOf(normNeedle)
    const esc = normNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
      const re = new RegExp(esc.replace(/ /g, '\\s+'), 'i')
      const m = summary.match(re)
      if (m && m.index != null) return { start: m.index, end: m.index + m[0].length }
    } catch {
      //
    }
    if (normPos >= 0 && normPos < summary.length) {
      return { start: normPos, end: Math.min(summary.length, normPos + pl.length) }
    }
  }
  return null
}

function collectSpans(summary: string, keyPhrases: string[], boldTerms: string[]): Span[] {
  const spans: Span[] = []

  const sortedPhrases = [...new Set(keyPhrases.filter(Boolean))].sort((a, b) => b.length - a.length)
  for (const phrase of sortedPhrases) {
    const pl = phrase.trim()
    if (pl.length < 2) continue
    const match = findSpanPosition(summary, pl)
    if (match && !overlapsRange(spans, match.start, match.end)) {
      spans.push({ start: match.start, end: match.end, type: 'phrase' })
    }
  }

  const sortedTerms = [...new Set(boldTerms.filter(Boolean))].sort((a, b) => b.length - a.length)
  for (const term of sortedTerms) {
    const tl = term.trim()
    if (!tl) continue
    const match = findSpanPosition(summary, tl)
    if (!match || overlapsRange(spans, match.start, match.end)) continue
    const before = match.start === 0 || !/\w/.test(summary[match.start - 1] ?? '')
    const after = match.end >= summary.length || !/\w/.test(summary[match.end] ?? '')
    if (before && after) {
      spans.push({ start: match.start, end: match.end, type: 'term' })
    }
  }

  return spans.sort((a, b) => a.start - b.start || b.end - a.end)
}

/**
 * Phrases → subtle underline highlight; single terms → bold.
 */
export function formatEmphasizedSummary(
  summary: string,
  keyPhrases: string[],
  boldTerms: string[]
): string {
  if (!summary) return ''
  const spans = collectSpans(summary, keyPhrases, boldTerms)
  if (!spans.length) return escapeHtml(summary)

  let out = ''
  let cursor = 0
  for (const span of spans) {
    if (span.start < cursor) continue
    out += escapeHtml(summary.slice(cursor, span.start))
    const raw = summary.slice(span.start, span.end)
    if (span.type === 'phrase') {
      out += '<mark class="cclear-phrase">' + escapeHtml(raw) + '</mark>'
    } else {
      out += '<strong class="cclear-term">' + escapeHtml(raw) + '</strong>'
    }
    cursor = span.end
  }
  out += escapeHtml(summary.slice(cursor))
  return out
}

/** @deprecated use formatEmphasizedSummary */
export function highlightedSummary(summary: string, keyPoints: string[]): string {
  const phrases = keyPoints.filter((k) => k.trim().split(/\s+/).length >= 2)
  const terms = keyPoints.filter((k) => k.trim().split(/\s+/).length < 2)
  return formatEmphasizedSummary(summary, phrases, terms)
}

const ORIG_TOGGLE_JS = `(function(btn){
  var p=btn.closest('[data-cclear-simplified]');
  var o=p&&p.querySelector('.cclear-original-inline');
  if(o){o.hidden=!o.hidden;btn.textContent=o.hidden?'show original':'hide original';}
})(this)`

type SummaryInline = {
  summary?: string
  keyPhrases?: string[]
  boldTerms?: string[]
  keyPoints?: string[]
  original?: string | null
}

function normalizeEmphasis(item: SummaryInline): { keyPhrases: string[]; boldTerms: string[] } {
  const legacy = item.keyPoints?.filter(Boolean).map(String) ?? []
  const legacyPhrases = legacy.filter((k) => k.trim().split(/\s+/).length >= 2)
  const legacyTerms = legacy.filter((k) => k.trim().split(/\s+/).length < 2)
  return {
    keyPhrases: [...(item.keyPhrases ?? []), ...legacyPhrases].filter(Boolean),
    boldTerms: [...(item.boldTerms ?? []), ...legacyTerms].filter(Boolean)
  }
}

/**
 * Final innerHTML injected into marked elements (trusted: our own strings).
 */
export function buildReplacementInnerHtml(
  item: SummaryInline,
  strippedOriginalFallback: string,
  isSearch = false
): string {
  const summary = item.summary ?? ''
  const { keyPhrases, boldTerms } = normalizeEmphasis(item)

  let html =
    '<span class="cclear-summary-text">' +
    formatEmphasizedSummary(summary, keyPhrases, boldTerms) +
    '</span>'

  if (isSearch) {
    return html
  }

  html +=
    '<button type="button" class="cclear-toggle-inline" onclick="' +
    ORIG_TOGGLE_JS.replace(/"/g, '&quot;') +
    '">show original</button>'

  const origPlain =
    item.original != null ? String(item.original).replace(/\r/g, '') : strippedOriginalFallback

  html += '<div class="cclear-original-inline" hidden>' + escapeHtml(origPlain) + '</div>'

  return html
}
