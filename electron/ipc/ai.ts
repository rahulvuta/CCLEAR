import { ipcMain } from 'electron'
import type { ChatMessage, SimplifyChunk, SimplifyResult, TabContextItem, TabContextSummary } from '../../src/shared/types'
import { heuristicInferContext, originUrlFromHistory } from '../../src/ai/heuristicContext'
import { wantsBrowserAction } from '../../src/ai/chatIntent'
import { finalizeNavigation, buildCompoundSummarySystemPrompt } from '../../src/ai/navigationSanitize'
import { DEFAULT_MODEL, checkOllamaHealth, checkVisionModelHealth, ollamaGenerate, ollamaVisionChat } from '../../src/ai/ollamaClient'
import { needsScreenVision } from '../../src/ai/screenVision'
import {
  extractWebLookupTag,
  needsWebLookup,
  performWebLookup,
  refineLookupQuery,
  stripWebLookupTags
} from '../../src/ai/webLookup'
import {
  finalizeModelSimplify,
  heuristicSimplifyChunks
} from '../../src/focus/heuristicSimplify'
import { blockTextHash } from '../../src/focus/textHash'

const CACHE_VERSION = 5
const summarizeCache = new Map<
  string,
  { summary: string; keyPhrases: string[]; boldTerms: string[]; at: number; v: number }
>()
const CACHE_TTL_MS = 1000 * 60 * 30
const CACHE_MAX = 128
const CHAT_TIMEOUT_MS = 45000

type ParsedSimplifyItem = {
  id?: string
  summary?: string
  keyPhrases?: string[]
  boldTerms?: string[]
  keyPoints?: string[]
}

function tryParseJsonArray(raw: string): ParsedSimplifyItem[] | null {
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

function tryParseJsonObject(raw: string): { inferredReason?: string; summary?: string } | null {
  const t = raw.trim()
  const unfenced = t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    const parsed = JSON.parse(unfenced)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    return null
  } catch {
    const match = unfenced.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
      } catch {
        return null
      }
    }
    return null
  }
}

const INFER_CONTEXT_ERROR: TabContextSummary = {
  inferredReason: "Couldn't infer context",
  summary: 'Try again after the page finishes loading'
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

function getLastUserMessage(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return messages[i].content
  }
  return null
}

function buildChatSystemPrompt(
  tabs: TabContextItem[],
  activeTabId: string | undefined,
  screenText: string | undefined,
  lookupContext?: string
): string {
  const context = buildNavigationContextSnippet(tabs, activeTabId)
  const activeScreen = screenText
    ? `\nCURRENT SCREEN TEXT (What you currently see on the active tab):\n"""\n${screenText.substring(0, 3000)}\n"""\n`
    : ''
  const lookupBlock = lookupContext
    ? `\nBACKGROUND WEB LOOKUP (already fetched — use this to answer factual/time-sensitive questions; do NOT mention searching):\n"""\n${lookupContext}\n"""\n`
    : ''

  return [
    'You are CCLEAR Focus, an advanced, highly capable, and casually conversational AI agent built directly into the browser.',
    'You act like a human assistant. You can chat casually, answer questions directly, retain conversational context, and deeply understand what the user wants to accomplish.',
    'You ALSO have the ability to directly control the browser by including invisible action tags in your response. You can string them together to complete complex tasks.',
    'ACTION TAGS:',
    '- [GOTO: url] -> Navigate the current tab to the URL. ONLY use a URL that appears verbatim in BACKGROUND WEB LOOKUP — never invent URLs.',
    '- [NEW_TAB: url] -> Open a new tab with the URL.',
    '- [SEARCH: query] -> Search Google for a query (visible to user — opens Google in their tab). Prefer this when finding articles.',
    '- [WEB_LOOKUP: query] -> Silently look up current information. User will NOT see this. Use for weather, news, scores, prices, or anything after your training cutoff.',
    '- [CLICK: text] -> Click a button or link containing this exact text.',
    '- [TYPE: label, text] -> Type text into an input field (e.g. [TYPE: search, how to make fried rice]). It auto-submits.',
    '- [BACK] -> Go back in history.',
    '- [FORWARD] -> Go forward.',
    '- [RELOAD] -> Reload page.',
    '- [PLAY_YOUTUBE: query] -> Instantly search for and play the top YouTube video for a query.',
    '',
    'RULES:',
    '1. If the user is just chatting (e.g. "Hello", "How are you"), reply normally without using any action tags.',
    '2. If the user asks you to DO something in the browser (e.g. "play a video about cats", "find a tutorial", "go to wikipedia"), USE the browser action tags.',
    '3. If the user asks a factual/time-sensitive question (weather, news, scores, current events), answer from BACKGROUND WEB LOOKUP if provided, or emit [WEB_LOOKUP: query]. Use [SEARCH:] or [GOTO:] only when the user also wants you to open a page or find an article — not for pure factual Q&A.',
    '3b. When the user wants an article opened after research, give a brief factual answer only (1-2 sentences from lookup). Do NOT say you will open pages, find articles, or describe article contents. Navigation is automatic.',
    '4. When using browser control tags (not WEB_LOOKUP), add ONE short confirmation sentence. Never write a second paragraph that talks to yourself (no "Let me find..." followed by "Sure, pulling up...").',
    '5. You can see the user\'s open tabs and the actual text of the webpage they are looking at.',
    '6. When the user asks about visual content on their screen, a screenshot may be analyzed — answer from what is visible.',
    '7. When answering from lookup results, be concise and natural. Never mention that you searched the web.',
    lookupBlock,
    'OPEN TABS CONTEXT:',
    context || '(no tabs)',
    activeScreen
  ].join('\n')
}

