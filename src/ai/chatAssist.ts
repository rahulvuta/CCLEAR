import type { ChatMessage } from '../shared/types'

const WIKI_UA = 'CCLEAR-Focus/1.0 (https://github.com/rahulvuta/cclear; local desktop assistant)'

const STOP = new Set([
  'a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'at', 'is', 'are', 'was', 'were',
  'be', 'why', 'how', 'what', 'which', 'who', 'this', 'that', 'about', 'article', 'page', 'good',
  'best', 'me', 'my', 'you', 'your', 'can', 'could', 'would', 'please', 'find', 'show', 'take',
  'go', 'open', 'look', 'up', 'wikipedia', 'explains', 'explain', 'explaining', 'with', 'from',
  'into', 'just', 'really', 'some', 'any', 'does', 'did', 'do', 'looks', 'appear', 'appears'
])

const COLORS = new Set([
  'yellow', 'blue', 'red', 'orange', 'green', 'white', 'black', 'purple', 'pink', 'brown',
  'gray', 'grey', 'gold', 'violet', 'indigo'
])

const KNOWN_SITES: Record<string, string> = {
  wikipedia: 'https://en.wikipedia.org/',
  youtube: 'https://www.youtube.com/',
  google: 'https://www.google.com/',
  gmail: 'https://mail.google.com/',
  github: 'https://github.com/',
  reddit: 'https://www.reddit.com/',
  twitter: 'https://x.com/',
  x: 'https://x.com/'
}

export type ChatNavIntent =
  | { kind: 'none' }
  | { kind: 'goto'; url: string }
  | { kind: 'search'; query: string }
  | { kind: 'article'; topic: string }
  | { kind: 'youtube'; query: string }

export type ChatNavResult = {
  say: string
  actions: string
  url: string
  title?: string
  source: string
}

export type WikiHit = { title: string; snippet?: string; wordcount?: number }

export function compactChatContext(messages: ChatMessage[]): { memory: string; recent: string } {
  const turns = messages.filter((m) => m.role === 'user' || m.role === 'assistant')
  const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n)
  const recentTurns = turns.slice(-4)
  const older = turns.slice(0, Math.max(0, turns.length - 4))
  const memory = older
    .map((m) => `${m.role === 'user' ? 'U' : 'A'}: ${clip(m.content, 80)}`)
    .join('\n')
    .slice(0, 650)
  const recent = recentTurns.map((m) => `${m.role}: ${clip(m.content, 360)}`).join('\n')
  return { memory, recent }
}

export function extractTopic(raw: string): string {
  let s = raw.trim()
  s = s.replace(/^(please[, ]+)?(can you |could you |would you )?/i, '')
  s = s.replace(/^(no[, ]+)?((like|i mean|i meant|actually)\s+)/i, '')
  s = s.replace(/^(take me to|bring me to|go to|open|find|show me|look up|navigate to|pull up|search for)\s+/i, '')
  const about = s.match(/\b(?:article|page|wikipedia(?:\s+page)?)\s+about\s+(.+)/i)
  if (about) s = about[1]
  s = s.replace(/^(an?|the)\s+/i, '')
  s = s.replace(/^(good|best|decent|simple|short)\s+/i, '')
  s = s.replace(/^(article|page|site|website|link|wikipedia page|wikipedia)\s+/i, '')
  s = s.replace(/^(that\s+)?(explains?|explaining|about|on|for|regarding)\s+/i, '')
  return s.replace(/[.?!]+$/g, '').trim()
}

/** Noun phrase for Wikipedia lookup: "how a car engine works" -> "car engine" */
export function articleSearchPhrase(topic: string): string {
  const why = extractWhyParts(topic) || extractWhyParts(extractTopic(topic))
  if (why?.subject) return why.subject.replace(/\s+/g, ' ').trim()
  let s = extractTopic(topic)
  s = s.replace(/\b(regular|normal|typical|basic|simple|standard|ordinary)\b/gi, ' ')
  s = s.replace(/^(how|what)\s+/i, '')
  s = s.replace(/^(does|do|did|to)\s+/i, '')
  s = s.replace(/^(a|an|the)\s+/i, '')
  s = s.replace(/\s+(works|work|workings|function|functions)$/i, '')
  s = s.replace(/\s+(explained|explanation)$/i, '')
  return s.replace(/\s+/g, ' ').trim()
}

