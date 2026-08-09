import type { TabContextSummary } from '../shared/types'

const SEARCH_HOST_RE = /google\.|duckduckgo\.|bing\.|yahoo\.|brave\.|kagi\./i

export function isSearchResultsUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (!SEARCH_HOST_RE.test(u.hostname)) return false
    if (u.searchParams.has('q') || u.searchParams.has('query') || u.searchParams.has('p')) return true
    return /\/search/i.test(u.pathname)
  } catch {
    return false
  }
}

function queryFromTitle(title: string): string | null {
  const t = title.trim()
  if (!t) return null
  const stripped = t
    .replace(/\s*[-–|]\s*Google Search$/i, '')
    .replace(/\s*[-–|]\s*DuckDuckGo$/i, '')
    .replace(/\s*[-–|]\s*Bing$/i, '')
    .trim()
  return stripped.length > 0 && stripped !== t ? stripped : t
}

function queryFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const q = u.searchParams.get('q') ?? u.searchParams.get('query') ?? u.searchParams.get('p')
    if (q) return decodeURIComponent(q.replace(/\+/g, ' ')).trim() || null
  } catch {
    //
  }
  return null
}

export function originUrlFromHistory(historyUrls: string[]): string | undefined {
  const last = historyUrls[historyUrls.length - 1]
  return last && last !== 'None' ? last : undefined
}

export function heuristicInferContext(
  url: string,
  title: string,
  historyUrls: string[]
): TabContextSummary | null {
  if (!isSearchResultsUrl(url)) return null

  const fromUrl = queryFromUrl(url)
  const fromTitle = queryFromTitle(title)
  const query = fromUrl ?? fromTitle

  return {
    originUrl: originUrlFromHistory(historyUrls),
    inferredReason: query ? `Searching for "${query}"` : 'Reviewing search results',
    summary: 'Pick a result to continue'
  }
}
