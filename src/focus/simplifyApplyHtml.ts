function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type SpanKind = 'mark' | 'term'

/**
 * Greedy left-to-right: longest span at each index wins.
 * Phrase highlights become <mark>; single-word terms become <strong>.
 */
export function emphasizedSummary(
  summary: string,
  highlightPhrases: string[],
  termEmphasis: string[]
): string {
  const spans: Array<{ text: string; kind: SpanKind }> = []
  for (const p of highlightPhrases) {
    const t = String(p).trim()
    if (t.split(/\s+/).length < 2) continue
    spans.push({ text: t, kind: 'mark' })
  }
  for (const w of termEmphasis) {
    const t = String(w).trim()
    if (!t || /\s/.test(t)) continue
    spans.push({ text: t, kind: 'term' })
  }
  spans.sort((a, b) => b.text.length - a.text.length)

  let i = 0
  let out = ''
  while (i < summary.length) {
    let best: { len: number; kind: SpanKind } | null = null
    for (const sp of spans) {
      const pl = sp.text.length
      if (pl <= 0 || i + pl > summary.length) continue
      if (summary.slice(i, i + pl).toLowerCase() !== sp.text.toLowerCase()) continue
      if (!best || pl > best.len) best = { len: pl, kind: sp.kind }
    }
    if (!best) {
      out += escapeHtml(summary.slice(i, i + 1))
      i += 1
      continue
    }
    const raw = summary.slice(i, i + best.len)
    if (best.kind === 'mark') {
      out += '<mark class="cclear-highlight">' + escapeHtml(raw) + '</mark>'
    } else {
      out += '<strong class="cclear-term">' + escapeHtml(raw) + '</strong>'
    }
    i += best.len
  }
  return out
}

/** @deprecated use emphasizedSummary — kept for tests that still pass phrases only */
export function highlightedSummary(summary: string, highlightPhrases: string[]): string {
  return emphasizedSummary(summary, highlightPhrases, [])
}

type SummaryInline = {
  summary?: string
  highlightPhrases?: string[]
  termEmphasis?: string[]
  original?: string | null
}

/**
 * Swap the paragraph's own text. Do not add chrome, buttons, or a second layout.
 */
export function buildReplacementInnerHtml(
  item: SummaryInline,
  _strippedOriginalFallback: string,
  _isSearch: boolean = false
): string {
  const summary = item.summary ?? ''
  const phrases = item.highlightPhrases?.filter(Boolean).map(String) ?? []
  const terms = item.termEmphasis?.filter(Boolean).map(String) ?? []
  const sentences = splitForDisplay(summary)
  // Two or more sentences: one per line, so a simplified paragraph reads as short lines instead of a wall of text.
  if (sentences.length >= 2) {
    return (
      '<span class="cclear-summary-text cclear-lines">' +
      sentences.map((x) => '<span class="cclear-sent">' + emphasizedSummary(x, phrases, terms) + '</span>').join('') +
      '</span>'
    )
  }
  return '<span class="cclear-summary-text">' + emphasizedSummary(summary, phrases, terms) + '</span>'
}

/** Sentence split used only for display; keeps abbreviations like "U.S." and decimals intact. */
export function splitForDisplay(text: string): string[] {
  const parts = text.trim().split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
  const out: string[] = []
  for (const p of parts) {
    const prev = out[out.length - 1]
    // glue back a split after a short abbreviation ("Dr.", "U.S.", "St.")
    if (prev && /(?:\b[A-Z][a-z]?|\b[A-Z]\.[A-Z])\.$/.test(prev) && prev.split(/\s+/).length <= 2) out[out.length - 1] = `${prev} ${p}`
    else out.push(p)
  }
  return out.filter(Boolean)
}
