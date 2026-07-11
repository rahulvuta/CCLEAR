function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Greedy left-to-right: longest key phrase at each index wins — stable highlights.
 */
export function highlightedSummary(summary: string, keyPoints: string[]): string {
  const phrases = [...new Set(keyPoints.filter(Boolean).map(String))].sort((a, b) => b.length - a.length)
  let i = 0
  let out = ''
  while (i < summary.length) {
    let maxLen = 0
    for (const p of phrases) {
      const pl = p.length
      if (pl <= 0 || i + pl > summary.length) continue
      if (summary.slice(i, i + pl).toLowerCase() !== p.toLowerCase()) continue
      if (pl > maxLen) maxLen = pl
    }
    if (!maxLen) {
      out += escapeHtml(summary.slice(i, i + 1))
      i += 1
      continue
    }
    const rawPhrase = summary.slice(i, i + maxLen)
    out += '<mark class="adhd-highlight">' + escapeHtml(rawPhrase) + '</mark>'
    i += maxLen
  }
  return out
}

const ORIG_TOGGLE_JS = `(function(btn){
  var p=btn.closest('[data-adhd-simplified]');
  var o=p&&p.querySelector('.adhd-original-inline');
  if(o){o.hidden=!o.hidden;btn.textContent=o.hidden?'show original':'hide original';}
})(this)`

type SummaryInline = {
  summary?: string
  keyPoints?: string[]
  original?: string | null
}

/**
 * Final innerHTML injected into marked elements (trusted: our own strings).
 */
export function buildReplacementInnerHtml(item: SummaryInline, strippedOriginalFallback: string, isSearch: boolean = false): string {
  const summary = item.summary ?? ''
  const kp = item.keyPoints?.filter(Boolean).map(String) ?? []

  let html = '<span class="adhd-summary-text" style="color: inherit;">' + highlightedSummary(summary, kp) + '</span>'

  if (isSearch) {
    return html
  }

  const list = kp.slice(0, 3)
  if (list.length) {
    html += '<p class="adhd-look-for">Look for</p>'
    html += '<ul class="adhd-keypoints-inline">'
    for (const phrase of list) {
      html += '<li>' + escapeHtml(String(phrase)) + '</li>'
    }
    html += '</ul>'
  }

  html +=
    '<button type="button" class="adhd-toggle-inline" onclick="' +
    ORIG_TOGGLE_JS.replace(/"/g, '&quot;') +
    '">show original</button>'

  const origPlain =
    item.original != null ? String(item.original).replace(/\r/g, '') : strippedOriginalFallback

  html += '<div class="adhd-original-inline" hidden>' + escapeHtml(origPlain) + '</div>'

  return html
}