/** "why the sun is yellow" -> subject sun, rest yellow */
export function extractWhyParts(topic: string): { subject: string; rest: string } | null {
  const t = topic.trim()
  if (!/^why\b/i.test(t)) return null
  const afterAux = t.replace(
    /^why\s+(?:is|are|does|do|did|can|was|were)\s+(?:the|a|an)?\s*/i,
    ''
  )
  const afterWhy = afterAux === t ? t.replace(/^why\s+(?:the|a|an)\s+/i, '') : afterAux
  const copula = afterWhy.match(/^(.+?)\s+(?:is|are|looks?|appears?)\s+(.+)$/i)
  if (copula) return { subject: copula[1].trim(), rest: copula[2].trim() }
  const words = afterWhy.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return { subject: words[0], rest: words.slice(1).join(' ') }
  return null
}

function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s\]>)]+/i)
  return m ? m[0].replace(/[.,;]+$/, '') : null
}

export function detectChatNavIntent(text: string): ChatNavIntent {
  const t = text.trim()
  if (!t) return { kind: 'none' }

  const url = firstUrl(t)
  if (url && /\b(go to|open|visit|take me|navigate)\b/i.test(t)) {
    return { kind: 'goto', url }
  }
  if (url && /^(https?:\/\/\S+)$/i.test(t)) {
    return { kind: 'goto', url }
  }

  if (/\b(play|watch)\b/i.test(t) && /\b(youtube|video)\b/i.test(t)) {
    const topic = extractTopic(t.replace(/\b(play|watch|youtube|video)\b/gi, ' ')).replace(/\s+/g, ' ').trim()
    return { kind: 'youtube', query: topic || t }
  }

  const searchM = t.match(/^(search(?:\s+google)?(?:\s+for)?|google)\s+(.+)/i)
  if (searchM) {
    return { kind: 'search', query: searchM[2].trim() }
  }

  if (/\bgo to the (part|section|bit|paragraph|place)\b/i.test(t)) {
    return { kind: 'none' }
  }
  if (/\b(scroll|jump)\s+to\b/i.test(t) || /\b(highlight|underline|bold)\b/i.test(t)) {
    return { kind: 'none' }
  }

  const wantsNav =
    /^(please[, ]+)?(can you |could you )?(take me|bring me|go to|open|find|show me|look up|navigate|pull up)\b/i.test(t) ||
    /\b(take me to|bring me to|navigate to|look up|article about)\b/i.test(t)
  if (!wantsNav) return { kind: 'none' }

  const topic = extractTopic(t)
  const key = topic.toLowerCase().replace(/\s+/g, '')
  if (KNOWN_SITES[topic.toLowerCase()] || KNOWN_SITES[key]) {
    return { kind: 'goto', url: KNOWN_SITES[topic.toLowerCase()] || KNOWN_SITES[key] }
  }
  if (/^[\w-]+(\.[\w-]+)+$/.test(topic)) {
    return { kind: 'goto', url: `https://${topic}` }
  }
  if (!topic) return { kind: 'none' }
  return { kind: 'article', topic }
}

function contentWords(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
}

