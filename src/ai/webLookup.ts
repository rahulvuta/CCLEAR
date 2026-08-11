const LOOKUP_TIMEOUT_MS = 6000
const CACHE_TTL_MS = 60_000
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const lookupCache = new Map<string, { text: string; at: number }>()

const WEATHER_RE = /\b(weather|temperature|forecast|rain|snow|humidity|wind)\b/i
const TIME_SENSITIVE_RE =
  /\b(today|tonight|right now|currently|current|latest|recent|this week|this month|this year|now|live score|stock price|exchange rate)\b/i
const RECENT_YEAR_RE = /\b20(2[4-9]|3\d)\b/
const FACTUAL_RE = /\b(who (is|was|won)|what (is|was) the|when (is|was|did)|where (is|was)|how much (is|does|did)|score of|winner of|president of|ceo of)\b/i

const WMO_WEATHER: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm'
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), LOOKUP_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: {
        'User-Agent': USER_AGENT,
        ...(init?.headers ?? {})
      }
    })
  } finally {
    clearTimeout(timer)
  }
}

export function isWeatherQuery(message: string): boolean {
  return WEATHER_RE.test(message)
}

export function refineLookupQuery(userMessage: string): string {
  let q = userMessage.trim().replace(/\?+$/, '').trim()
  q = q.replace(
    /^(what(?:'s| is)|tell me|can you|could you|do you know|please|hey)\s+/i,
    ''
  )

  if (isWeatherQuery(userMessage)) {
    const location = extractWeatherLocation(userMessage)
    if (location) return `current weather ${location}`.slice(0, 120)
  }

  return q.slice(0, 120)
}

function dedupeSnippets(snippets: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of snippets) {
    const s = decodeHtmlEntities(raw.replace(/\s+/g, ' ').trim())
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

function formatNumberedSnippets(snippets: string[]): string {
  return dedupeSnippets(snippets)
    .slice(0, 6)
    .map((s, i) => `[${i + 1}] ${s}`)
    .join('\n')
}

export function needsWebLookup(message: string): boolean {
  const t = message.trim()
  if (!t) return false
  if (isWeatherQuery(t)) return true
  if (TIME_SENSITIVE_RE.test(t)) return true
  if (RECENT_YEAR_RE.test(t)) return true
  if (FACTUAL_RE.test(t)) return true
  return false
}

function extractWeatherLocation(query: string): string | null {
  const patterns = [
    /weather(?:\s+in|\s+for|\s+at|\s+near)?\s+(.+?)(?:\?|$)/i,
    /(?:temperature|forecast)(?:\s+in|\s+for|\s+at|\s+near)?\s+(.+?)(?:\?|$)/i,
    /(?:what(?:'s| is) the weather(?: like)? (?:in|for|at))\s+(.+?)(?:\?|$)/i
  ]
  for (const re of patterns) {
    const m = query.match(re)
    if (m?.[1]?.trim()) return m[1].trim().replace(/[?.!]+$/, '')
  }
  if (isWeatherQuery(query)) {
    const stripped = query
      .replace(/\b(what(?:'s| is)|tell me|how(?:'s| is)|check)\b/gi, '')
      .replace(/\b(the\s+)?weather\b/gi, '')
      .replace(/\b(temperature|forecast|like|right now|today|currently)\b/gi, '')
      .replace(/\b(in|for|at|near)\b/gi, '')
      .replace(/[?.!]+/g, '')
      .trim()
    if (stripped.length >= 2) return stripped
  }
  return null
}

async function geocodePlace(name: string): Promise<{
  name: string
  admin1?: string
  country?: string
  latitude: number
  longitude: number
} | null> {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=3&language=en&format=json`
  const geoRes = await fetchWithTimeout(geoUrl)
  if (!geoRes.ok) return null

  const geoData = (await geoRes.json()) as {
    results?: Array<{
      name: string
      admin1?: string
      country?: string
      latitude: number
      longitude: number
    }>
  }
  return geoData.results?.[0] ?? null
}

function locationCandidates(location: string): string[] {
  const trimmed = location.trim().replace(/[?.!]+$/, '')
  const candidates = [
    trimmed,
    trimmed.replace(/,\s*[A-Za-z]{2,}$/i, '').trim(),
    trimmed.replace(/\s+[A-Za-z]{2}$/i, '').trim(),
    trimmed.split(',')[0]?.trim() ?? ''
  ]
  return [...new Set(candidates.filter((c) => c.length >= 2))]
}

async function lookupWeather(location: string): Promise<string | null> {
  let place: Awaited<ReturnType<typeof geocodePlace>> = null
  for (const candidate of locationCandidates(location)) {
    place = await geocodePlace(candidate)
    if (place) break
  }
  if (!place) return null

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph'
  const forecastRes = await fetchWithTimeout(forecastUrl)
  if (!forecastRes.ok) return null

  const forecast = (await forecastRes.json()) as {
    current?: {
      temperature_2m?: number
      apparent_temperature?: number
      relative_humidity_2m?: number
      weather_code?: number
      wind_speed_10m?: number
    }
    current_units?: {
      temperature_2m?: string
      wind_speed_10m?: string
    }
  }
  const current = forecast.current
  if (!current) return null

  const placeLabel = [place.name, place.admin1, place.country].filter(Boolean).join(', ')
  const conditions = WMO_WEATHER[current.weather_code ?? -1] ?? 'Unknown conditions'
  const tempUnit = forecast.current_units?.temperature_2m ?? '°F'
  const windUnit = forecast.current_units?.wind_speed_10m ?? 'mph'

  const lines = [
    `Location: ${placeLabel}`,
    `Temperature: ${current.temperature_2m ?? 'N/A'} ${tempUnit}`.trim(),
    `Feels like: ${current.apparent_temperature ?? 'N/A'} ${tempUnit}`.trim(),
    `Conditions: ${conditions}`,
    `Humidity: ${current.relative_humidity_2m ?? 'N/A'}%`,
    `Wind: ${current.wind_speed_10m ?? 'N/A'} ${windUnit}`
  ]
  return lines.join('\n')
}

type DdgInstantResult = {
  AbstractText?: string
  Abstract?: string
  Answer?: string
  AnswerType?: string
  Heading?: string
  RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string }> }>
}

async function searchDuckDuckGoInstant(query: string): Promise<string[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  const res = await fetchWithTimeout(url)
  if (!res.ok) return []

  const data = (await res.json()) as DdgInstantResult
  const snippets: string[] = []

  if (data.Answer) snippets.push(`Answer: ${data.Answer}`)
  if (data.AbstractText) snippets.push(`${data.Heading ? data.Heading + ': ' : ''}${data.AbstractText}`)
  else if (data.Abstract) snippets.push(data.Abstract)

  const topics = data.RelatedTopics ?? []
  for (const topic of topics.slice(0, 4)) {
    if (topic.Text) {
      const url = topic.FirstURL ? ` (URL: ${topic.FirstURL})` : ''
      snippets.push(`${topic.Text}${url}`)
    }
    if (topic.Topics) {
      for (const sub of topic.Topics.slice(0, 2)) {
        if (sub.Text) snippets.push(sub.Text)
      }
    }
  }

  return snippets
}

function decodeDdgRedirect(href: string): string {
  try {
    const full = href.startsWith('//') ? `https:${href}` : href
    const u = new URL(full)
    const uddg = u.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
    return full
  } catch {
    return href
  }
}

function parseDuckDuckGoHtml(html: string): string[] {
  const snippets: string[] = []
  const resultRe =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = resultRe.exec(html)) !== null && snippets.length < 5) {
    const href = decodeDdgRedirect(decodeHtmlEntities(match[1]))
    const title = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, '').trim())
    const snippet = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '').trim())
    const urlPart = href.startsWith('http') ? ` (URL: ${href})` : ''
    if (title || snippet) snippets.push(`${title}: ${snippet}${urlPart}`.trim())
  }
  return snippets
}

async function searchDuckDuckGoHtml(query: string): Promise<string[]> {
  const body = new URLSearchParams({ q: query })
  const res = await fetchWithTimeout('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html'
    },
    body: body.toString()
  })
  if (!res.ok) return []
  const html = await res.text()
  return parseDuckDuckGoHtml(html)
}

async function searchDuckDuckGo(query: string): Promise<string> {
  const [instant, htmlResults] = await Promise.all([
    searchDuckDuckGoInstant(query).catch(() => [] as string[]),
    searchDuckDuckGoHtml(query).catch(() => [] as string[])
  ])
  const merged = formatNumberedSnippets([...instant, ...htmlResults])
  return merged
}

export async function performWebLookup(query: string): Promise<string> {
  const refined = refineLookupQuery(query)
  const key = normalizeQuery(refined)
  const cached = lookupCache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.text

  const fetchedAt = new Date().toISOString()
  const parts: string[] = []

  if (isWeatherQuery(query)) {
    const location = extractWeatherLocation(query)
    if (location) {
      try {
        const weather = await lookupWeather(location)
        if (weather) parts.push(`WEATHER DATA:\n${weather}`)
      } catch {
        // fall through to general search
      }
    }
  }

  if (parts.length === 0) {
    try {
      const searchResults = await searchDuckDuckGo(refined)
      if (searchResults) parts.push(`WEB SEARCH RESULTS:\n${searchResults}`)
    } catch {
      // graceful degradation
    }
  }

  const text =
    parts.length > 0 ? `Fetched: ${fetchedAt}\n\n${parts.join('\n\n')}` : `Fetched: ${fetchedAt}\n\n(no results found)`
  lookupCache.set(key, { text, at: Date.now() })
  return text
}

export function stripWebLookupTags(text: string): string {
  return text.replace(/\[WEB_LOOKUP:[\s\S]*?\]/gi, '').trim()
}

export function extractWebLookupTag(text: string): string | null {
  const m = text.match(/\[WEB_LOOKUP:\s*([\s\S]*?)\]/i)
  return m?.[1]?.trim() ?? null
}
