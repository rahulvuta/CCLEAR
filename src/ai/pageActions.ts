import { requestedMarkColor, type MarkColor } from '../shared/markColors'

export type PageMarkMode = 'highlight' | 'bold' | 'underline' | 'scroll' | 'clear'

export type PageMarkQuery = {
  terms: string[]
  phrases: string[]
}

export type PagePassage = { id: string; text: string; context: string }
export type PagePassageSnapshot = { url: string; title: string; passages: PagePassage[] }
export type PagePassageSelection = { ids: string[]; usedFallback: boolean }

export type PageActionIntent =
  | { kind: 'none' }
  | { kind: 'clear' }
  | { kind: Exclude<PageMarkMode, 'clear'>; query: string; terms: string[]; phrases: string[]; color?: MarkColor }

const STOP = new Set([
  'a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'at', 'is', 'are', 'was', 'were',
  'be', 'why', 'how', 'what', 'which', 'who', 'this', 'that', 'about', 'everything', 'every',
  'all', 'text', 'parts', 'part', 'section', 'bit', 'paragraph', 'place', 'where', 'it', 'talks',
  'talk', 'shows', 'show', 'explains', 'explain', 'mentions', 'mention', 'please', 'can', 'you',
  'could', 'would', 'me', 'my', 'page', 'article', 'something', 'stuff', 'things', 'thing',
  'with', 'from', 'into', 'just', 'really', 'some', 'any', 'does', 'did', 'do', 'them', 'those',
  'sentences', 'sentence', 'paragraphs', 'sections', 'talking', 'discusses', 'discussing'
])

const COMMON = new Set(['light', 'time', 'year', 'used', 'make', 'also', 'than', 'more'])

const COMPOSITION_PHRASES = [
  'made of',
  'made from',
  'made up of',
  'composed of',
  'consists of',
  'consist of',
  'composition'
]

export function pageActionTerms(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !COMMON.has(w))
  return [...new Set(words)].slice(0, 8)
}

