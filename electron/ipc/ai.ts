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
      }
    ) => {
      const health = await checkOllamaHealth()
      if (!health.ok) {
        throw new Error(
          `${health.error}\nTip: Install Ollama, run it, then: ollama pull ${DEFAULT_MODEL}`
        )
      }
      const context = buildNavigationContextSnippet(payload.tabs ?? [], payload.activeTabId)
      const sys: ChatMessage = {
        role: 'system',
        content:
          [
            'You are Focus, a concise assistant inside an ADHD-focused browser.',
            'Use OPEN TABS CONTEXT to suggest where to navigate when asked.',
            'Prefer short bullets. No fluff. If recommending a destination, cite the URL from the tabs list.',
            'If unsure, suggest a search query.',
            '',
            'OPEN TABS CONTEXT:',
            context || '(no tabs)'
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
    const numberedChunks = uncached.map((c, i) => {
      const truncated = c.text.length > MAX_CHARS_PER_CHUNK
        ? c.text.slice(0, MAX_CHARS_PER_CHUNK) + '...'
        : c.text
      return `[${i}] id="${c.id}"\n${truncated}`
    }).join('\n\n')

    const system = [
      'You radically compress text for ADHD readers. NOT a same-length paraphrase.',
      'Output ONLY a JSON array. No markdown.',
      'Each element: {"id":"...","summary":"...","keyPoints":["...","...","..."]}',
      'Hard rules:',
      `- summary: at most ${22} words, one or two short clauses. Cut filler, hedges, examples, and repetition. Must be clearly SHORTER than the source block.`,
      '- keyPoints: exactly 3 short phrases (2-7 words each) copied verbatim from YOUR summary so the UI can highlight them — pick the stakes, numbers, actions, risks, or names readers must notice.',
      '- If the source is long, summarize the single most important takeaway only.',
      'Return valid JSON only.'
    ].join('\n')

    const prompt = `Simplify these ${uncached.length} text blocks:\n\n${numberedChunks}`

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
}
