import { wantsArticleNavigation } from './chatIntent'

const BLOCKED_HOSTS = [
  'google.com',
  'duckduckgo.com',
  'youtube.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'bing.com',
  'yahoo.com'
]

/** Sites that often require signup or a paywall */
const PAYWALLED_HOSTS = [
  'nytimes.com',
  'wsj.com',
  'washingtonpost.com',
  'ft.com',
  'economist.com',
  'bloomberg.com',
  'theatlantic.com',
  'newyorker.com',
  'barrons.com',
  'vanityfair.com',
  'theguardian.com',
  'telegraph.co.uk',
  'latimes.com',
  'bostonglobe.com',
  'businessinsider.com',
  'forbes.com',
  'hollywoodreporter.com',
  'variety.com',
  'deadline.com',
  'rollingstone.com',
  'indiewire.com',
  'wired.com',
  'time.com',
  'newsweek.com'
]

const OPEN_ACCESS_PRIORITY =
  /rottentomatoes|wikipedia|imdb\.com|collider\.com|screenrant|timeout\.com|britannica|bbc\.com|fandom\.com|mentalfloss|howstuffworks/i

const MONOLOGUE_RE =
  /\b(let me|I'll |I will |pulling up|opening that|find an article|enjoy reading|the article discusses|sure,|one moment|hang on)\b/i

function extractGotoTarget(text: string): string | null {
  const m = text.match(/\[GOTO:\s*([\s\S]*?)\]/i)
  return m?.[1]?.trim() ?? null
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function extractUrlsFromLookup(lookupContext: string): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  const re = /https?:\/\/[^\s"'<>)\]]+/gi
  for (const m of lookupContext.matchAll(re)) {
    const u = m[0].replace(/[.,;]+$/, '')
    const key = u.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      urls.push(u)
    }
  }
  return urls
}

function isBlockedHost(url: string): boolean {
  const host = hostname(url)
  if (!host) return true
  return BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))
}

function isPaywalledHost(url: string): boolean {
  const host = hostname(url)
  if (!host) return true
  return PAYWALLED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))
}

/** Pick a free-to-read URL from web lookup snippets. */
export function pickBestLookupUrl(lookupContext: string): string | null {
  const candidates = extractUrlsFromLookup(lookupContext).filter(
    (u) => !isBlockedHost(u) && !isPaywalledHost(u)
  )
  const openAccess = candidates.find((u) => OPEN_ACCESS_PRIORITY.test(u))
  return openAccess ?? candidates[0] ?? null
}