export function wikiTitleUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title).replace(/%20/g, '_')}`
}

const NICHE_TITLE = /\b(formula one|f1|grand prix|conure|parrot|surname)\b/i
const BRAND_ENGINE = /\b(amc|chrysler|chevrolet|ferrari|mercedes|porsche|bugatti|jaguar|mazda|judd|gm |ford )\b/i

export function scoreWikiHit(query: string, hit: WikiHit): number {
  const phrase = articleSearchPhrase(query).toLowerCase()
  const title = hit.title.toLowerCase()
  const snippet = String(hit.snippet || '')
    .replace(/<[^>]+>/g, '')
    .toLowerCase()
  const pWords = contentWords(phrase)
  const tWords = contentWords(title)
  let score = 0
  if (title === phrase) score += 120
  else if (title.startsWith(phrase) || phrase.startsWith(title)) score += 50
  const overlap = pWords.filter((w) => tWords.includes(w) || title === w).length
  score += overlap * 22
  score -= Math.max(0, tWords.length - Math.max(pWords.length, 1)) * 14
  if (pWords.length >= 1 && overlap === 0) score -= 40
  if (NICHE_TITLE.test(title) || NICHE_TITLE.test(snippet)) score -= 90
  if (BRAND_ENGINE.test(title) && !BRAND_ENGINE.test(phrase)) score -= 75
  if (/disambiguation/i.test(hit.title) || /may refer to/i.test(snippet)) score -= 100
  if (/\((film|novel|album|song|tv series)\)/i.test(hit.title) || /^half of a /i.test(hit.title)) score -= 120
  if (COLORS.has(title) && !COLORS.has(phrase)) score -= 70
  const wc = hit.wordcount || 0
  if (wc > 1500) score += 6
  if (wc > 0 && wc < 120) score -= 15
  return score
}

export function pickWikiHit(
  topic: string,
  hits: WikiHit[]
): { hit: WikiHit; score: number } | null {
  let best: WikiHit | null = null
  let bestScore = -999
  for (const hit of hits) {
    const s = scoreWikiHit(topic, hit)
    if (s > bestScore) {
      bestScore = s
      best = hit
    }
  }
  if (!best || bestScore < 15) return null
  return { hit: best, score: bestScore }
}

function isWeakWikiTitle(title: string): boolean {
  return (
    /disambiguation/i.test(title) ||
    /\((film|album|song|tv series)\)/i.test(title) ||
    NICHE_TITLE.test(title)
  )
}

async function wikiOpenSearch(query: string): Promise<Array<{ title: string; url: string }>> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=opensearch&limit=8&namespace=0&format=json` +
    `&search=${encodeURIComponent(query)}`
  const r = await fetch(url, {
    headers: { 'User-Agent': WIKI_UA, Accept: 'application/json' }
  })
  if (!r.ok) return []
  const data = (await r.json()) as [string, string[], string[], string[]]
  const titles = data[1] || []
  const urls = data[3] || []
  return titles.map((title, i) => ({ title, url: urls[i] }))
}

async function wikiSearch(query: string): Promise<WikiHit[]> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&list=search` +
    `&srsearch=${encodeURIComponent(query)}&srlimit=8&srprop=snippet|wordcount&format=json`
  const r = await fetch(url, {
    headers: { 'User-Agent': WIKI_UA, Accept: 'application/json' }
  })
  if (!r.ok) return []
  const data = (await r.json()) as { query?: { search?: WikiHit[] } }
  return data.query?.search ?? []
}

export async function findBestArticle(topic: string): Promise<{ url: string; title: string; source: string; score?: number; phrase?: string }> {
  const q = topic.trim()
  const phrase = articleSearchPhrase(q) || q
  try {
    const open = await wikiOpenSearch(phrase)
    const openHit = open.find((h) => h.title && h.url && !isWeakWikiTitle(h.title))
    if (openHit) {
      return { url: openHit.url, title: openHit.title, source: 'wikipedia', phrase }
    }
    const hits = await wikiSearch(phrase)
    const picked = pickWikiHit(phrase, hits)
    if (picked) {
      return {
        url: wikiTitleUrl(picked.hit.title),
        title: picked.hit.title,
        source: 'wikipedia',
        score: picked.score,
        phrase
      }
    }
  } catch {
    // fall through
  }
  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(phrase)}`,
    title: phrase,
    source: 'google',
    phrase
  }
}

export async function resolveChatNav(intent: ChatNavIntent): Promise<ChatNavResult | null> {
  if (intent.kind === 'none') return null
  if (intent.kind === 'goto') {
    return {
      say: `Opening ${intent.url}.`,
      actions: `[GOTO: ${intent.url}]`,
      url: intent.url,
      source: 'goto'
    }
  }
  if (intent.kind === 'search') {
    const url = `https://www.google.com/search?q=${encodeURIComponent(intent.query)}`
    return {
      say: `Searching for ${intent.query}.`,
      actions: `[SEARCH: ${intent.query}]`,
      url,
      source: 'search'
    }
  }
  if (intent.kind === 'youtube') {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(intent.query)}`
    return {
      say: `Playing ${intent.query} on YouTube.`,
      actions: `[PLAY_YOUTUBE: ${intent.query}]`,
      url,
      title: intent.query,
      source: 'youtube'
    }
  }
  const found = await findBestArticle(intent.topic)
  const say =
    found.source === 'wikipedia'
      ? `Opening ${found.title} on Wikipedia.`
      : `Searching for ${found.title}.`
  const actions =
    found.source === 'wikipedia' ? `[GOTO: ${found.url}]` : `[SEARCH: ${intent.topic}]`
  return { say, actions, url: found.url, title: found.title, source: found.source }
}
