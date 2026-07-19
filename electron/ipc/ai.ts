import { ipcMain } from 'electron'
import type { ChatMessage, SimplifyChunk, TabContextItem } from '../../src/shared/types'
import { DEFAULT_MODEL, checkOllamaHealth, ollamaGenerate } from '../../src/ai/ollamaClient'
import {
  finalizeModelSimplify,
  heuristicSimplifyChunks
} from '../../src/focus/heuristicSimplify'

const summarizeCache = new Map<string, { summary: string; keyPoints: string[]; at: number }>()
const CACHE_TTL_MS = 1000 * 60 * 30
const CACHE_MAX = 128

function tryParseJsonArray(raw: string): Array<{ id?: string; summary?: string; keyPoints?: string[] }> | null {
  const t = raw.trim()
  // strip markdown fences
  const unfenced = t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    const parsed = JSON.parse(unfenced)
    if (Array.isArray(parsed)) return parsed
    // If the model returned a single object, wrap it
    if (parsed && typeof parsed === 'object') return [parsed]
    return null
  } catch {
    // Try to find JSON array in the response
    const match = unfenced.match(/\[[\s\S]*\]/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
    return null
  }
}

function pruneCache() {
  if (summarizeCache.size <= CACHE_MAX) return
  const entries = [...summarizeCache.entries()].sort((a, b) => a[1].at - b[1].at)
  entries.slice(0, Math.floor(CACHE_MAX / 2)).forEach(([k]) => summarizeCache.delete(k))
}

function buildNavigationContextSnippet(tabs: TabContextItem[], activeTabId?: string): string {
  const lines = tabs.map((t) => {
    const mark = t.isActive || t.id === activeTabId ? '(active)' : ''
    return `- ${mark} Title: "${t.title}" URL: ${t.url}`
  })
  return lines.join('\n')
}