function normalizeNavUrl(raw: string): string {
  const t = raw.trim()
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

function urlMatchesLookup(gotoUrl: string, allowed: string[]): boolean {
  const normalized = normalizeNavUrl(gotoUrl)
  for (const u of allowed) {
    if (u === normalized || u === gotoUrl) return true
    try {
      const a = new URL(u)
      const b = new URL(normalized)
      if (a.origin === b.origin && a.pathname === b.pathname) return true
    } catch {
      //
    }
  }
  return false
}

export function buildArticleSearchQuery(lastUser: string): string {
  const q = lastUser
    .replace(
      /\b(research|then|take me to|go to|open|navigate to|find|show me|pull up|an? article about|about why)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()
  if (q.length >= 8) return q.slice(0, 120)
  return 'article analysis'
}

function buildSearchFromGoto(gotoTarget: string, lastUser: string): string {
  try {
    const normalized = normalizeNavUrl(gotoTarget)
    const u = new URL(normalized)
    const path = u.pathname
      .replace(/^\//, '')
      .replace(/[/_-]+/g, ' ')
      .replace(/\.\w+$/, '')
      .trim()
    if (path.length >= 8) {
      return `${path} ${u.hostname.replace(/^www\./, '')}`.slice(0, 120)
    }
  } catch {
    //
  }
  return buildArticleSearchQuery(lastUser)
}

function replaceGotoWithSearch(text: string, searchQuery: string): string {
  return text.replace(/\[GOTO:\s*[\s\S]*?\]/i, `[SEARCH: ${searchQuery}]`)
}

/** Remove markdown links, fake URLs, and assistant self-dialogue. */
export function cleanHallucinatedLinks(text: string): string {
  return text
    .replace(/\[[^\]]*\]\(https?:\/\/[^)]+\)/g, '')
    .replace(/^\s*\d+\.\s*\*\*[^*]+\*\*[^\n]*$/gm, '')
    .replace(/\bhttps?:\/\/[^\s\]]+/gi, '')
    .replace(/I'll open the first article[^\n]*/gi, '')
    .replace(/Sure, opening that article now!*/gi, '')
    .replace(/Sure, pulling up[^\n]*/gi, '')
    .replace(/Let's find an article[^\n]*/gi, '')
    .replace(/Let me find an article[^\n]*/gi, '')
    .replace(/Enjoy reading!*/gi, '')
    .replace(/The article discusses[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Keep at most 2 factual sentences; drop planning/navigation filler. */
export function extractBriefFactualReply(text: string): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && !MONOLOGUE_RE.test(s))
  return sentences.slice(0, 2).join(' ').trim()
}

export function buildShortLookupIntro(lookupContext: string, url: string): string {
  const host = hostname(url)
  const first = lookupContext.match(/\[1\]\s*([^:(]+)/)?.[1]?.trim()
  if (first) {
    return `From search results, ${first} looks like a strong lead. Opening ${host || 'a free article'} for you.`
  }
  return `Opening ${host || 'a free article'} based on what I found.`
}

/**
 * Research + navigate: brief factual line + open best free URL from lookup.
 */
export function ensureCompoundNavigation(
  response: string,
  lookupContext: string,
  _lastUser: string
): string {
  const bestUrl = pickBestLookupUrl(lookupContext)
  const brief = extractBriefFactualReply(cleanHallucinatedLinks(response))

  if (bestUrl) {
    const intro = brief || buildShortLookupIntro(lookupContext, bestUrl)
    return `${intro}\n\n[GOTO: ${bestUrl}]`
  }

  const cleaned = cleanHallucinatedLinks(response)
  if (!/\[(GOTO|SEARCH):/i.test(cleaned)) {
    const q = buildArticleSearchQuery(_lastUser)
    const intro = brief || "I couldn't find a direct free article link — trying a broader search."
    return `${intro}\n\n[SEARCH: ${q}]`
  }

  return brief || cleaned
}

/** Prevent hallucinated direct URLs when not from lookup. */
export function sanitizeNavigationTags(
  response: string,
  lookupContext: string | undefined,
  lastUser: string
): string {
  const goto = extractGotoTarget(response)
  if (!goto) return cleanHallucinatedLinks(response)

  const allowed = lookupContext ? extractUrlsFromLookup(lookupContext) : []
  if (allowed.length > 0 && urlMatchesLookup(goto, allowed) && !isPaywalledHost(goto)) {
    return response
  }

  const query = buildSearchFromGoto(goto, lastUser)
  return replaceGotoWithSearch(cleanHallucinatedLinks(response), query)
}

export function finalizeNavigation(
  response: string,
  lookupContext: string | undefined,
  lastUser: string,
  options?: { compoundAction?: boolean }
): string {
  const user = lastUser.trim()
  if (options?.compoundAction && lookupContext) {
    return ensureCompoundNavigation(response, lookupContext, user)
  }
  if (wantsArticleNavigation(user) && lookupContext) {
    return ensureCompoundNavigation(response, lookupContext, user)
  }
  return sanitizeNavigationTags(response, lookupContext, user)
}

export function buildCompoundSummarySystemPrompt(lookupContext: string): string {
  const fetchedLine = lookupContext.match(/^Fetched: .+$/m)?.[0] ?? ''
  return [
    'You are CCLEAR Focus, a helpful browser assistant.',
    'The user asked for research. Answer using ONLY the web lookup snippets below.',
    'Write exactly 1-2 short sentences. State only facts present in the snippets.',
    'Do NOT say you will open, find, or navigate anywhere.',
    'Do NOT describe article contents you have not read.',
    'Do NOT invent nationalities, plot details, or reasons for success unless explicitly in the snippets.',
    'Do NOT use action tags or URLs.',
    fetchedLine
  ]
    .filter(Boolean)
    .join('\n') + `\n\nWEB LOOKUP RESULTS:\n"""\n${lookupContext}\n"""`
}