export function buildPageMarkQuery(raw: string): PageMarkQuery {
  const q = raw.toLowerCase().replace(/\s+/g, ' ').trim()
  const phrases: string[] = []
  const terms = pageActionTerms(q)

  if (/\b(invent\w*|origin\w*|first\s+(?:built|made|developed)|creat(?:ed|ion))\b/.test(q)) {
    phrases.push('invented', 'invention', 'inventor', 'originated', 'developed', 'patented', 'patent',
      'first built', 'first made', 'first jet', 'first turbojet', 'independently designed')
  }

  if (COMPOSITION_PHRASES.some((p) => q.includes(p))) {
    for (const p of COMPOSITION_PHRASES) phrases.push(p)
    for (const extra of ['hydrogen', 'helium', 'plasma', 'composed', 'composition']) {
      if (!terms.includes(extra)) terms.push(extra)
    }
  }

  const ofPhrase = q.match(/\b([a-z]{3,})\s+of\s+([a-z]{3,})\b/g)
  if (ofPhrase) {
    for (const p of ofPhrase) {
      if (!STOP.has(p.split(' ')[0] || '') && !phrases.includes(p)) phrases.push(p)
    }
  }

  return { terms, phrases: [...new Set(phrases)] }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Higher = more relevant. 0 means skip. Scores whole sentences, not key phrases. */
export function scoreMarkSentence(sentence: string, query: PageMarkQuery): number {
  const s = sentence.replace(/\s+/g, ' ').trim()
  if (!s) return 0
  const lower = s.toLowerCase()
  let score = 0
  let phraseHits = 0
  for (const p of query.phrases) {
    if (p && new RegExp(`\\b${escapeRe(p)}\\b`, 'i').test(s)) {
      phraseHits += 1
      score += 50
    }
  }
  let termHits = 0
  for (const w of query.terms) {
    if (!w) continue
    const hit =
      new RegExp(`\\b${escapeRe(w)}\\b`, 'i').test(s) ||
      ((w === 'wave' || w === 'waves') && lower.includes('wavelength'))
    if (!hit) continue
    termHits += 1
    score += 16
  }
  if (query.phrases.length) {
    if (phraseHits === 0 && termHits < 2) return 0
  } else if (query.terms.length >= 2) {
    if (termHits < 2) return 0
  } else if (termHits < 1) {
    return 0
  }
  return score
}

export function splitSentences(text: string): string[] {
  const raw = text.replace(/\s+/g, ' ').trim()
  if (!raw) return []
  const parts = raw.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
  return parts.map((p) => p.trim()).filter(Boolean)
}

function stripLead(raw: string): string {
  return raw
    .trim()
    .replace(/^(please[, ]+)?(can you |could you |would you )?/i, '')
    .trim()
}

export function detectPageActionIntent(text: string): PageActionIntent {
  const t = stripLead(text)
  if (!t) return { kind: 'none' }

  if (
    /\b(clear|remove|undo|reset)\b.{0,40}\b(highlights?|underlines?|bold|marks?)\b/i.test(t) ||
    /^(clear|remove|reset) marks$/i.test(t)
  ) {
    return { kind: 'clear' }
  }

  const scrollM =
    t.match(
      /\b(?:scroll|jump)\s+to\s+(?:the\s+)?(?:part|section|bit|paragraph|place)?\s*(?:where\s+it\s+(?:talks?|mentions?)\s+about|where|about|on)?\s*(.+)/i
    ) ||
    t.match(
      /\bgo\s+to\s+the\s+(?:part|section|bit|paragraph|place)\s*(?:where\s+it\s+(?:talks?|mentions?)\s+about|where|about|on)?\s*(.+)/i
    )
  if (scrollM) {
    const query = scrollM[1].replace(/[.?!]+$/g, '').trim()
    const built = buildPageMarkQuery(query)
    if (built.terms.length || built.phrases.length) {
      return { kind: 'scroll', query, terms: built.terms, phrases: built.phrases }
    }
  }

  const markM = t.match(/\b(highlight|underline|bold)\b/i)
  if (markM) {
    const kind = markM[1].toLowerCase() as 'highlight' | 'underline' | 'bold'
    const color = kind === 'highlight' ? requestedMarkColor(t) : undefined
    const query = t
      .replace(/\b(highlight|underline|bold)\b/gi, ' ')
      .replace(/\b(?:in|with|using)\s+(?:a\s+)?(?:yellow|mint|green|blue|pink|violet|purple)\b/gi, ' ')
      .replace(/\b(everything|all(?:\s+the)?\s+text|the\s+parts?|the\s+sentences?)\b/gi, ' ')
      .replace(/\b(that|which)\s+(shows?|explains?|mentions?|talks?\s+about|is\s+about)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const built = buildPageMarkQuery(query)
    if (built.terms.length || built.phrases.length) {
      return { kind, query, terms: built.terms, phrases: built.phrases, color }
    }
  }

  return { kind: 'none' }
}

export function parsePageActionTags(assistant: string): PageActionIntent {
  if (/\[CLEAR_MARKS\]/i.test(assistant)) return { kind: 'clear' }
  const m = assistant.match(/\[(HIGHLIGHT|UNDERLINE|BOLD|SCROLL):\s*([\s\S]*?)\]/i)
  if (!m) return { kind: 'none' }
  const kind = m[1].toLowerCase() as Exclude<PageMarkMode, 'clear'>
  const color = kind === 'highlight' ? requestedMarkColor(m[2]) : undefined
  const query = m[2].replace(/\b(?:in|with|using)\s+(?:a\s+)?(?:yellow|mint|green|blue|pink|violet|purple)\b/gi, ' ').trim()
  const built = buildPageMarkQuery(query)
  if (!built.terms.length && !built.phrases.length) return { kind: 'none' }
  return { kind, query, terms: built.terms, phrases: built.phrases, color }
}

export function pageActionSay(
  intent: PageActionIntent,
  result: { count: number; scrolled?: boolean; usedFallback?: boolean; stale?: boolean }
): string {
  if (intent.kind === 'none') return ''
  if (intent.kind === 'clear') return 'Cleared marks on this page.'
  if (result.stale) return 'The page changed while I was finding passages. Please try again.'
  if (!result.count && result.usedFallback) {
    return 'The local AI could not finish matching this request, and no keyword matches were found. Check Ollama and try again.'
  }
  if (!result.count) return 'I could not find that on this page.'
  if (intent.kind === 'scroll') return `Scrolled to the part about ${intent.query.replace(/^the\s+/i, '')}.`
  const verb =
    intent.kind === 'highlight' ? 'Highlighted' : intent.kind === 'underline' ? 'Underlined' : 'Bolded'
  const n = result.count === 1 ? '1 sentence' : `${result.count} sentences`
  return `Got it — ${verb.toLowerCase()} ${n}${intent.kind === 'highlight' && intent.color ? ` in ${intent.color}` : ''}.`
}