function buildLookupAnswerSystemPrompt(lookupContext: string): string {
  const fetchedLine = lookupContext.match(/^Fetched: .+$/m)?.[0] ?? `Fetched: ${new Date().toISOString()}`
  return [
    'You are CCLEAR Focus, a helpful browser assistant.',
    'Answer the user using ONLY the web lookup results below.',
    'Quote exact numbers, names, and dates from the snippets when available.',
    'If snippets conflict or are too vague, say you could not verify that precisely.',
    'Do NOT use your training knowledge when lookup text is present.',
    'Be concise, conversational, and natural. Do NOT mention searching or lookups.',
    'If the lookup results are empty or insufficient, say you could not find current information.',
    'Do NOT invent facts not supported by the lookup results.',
    'Do NOT use any action tags in your response.',
    fetchedLine
  ].join('\n') + `\n\nWEB LOOKUP RESULTS:\n"""\n${lookupContext}\n"""`
}

function buildVisionPrompt(userQuestion: string, screenText?: string): string {
  const textBlock = screenText?.trim()
    ? `\n\nSupplementary page text (may be incomplete):\n"""\n${screenText.substring(0, 2000)}\n"""`
    : ''
  return `User question: ${userQuestion}${textBlock}`
}

function buildLookupPrompt(messages: ChatMessage[], lastUser: string): string {
  const recent = messages
    .slice(-4)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')
  return recent || `user: ${lastUser}`
}

function formatChatError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('timed out')) {
    return new Error(
      'The assistant took too long to respond. Try a shorter question, or wait a moment if Ollama is loading a model.'
    )
  }
  return new Error(msg || 'AI request failed')
}

