import type { Verdict } from '../shared/session'
import { normalizeHost } from './store'

export type GoalContext = { goal: string; steps?: string[]; allowedHosts?: string[] }
export type PageInfo = { url: string; title: string; text?: string }
export type Relevance = { score: number; verdict: Verdict; matched: string[]; reason: string }

const STOP = new Set([
  'the', 'and', 'for', 'with', 'about', 'from', 'that', 'this', 'have', 'need', 'want', 'make', 'write', 'read', 'finish',
  'start', 'work', 'working', 'study', 'studying', 'homework', 'assignment', 'project', 'research', 'look', 'find', 'learn',
  'into', 'some', 'what', 'how', 'why', 'when', 'where', 'then', 'also', 'just', 'get', 'got', 'should', 'would', 'could',
  'my', 'our', 'your', 'to', 'of', 'in', 'on', 'at', 'is', 'are', 'was', 'be', 'a', 'an', 'it', 'do', 'out', 'up', 'new',
  'essay', 'paper', 'report', 'notes', 'note', 'page', 'pages', 'free', 'online', 'best', 'top', 'com', 'www', 'https', 'http'
])

/** Sites that are rarely on-task for a study/work goal unless the page itself matches. */
const DISTRACTING = /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|twitter\.com|x\.com|reddit\.com|twitch\.tv|netflix\.com|hulu\.com|disneyplus\.com|9gag\.com|buzzfeed\.com|imgur\.com|pinterest\.com|snapchat\.com|roblox\.com|steampowered\.com|epicgames\.com|miniclip\.com|poki\.com|crazygames\.com|amazon\.com|ebay\.com|aliexpress\.com|etsy\.com|temu\.com|shein\.com)$/i

/** Tools that are almost always on-task for school/work. */
const UTILITY = /(^|\.)(docs\.google\.com|drive\.google\.com|classroom\.google\.com|canvas\.[a-z.]+|instructure\.com|schoology\.com|desmos\.com|wolframalpha\.com|khanacademy\.org|quizlet\.com|notion\.so|overleaf\.com|github\.com|stackoverflow\.com|wikipedia\.org|scholar\.google\.com|jstor\.org|britannica\.com)$/i

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|brave|kagi|ecosia)\.[a-z.]+$/i

function stem(w: string): string {
  return w.replace(/(ing|ed|es|s|ly)$/i, (m, _g, off) => (off >= 4 ? '' : m))
}

export function keywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map(stem)
  return [...new Set(words)]
}

function hostOf(url: string): string {
  try {
    return normalizeHost(new URL(url).hostname)
  } catch {
    return ''
  }
}

/** For search result pages the query is the best signal of intent. */
export function searchQuery(url: string): string {
  try {
    const u = new URL(url)
    if (!SEARCH.test(u.hostname) && !/youtube\.com$/i.test(u.hostname)) return ''
    return u.searchParams.get('q') || u.searchParams.get('search_query') || ''
  } catch {
    return ''
  }
}

/**
 * Cheap, explainable relevance. 'off' needs both no keyword overlap AND a reason to think the
 * page is a distraction; anything else uncertain stays 'unsure' so we never nag on a hunch.
 */
export function scoreRelevance(ctx: GoalContext, page: PageInfo): Relevance {
  const host = hostOf(page.url)
  if (!host || page.url === 'about:blank') return { score: 1, verdict: 'on', matched: [], reason: 'Blank page' }
  if ((ctx.allowedHosts ?? []).some((h) => host === h || host.endsWith(`.${h}`))) {
    return { score: 1, verdict: 'on', matched: [], reason: 'You marked this site as relevant' }
  }

  const goalWords = keywords([ctx.goal, ...(ctx.steps ?? [])].join(' '))
  if (!goalWords.length) return { score: 0.5, verdict: 'unsure', matched: [], reason: 'Goal has no specific topic words' }

  const query = searchQuery(page.url)
  const pageWords = new Set(keywords(`${page.title} ${query} ${page.url.replace(/^https?:\/\/[^/]+/, ' ')} ${(page.text ?? '').slice(0, 800)}`))
  const matched = goalWords.filter((w) => pageWords.has(w) || [...pageWords].some((p) => p.length > 4 && w.length > 4 && (p.startsWith(w) || w.startsWith(p))))
  const overlap = matched.length / Math.min(goalWords.length, 4)
  const distracting = DISTRACTING.test(host)
  const utility = UTILITY.test(host)

  let score = Math.min(1, overlap)
  if (utility) score = Math.max(score, 0.45)
  if (distracting && matched.length === 0) score = Math.min(score, 0.1)

  if (matched.length >= 1 && score >= 0.3) return { score, verdict: 'on', matched, reason: `Mentions ${matched.slice(0, 3).join(', ')}` }
  if (distracting && matched.length === 0) return { score, verdict: 'off', matched, reason: `${host} is usually a distraction and nothing here matches your goal` }
  if (SEARCH.test(host) && !query) return { score: 0.5, verdict: 'on', matched, reason: 'Search home' }
  return { score, verdict: utility ? 'on' : 'unsure', matched, reason: matched.length ? 'Partly related' : 'No obvious link to your goal' }
}