export function registerAiIpc() {
  ipcMain.handle(
    'ai:chat',
    async (
      _evt,
      payload: {
        messages: ChatMessage[]
        tabs: TabContextItem[]
        activeTabId?: string
        screenText?: string
      }
    ) => {
      const health = await checkOllamaHealth()
      if (!health.ok) {
        throw new Error(
          `${health.error}\nTip: Install Ollama, run it, then: ollama pull ${DEFAULT_MODEL}`
        )
      }
      const context = buildNavigationContextSnippet(payload.tabs ?? [], payload.activeTabId)
      const activeScreen = payload.screenText ? `\nCURRENT SCREEN TEXT (What you currently see on the active tab):\n"""\n${payload.screenText.substring(0, 3000)}\n"""\n` : ''
      const sys: ChatMessage = {
        role: 'system',
        content:
          [
            'You are CCLEAR Focus, an advanced, highly capable, and casually conversational AI agent built directly into the browser.',
            'You act like a human assistant. You can chat casually, answer questions directly, retain conversational context, and deeply understand what the user wants to accomplish.',
            'You ALSO have the ability to directly control the browser by including invisible action tags in your response. You can string them together to complete complex tasks.',
            'ACTION TAGS:',
            '- [GOTO: url] -> Navigate the current tab to the URL.',
            '- [NEW_TAB: url] -> Open a new tab with the URL.',
            '- [SEARCH: query] -> Search Google for a query.',
            '- [CLICK: text] -> Click a button or link containing this exact text.',
            '- [TYPE: label, text] -> Type text into an input field (e.g. [TYPE: search, how to make fried rice]). It auto-submits.',
            '- [BACK] -> Go back in history.',
            '- [FORWARD] -> Go forward.',
            '- [RELOAD] -> Reload page.',
            '- [PLAY_YOUTUBE: query] -> Instantly search for and play the top YouTube video for a query.',
            '',
            'RULES:',
            '1. If the user is just chatting (e.g. "Hello", "How are you"), reply normally without using any action tags.',
            '2. If the user asks you to DO something (e.g. "play a video about cats", "find a tutorial", "go to wikipedia"), USE the action tags.',
            '3. Whenever you use tags, you should ALSO output a brief, friendly confirmation text (e.g. "Sure, pulling that up now!"). Do NOT just output tags.',
            '4. You can see the user\'s open tabs and the actual text of the webpage they are looking at.',
            '',
            'OPEN TABS CONTEXT:',
            context || '(no tabs)',
            activeScreen
          ].join('\n')
      }
      // Use generate endpoint for chat too, via system+prompt for faster response
      try {
        return await ollamaGenerate({
          system: sys.content,
          prompt: payload.messages.map((m) => `${m.role}: ${m.content}`).join('\n'),
          temperature: 0.25
        })
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : 'AI request failed')
      }
    }
  )

  ipcMain.handle('ai:health', async () => {
    return checkOllamaHealth()
  })

  ipcMain.handle('ai:simplify-chunks', async (_evt, chunks: SimplifyChunk[]) => {
    const health = await checkOllamaHealth()

    /** Always succeed: when Ollama is off, shorten text instantly so Focus mode visibly works. */
    if (!health.ok) {
      return heuristicSimplifyChunks(chunks)
    }

    // Check cache first, separate cached vs uncached
    const results: Map<string, { id: string; summary: string; keyPoints: string[] }> = new Map()
    const uncached: SimplifyChunk[] = []
    const now = Date.now()

    for (const chunk of chunks) {
      const hit = summarizeCache.get(chunk.id)
      if (hit && now - hit.at < CACHE_TTL_MS) {
        results.set(chunk.id, { id: chunk.id, summary: hit.summary, keyPoints: hit.keyPoints })
      } else {
        uncached.push(chunk)
      }
    }

    // If everything was cached, return immediately
    if (uncached.length === 0) {
      return chunks.map((c) => results.get(c.id)!)
    }

    // Build a SINGLE prompt with all chunks numbered
    // Truncate each chunk to keep total prompt small and fast
    const MAX_CHARS_PER_CHUNK = 180
    const aiChunks = uncached.slice(0, 4)
    const numberedChunks = aiChunks.map((c, i) => {
      const truncated = c.text.length > MAX_CHARS_PER_CHUNK
        ? c.text.slice(0, MAX_CHARS_PER_CHUNK) + '...'
        : c.text
      return `[${i}] id="${c.id}"\n${truncated}`
    }).join('\n\n')

    const system = [
      'You radically compress text for clarity-focused readers. NOT a same-length paraphrase.',
      'Output ONLY a JSON array. No markdown.',
      'Each element: {"id":"...","summary":"...","keyPoints":["...","...","..."]}',
      'Hard rules:',
      `- summary: at most ${22} words, one or two short clauses. Cut filler, hedges, examples, and repetition. Must be clearly SHORTER than the source block.`,
      '- keyPoints: exactly 3 short phrases (2-7 words each) copied verbatim from YOUR summary so the UI can highlight them — pick the stakes, numbers, actions, risks, or names readers must notice.',
      '- If the source is long, summarize the single most important takeaway only.',
      'Return valid JSON only.'
    ].join('\n')

    const prompt = `Simplify these ${aiChunks.length} text blocks:\n\n${numberedChunks}`

    try {
      const raw = await ollamaGenerate({
        system,
        prompt,
        temperature: 0.05,
        numPredict: 250,
        /** Keep Focus mode responsive when the model stalls */
        timeoutMs: 3000
      })

      const parsed = tryParseJsonArray(raw)
      if (parsed && parsed.length > 0) {
        const chunkById = new Map(uncached.map((c) => [c.id, c]))
        for (const item of parsed) {
          if (!item.id) continue
          const rawSummary = item.summary ?? ''
          const rawKp = Array.isArray(item.keyPoints) ? item.keyPoints.slice(0, 4).filter(Boolean).map(String) : []
          const chunk = chunkById.get(String(item.id))
          const finalized = finalizeModelSimplify(rawSummary, rawKp, chunk?.text ?? '')
          const summary = finalized.summary
          const keyPoints = finalized.keyPoints
          results.set(item.id, { id: item.id, summary, keyPoints })
          summarizeCache.set(item.id, { summary, keyPoints, at: now })
        }
      } else {
        for (const h of heuristicSimplifyChunks(uncached)) {
          results.set(h.id, h)
          summarizeCache.set(h.id, { summary: h.summary, keyPoints: h.keyPoints, at: now })
        }
      }
      pruneCache()
    } catch {
      /** Timeout, parse failure, etc. → same instant path as offline */
      for (const h of heuristicSimplifyChunks(uncached)) {
        results.set(h.id, h)
        summarizeCache.set(h.id, { summary: h.summary, keyPoints: h.keyPoints, at: Date.now() })
      }
    }

    // Return in original order
    const rest = heuristicSimplifyChunks(
      chunks.filter((c) => !results.has(c.id))
    )
    for (const r of rest) results.set(r.id, r)

    return chunks.map(
      (c) =>
        results.get(c.id) ?? heuristicSimplifyChunks([c])[0] ?? { id: c.id, summary: '', keyPoints: [] }
    )
  })

  ipcMain.handle('ai:group-tabs', async (_evt, tabs: TabContextItem[]) => {
    if (tabs.length < 2) return []
    const health = await checkOllamaHealth()
    if (!health.ok) return []

    const tabsStr = tabs.map(t => `[${t.id}] Title: ${t.title} | URL: ${t.url}`).join('\n')
    const system = [
      'You categorize browser tabs based on their specific content topic.',
      'Output ONLY a JSON array of objects with "id" and "group".',
      'Example: [{"id":"1", "group":"Python Coding"}, {"id":"2", "group":"Electric Cars"}, {"id":"3", "group":"Python Coding"}]',
      'CRITICAL: Categorize by SUBJECT MATTER (e.g., Cooking, Science, Tech, Finance, Gaming) NOT by purpose (e.g., skip "Work", "Research", "Shopping", "Entertainment").',
      'Aim for clusters that reduce chaos. If a topic is very specific, use it. If a tab is unique, give it a topic or a slightly broader category.'
    ].join('\n')
    const prompt = `Cluster these tabs by their subject matter topic (ignore tasks/purpose):\n${tabsStr}`

    try {
      const raw = await ollamaGenerate({
        system, prompt, temperature: 0.1, numPredict: 150, timeoutMs: 5000
      })
      const t = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(t)
      if (Array.isArray(parsed)) return parsed
      return []
    } catch {
      return []
    }
  })

  ipcMain.handle('ai:infer-context', async (_evt, payload: { url: string, title: string, historyUrls: string[] }) => {
    const health = await checkOllamaHealth()
    if (!health.ok) return { inferredReason: 'AI unavailable', summary: 'Please install/start Ollama to get insights.' }

    const system = [
      'You are a helpful assistant helping a CCLEAR user stay on track.',
      'Output ONLY a JSON object with "inferredReason" (short phrase, max 10 words) and "summary" (extremely short, max 5-7 words).',
      'Do not include markdown or explanations.'
    ].join('\n')
    const histStr = payload.historyUrls.length > 0 ? payload.historyUrls.join(', ') : 'None'
    const prompt = `Current Page: ${payload.title} (${payload.url})\nRecent History: ${histStr}\n\nInfer why the user opened this and what it is.`

    try {
      const raw = await ollamaGenerate({
        system, prompt, temperature: 0.2, numPredict: 100, timeoutMs: 4000
      })
      const t = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(t)
      return {
        originUrl: payload.historyUrls[payload.historyUrls.length - 1],
        inferredReason: parsed.inferredReason || 'Browsing',
        summary: parsed.summary || 'A web page.'
      }
    } catch {
      return { inferredReason: 'Loading...', summary: 'Unable to analyze.' }
    }
  })

  ipcMain.handle('ai:recommend-links', async (_evt, historyUrls: string[]) => {
    if (historyUrls.length === 0) return []
    const health = await checkOllamaHealth()
    if (!health.ok) return []

    const system = [
      'You recommend exactly 6 websites for a user based on their browsing history.',
      'Output ONLY a JSON array of objects with "name" and "url".',
      'Example: [{"name":"Google", "url":"https://google.com"}, {"name":"GitHub", "url":"https://github.com"}]',
      'Pick the most relevant, useful sites related to their history. If history is short, fill the rest with popular safe sites like Wikipedia or YouTube.',
      'Return valid JSON only.'
    ].join('\n')

    const prompt = `Recent History:\n${historyUrls.slice(-30).join('\n')}\n\nRecommend 6 websites.`

    try {
      const raw = await ollamaGenerate({
        system, prompt, temperature: 0.3, numPredict: 300, timeoutMs: 5000
      })
      const t = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(t)
      if (Array.isArray(parsed)) return parsed.slice(0, 6)
      return []
    } catch {
      return []
    }
  })
}