function finalizeChatResponse(
  response: string,
  lookupContext: string | undefined,
  lastUser: string | null,
  options?: { compoundAction?: boolean }
): string {
  const stripped = stripWebLookupTags(response)
  return finalizeNavigation(stripped, lookupContext, lastUser ?? '', options)
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
        screenImageBase64?: string
      }
    ) => {
      const health = await checkOllamaHealth()
      if (!health.ok) {
        throw new Error(
          `${health.error}\nTip: Install Ollama, run it, then: ollama pull ${DEFAULT_MODEL}`
        )
      }
      const prompt = payload.messages.map((m) => `${m.role}: ${m.content}`).join('\n')
      const lastUser = getLastUserMessage(payload.messages)

      const wantsVision = Boolean(lastUser && needsScreenVision(lastUser))
      if (wantsVision && payload.screenImageBase64 && lastUser) {
        const visionHealth = await checkVisionModelHealth()
        if (visionHealth.ok) {
          try {
            return await ollamaVisionChat({
              system:
                'You are CCLEAR Focus. Describe what you see on the browser screen and answer the user question. Be concise. Do not mention screenshots, images, or AI vision.',
              userText: buildVisionPrompt(lastUser, payload.screenText),
              imageBase64: payload.screenImageBase64,
              temperature: 0.2,
              timeoutMs: 90000
            })
          } catch (e) {
            throw formatChatError(e)
          }
        }

        const fallback = await ollamaGenerate({
          system: buildChatSystemPrompt(
            payload.tabs ?? [],
            payload.activeTabId,
            payload.screenText
          ),
          prompt,
          temperature: 0.25,
          timeoutMs: CHAT_TIMEOUT_MS
        })
        return `${fallback.trim()}\n\n(Note: Vision model unavailable — answering from page text only.)`
      }

      let lookupContext = ''
      if (lastUser && !wantsVision && needsWebLookup(lastUser)) {
        lookupContext = await performWebLookup(refineLookupQuery(lastUser)).catch(() => '')
      }

      try {
        const hasLookup = Boolean(lookupContext)
        const hasAction = Boolean(lastUser && wantsBrowserAction(lastUser))
        const lookupPrompt = lastUser
          ? buildLookupPrompt(payload.messages, lastUser)
          : prompt

        if (hasLookup && hasAction) {
          const summary = await ollamaGenerate({
            system: buildCompoundSummarySystemPrompt(lookupContext),
            prompt: lookupPrompt,
            temperature: 0.1,
            numPredict: 100,
            timeoutMs: CHAT_TIMEOUT_MS
          })
          return finalizeChatResponse(summary, lookupContext, lastUser, { compoundAction: true })
        }

        if (hasLookup) {
          const response = await ollamaGenerate({
            system: buildLookupAnswerSystemPrompt(lookupContext),
            prompt: lookupPrompt,
            temperature: 0.1,
            numPredict: 200,
            timeoutMs: CHAT_TIMEOUT_MS
          })
          return finalizeChatResponse(response, lookupContext, lastUser)
        }

        let response = await ollamaGenerate({
          system: buildChatSystemPrompt(
            payload.tabs ?? [],
            payload.activeTabId,
            payload.screenText
          ),
          prompt,
          temperature: 0.25,
          timeoutMs: CHAT_TIMEOUT_MS
        })

        const lookupQuery = extractWebLookupTag(response)
        if (lookupQuery) {
          lookupContext = await performWebLookup(refineLookupQuery(lookupQuery)).catch(() => '')
          const reactiveHasAction = Boolean(lastUser && wantsBrowserAction(lastUser))
          if (lookupContext && reactiveHasAction) {
            const summary = await ollamaGenerate({
              system: buildCompoundSummarySystemPrompt(lookupContext),
              prompt: lookupPrompt,
              temperature: 0.1,
              numPredict: 100,
              timeoutMs: CHAT_TIMEOUT_MS
            })
            return finalizeChatResponse(summary, lookupContext, lastUser, {
              compoundAction: true
            })
          } else {
            response = await ollamaGenerate({
              system: buildLookupAnswerSystemPrompt(
                lookupContext || 'Fetched: unknown\n\n(no results found)'
              ),
              prompt: lookupPrompt,
              temperature: 0.1,
              numPredict: 200,
              timeoutMs: CHAT_TIMEOUT_MS
            })
          }
        }

        return finalizeChatResponse(response, lookupContext || undefined, lastUser)
      } catch (e) {
        throw formatChatError(e)
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

    const results: Map<string, SimplifyResult> = new Map()
    const uncached: SimplifyChunk[] = []
    const now = Date.now()

    for (const chunk of chunks) {
      const contentKey = blockTextHash(chunk.text)
      const hit = summarizeCache.get(contentKey)
      if (hit && hit.v === CACHE_VERSION && now - hit.at < CACHE_TTL_MS) {
        results.set(chunk.id, {
          id: chunk.id,
          summary: hit.summary,
          keyPhrases: hit.keyPhrases,
          boldTerms: hit.boldTerms
        })
      } else {
        uncached.push(chunk)
      }
    }

    if (uncached.length === 0) {
      return chunks.map((c) => results.get(c.id)!)
    }

    const MAX_CHARS_PER_CHUNK = 280
    const AI_BATCH_SIZE = 8
    const AI_TOTAL_BUDGET_MS = 14000
    const aiStart = Date.now()

    const system = [
      'You rewrite text in plain language for clarity-focused readers.',
      'Rewrite the full meaning of the paragraph. Keep all names, numbers with units, definitions, and relationships.',
      'Do NOT shorten into trivia, snippet dates, source attributions, or URLs.',
      'Output ONLY a JSON array. No markdown.',
      'Each element: {"id":"...","summary":"...","keyPhrases":["...","..."],"boldTerms":["...","..."]}',
      'Hard rules:',
      '- summary: clear plain-language rewrite, shorter sentences; up to 40 words for long sources. Never omit names, numbers, or definitions.',
      '- keyPhrases: exactly 2 phrases, 2-7 words each — the most important ideas in the paragraph. Must be exact substrings of your summary. Prefer definitions, cause-effect, and named concepts (NOT openers like "The Sun is a").',
      '- boldTerms: 1-3 critical anchor words (numbers, units, proper nouns, or technical terms like "photosynthesis") — exact substrings of your summary.',
      'Return valid JSON only.'
    ].join('\n')

    const cacheResult = (chunk: SimplifyChunk, r: SimplifyResult) => {
      results.set(chunk.id, r)
      summarizeCache.set(blockTextHash(chunk.text), {
        summary: r.summary,
        keyPhrases: r.keyPhrases,
        boldTerms: r.boldTerms,
        at: now,
        v: CACHE_VERSION
      })
    }

    const processAiBatch = async (batch: SimplifyChunk[]) => {
      const numberedChunks = batch.map((c, i) => {
        const truncated = c.text.length > MAX_CHARS_PER_CHUNK
          ? c.text.slice(0, MAX_CHARS_PER_CHUNK) + '...'
          : c.text
        return `[${i}] id="${c.id}"\n${truncated}`
      }).join('\n\n')

      const prompt = `Rewrite these ${batch.length} text blocks in plain language:\n\n${numberedChunks}`
      const remainingMs = AI_TOTAL_BUDGET_MS - (Date.now() - aiStart)
      if (remainingMs < 800) return false

      try {
        const raw = await ollamaGenerate({
          system,
          prompt,
          temperature: 0.05,
          numPredict: Math.min(600, 80 * batch.length + 120),
          timeoutMs: Math.min(5000, remainingMs)
        })

        const parsed = tryParseJsonArray(raw)
        if (parsed && parsed.length > 0) {
          const chunkById = new Map(batch.map((c) => [c.id, c]))
          for (const item of parsed) {
            if (!item.id) continue
            const chunk = chunkById.get(String(item.id))
            if (!chunk) continue
            const finalized = finalizeModelSimplify(item.summary ?? '', {
              keyPhrases: Array.isArray(item.keyPhrases) ? item.keyPhrases.map(String) : [],
              boldTerms: Array.isArray(item.boldTerms) ? item.boldTerms.map(String) : [],
              keyPoints: Array.isArray(item.keyPoints) ? item.keyPoints.map(String) : [],
              chunkText: chunk.text
            })
            cacheResult(chunk, {
              id: String(item.id),
              summary: finalized.summary,
              keyPhrases: finalized.keyPhrases,
              boldTerms: finalized.boldTerms
            })
          }
          return true
        }
      } catch {
        //
      }
      return false
    }

    let pending = [...uncached]
    while (pending.length > 0 && Date.now() - aiStart < AI_TOTAL_BUDGET_MS) {
      const batch = pending.filter((c) => !results.has(c.id)).slice(0, AI_BATCH_SIZE)
      if (batch.length === 0) break

      const ok = await processAiBatch(batch)
      if (!ok) {
        for (const h of heuristicSimplifyChunks(batch)) {
          const chunk = batch.find((c) => c.id === h.id)
          if (chunk) cacheResult(chunk, h)
        }
      }

      pending = pending.filter((c) => !results.has(c.id))
    }

    pruneCache()

    const rest = heuristicSimplifyChunks(uncached.filter((c) => !results.has(c.id)))
    for (const r of rest) results.set(r.id, r)

    const final = chunks.map(
      (c) =>
        results.get(c.id) ??
        heuristicSimplifyChunks([c])[0] ?? {
          id: c.id,
          summary: '',
          keyPhrases: [],
          boldTerms: []
        }
    )
    return final
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
    const priorHistory = payload.historyUrls ?? []
    const originUrl = originUrlFromHistory(priorHistory)

    const heuristic = heuristicInferContext(payload.url, payload.title, priorHistory)
    if (heuristic) return heuristic

    const health = await checkOllamaHealth()
    if (!health.ok) {
      return {
        originUrl,
        inferredReason: 'AI unavailable',
        summary: 'Please install/start Ollama to get insights.'
      }
    }

    const system = [
      'You are a helpful assistant helping a CCLEAR user stay on track.',
      'Output ONLY a JSON object with "inferredReason" (short phrase, max 10 words) and "summary" (extremely short, max 5-7 words).',
      'Do not include markdown or explanations.'
    ].join('\n')
    const histStr = priorHistory.length > 0 ? priorHistory.join(', ') : 'None'
    const prompt = `Current Page: ${payload.title} (${payload.url})\nRecent History: ${histStr}\n\nInfer why the user opened this and what it is.`

    try {
      const raw = await ollamaGenerate({
        system, prompt, temperature: 0.2, numPredict: 100, timeoutMs: 8000
      })
      const parsed = tryParseJsonObject(raw)
      if (parsed) {
        return {
          originUrl,
          inferredReason: parsed.inferredReason || 'Browsing',
          summary: parsed.summary || 'A web page.'
        }
      }
    } catch {
      //
    }

    const searchFallback = heuristicInferContext(payload.url, payload.title, priorHistory)
    if (searchFallback) return searchFallback

    return { ...INFER_CONTEXT_ERROR, originUrl }
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
