import { ipcMain } from 'electron'
import type { ChatMessage, SimplifyChunk, TabContextItem, TabContextSummary } from '../../src/shared/types'
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
import { detectChatNavIntent, resolveChatNav } from '../../src/ai/chatAssist'
import { selectPagePassages } from '../../src/ai/pagePassages'
import type { PagePassageSnapshot } from '../../src/ai/pageActions'
import os from 'node:os'
import { createSimplifier, pickReviewer } from '../../src/ai/simplifyBlocks'
import { isEco, listInstalledModels } from '../../src/ai/ollamaClient'
import { buildRouterSystem, parseRouterOutput, ROUTER_SCHEMA } from '../../src/ai/router'
import { parseLegacyTags, proposeActions, stripLegacyTags, type ProposedAction, type ToolCall } from '../../src/ai/tools'
import { extractUrlsFromLookup } from '../../src/ai/navigationSanitize'
import { ASK_SCHEMA, buildAskPrompt, buildAskSystem, hasEvidence, parseAsk, rankPassages, type AskResult } from '../../src/ai/askPage'
import { dropsNumericDetails } from '../../src/focus/heuristicSimplify'
import { simplifySentences, type SentenceIn } from '../../src/ai/sentenceSimplify'
import { semanticScores } from '../../src/ai/embeddings'
import { buildTabsPrompt, buildTabsSystem, parseTabsAnswer, pickExcerpts, TABS_SCHEMA, type TabText } from '../../src/ai/askTabs'

export type AssistPayload = {
  requestId: string
  messages: ChatMessage[]
  tabs: TabContextItem[]
  activeTabId?: string
  screenText?: string
  screenImageBase64?: string
  goal?: string
}
export type AssistResult = { text: string; actions: ProposedAction[] }

/** In-flight assistant requests, so the UI can cancel them. */
const inflight = new Map<string, AbortController>()

const CHAT_TIMEOUT_MS = 45000

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

function getLastUserMessage(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return messages[i].content
  }
  return null
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

async function runAssist(
  payload: AssistPayload,
  signal: AbortSignal
): Promise<{ text: string; calls: ToolCall[]; trustedUrls: string[] }> {
  const lastUser = getLastUserMessage(payload.messages)
  const lastUserEarly = lastUser ?? ''

  // Deterministic "take me to X" resolver: its URLs come from Wikipedia/known sites, not the model.
  const nav = await resolveChatNav(detectChatNavIntent(lastUserEarly))
  if (nav) return { text: `${nav.say}\n${nav.actions}`, calls: [], trustedUrls: [nav.url] }

  const health = await checkOllamaHealth()
  if (!health.ok) {
    throw new Error(`${health.error}\nTip: Install Ollama, run it, then: ollama pull ${DEFAULT_MODEL}`)
  }
  const prompt = payload.messages.map((m) => `${m.role}: ${m.content}`).join('\n')

  const wantsVision = Boolean(lastUser && needsScreenVision(lastUser))
  if (wantsVision && payload.screenImageBase64 && lastUser) {
    const visionHealth = await checkVisionModelHealth()
    if (visionHealth.ok) {
      try {
        const text = await ollamaVisionChat({
          system:
            'You are CCLEAR. Describe what you see on the browser screen and answer the user question. Be concise. Do not mention screenshots, images, or AI vision.',
          userText: buildVisionPrompt(lastUser, payload.screenText),
          imageBase64: payload.screenImageBase64,
          temperature: 0.2,
          timeoutMs: 90000,
          signal
        })
        return { text, calls: [], trustedUrls: [] }
      } catch (e) {
        throw formatChatError(e)
      }
    }
  }

  let lookupContext = ''
  if (lastUser && !wantsVision && needsWebLookup(lastUser)) {
    lookupContext = await performWebLookup(refineLookupQuery(lastUser)).catch(() => '')
  }

  try {
    if (lookupContext) {
      const trustedUrls = extractUrlsFromLookup(lookupContext)
      const hasAction = Boolean(lastUser && wantsBrowserAction(lastUser))
      const lookupPrompt = lastUser ? buildLookupPrompt(payload.messages, lastUser) : prompt
      const raw = await ollamaGenerate({
        system: hasAction ? buildCompoundSummarySystemPrompt(lookupContext) : buildLookupAnswerSystemPrompt(lookupContext),
        prompt: lookupPrompt,
        temperature: 0.1,
        numPredict: hasAction ? 100 : 200,
        timeoutMs: CHAT_TIMEOUT_MS,
        priority: 'interactive',
        signal
      })
      return {
        text: finalizeChatResponse(raw, lookupContext, lastUser, hasAction ? { compoundAction: true } : undefined),
        calls: [],
        trustedUrls
      }
    }

    const raw = await ollamaGenerate({
      system: buildRouterSystem({
        goal: payload.goal,
        tabs: payload.tabs ?? [],
        activeTabId: payload.activeTabId,
        pageText: payload.screenText
      }),
      prompt,
      format: ROUTER_SCHEMA,
      directJson: true,
      temperature: 0.15,
      numPredict: 300,
      timeoutMs: CHAT_TIMEOUT_MS,
      priority: 'interactive',
      signal
    })
    const { say, calls } = parseRouterOutput(raw)
    return { text: say || 'Done.', calls, trustedUrls: [] }
  } catch (e) {
    throw formatChatError(e)
  }
}

export function registerAiIpc() {
  ipcMain.handle('ai:select-page-passages', async (_evt, payload: { query: string; snapshot: PagePassageSnapshot; kind?: string }) => {
    return selectPagePassages(payload.query, payload.snapshot, (p) => ollamaGenerate({ ...p, priority: 'interactive' }), (completed, total) => {
      if (!_evt.sender.isDestroyed()) {
        _evt.sender.send('ai:chat-progress', {
          think: '',
          content: `Got it — ${payload.kind === 'underline' ? 'underlining' : payload.kind === 'bold' ? 'emphasizing' : payload.kind === 'scroll' ? 'finding' : 'highlighting'} the part about “${payload.query.slice(0, 64)}”… ${total ? Math.round((completed / total) * 100) : 100}%`
        })
      }
    })
  })

  ipcMain.handle('ai:assist', async (_evt, payload: AssistPayload): Promise<AssistResult> => {
    const ctl = new AbortController()
    inflight.set(payload.requestId, ctl)
    try {
      const out = await runAssist(payload, ctl.signal)
      const userText = getLastUserMessage(payload.messages) ?? ''
      const calls = [...out.calls, ...parseLegacyTags(out.text)]
      return {
        text: stripLegacyTags(out.text),
        actions: proposeActions(calls, { userText, trustedUrls: out.trustedUrls })
      }
    } finally {
      inflight.delete(payload.requestId)
    }
  })

  /** Answer a question from the open page, with citations. Returns kind:'none' when the page lacks evidence. */
  ipcMain.handle(
    'ai:ask-page',
    async (_evt, p: { requestId: string; question: string; snapshot: PagePassageSnapshot }): Promise<{ kind: 'none' } | ({ kind: 'answer' } & AskResult)> => {
      const question = String(p.question ?? '').replace(/^\/ask\s*/i, '').trim()
      const all = (p.snapshot?.passages ?? []).slice(0, 5000)
      // Meaning-based scores when the local embedding model is installed; keywords otherwise.
      const semantic = await semanticScores(`${p.snapshot?.url}|${all.length}|${all[0]?.text.length}`, question, all.map((x) => (x.context ? `${x.context}. ${x.text}` : x.text)))
      const ranked = rankPassages(question, all, 6, semantic)
      if (!hasEvidence(ranked)) return { kind: 'none' }
      const quotes = (answer: string): { kind: 'answer' } & AskResult => ({
        kind: 'answer',
        answer,
        grounded: false,
        sources: ranked.slice(0, 3).map((r) => ({ n: r.n, id: r.id, text: r.text, context: r.context ?? '' }))
      })
      if (!(await checkOllamaHealth()).ok) return quotes('The local AI is not running, so here is the closest text on the page:')
      const ctl = new AbortController()
      inflight.set(p.requestId, ctl)
      try {
        const raw = await ollamaGenerate({
          system: buildAskSystem(),
          prompt: buildAskPrompt(question, ranked),
          format: ASK_SCHEMA,
          directJson: true,
          temperature: 0.1,
          numPredict: 260,
          numCtx: 4096,
          timeoutMs: 40000,
          priority: 'interactive',
          signal: ctl.signal
        })
        const parsed = parseAsk(raw, ranked, dropsNumericDetails)
        return parsed ? { kind: 'answer', ...parsed } : { kind: 'none' }
      } catch (e) {
        if (ctl.signal.aborted) throw new Error('Cancelled')
        return quotes('I could not finish thinking about that, so here is the closest text on the page:')
      } finally {
        inflight.delete(p.requestId)
      }
    }
  )

  /** Answer a question using several open tabs, with per-tab citations. */
  ipcMain.handle(
    'ai:ask-tabs',
    async (_evt, p: { requestId: string; question: string; tabs: TabText[] }): Promise<{ answer: string; sources: Array<{ n: number; tabId: string; title: string; url: string }> }> => {
      const question = String(p.question ?? '').replace(/^\/tabs\s*/i, '').trim() || 'Summarize and compare these tabs.'
      const tabs = (p.tabs ?? []).slice(0, 6).map((t) => ({ ...t, excerpts: pickExcerpts(question, String(t.text ?? '').slice(0, 20000)) })).filter((t) => t.excerpts.length)
      if (!tabs.length) return { answer: 'None of your open tabs have readable text yet.', sources: [] }
      if (!(await checkOllamaHealth()).ok) throw new Error('The local AI is not running. Start Ollama to ask about several tabs at once.')
      const ctl = new AbortController()
      inflight.set(p.requestId, ctl)
      try {
        const raw = await ollamaGenerate({
          system: buildTabsSystem(),
          prompt: buildTabsPrompt(question, tabs),
          format: TABS_SCHEMA,
          directJson: true,
          temperature: 0.1,
          numPredict: 300,
          numCtx: 4096,
          timeoutMs: 45000,
          priority: 'interactive',
          signal: ctl.signal
        })
        const parsed = parseTabsAnswer(raw, tabs.length)
        if (!parsed) return { answer: 'I could not put that together. Try asking about one tab at a time.', sources: [] }
        return {
          answer: parsed.answer,
          sources: parsed.sources.map((n) => ({ n, tabId: tabs[n - 1].id, title: tabs[n - 1].title, url: tabs[n - 1].url }))
        }
      } catch (e) {
        if (ctl.signal.aborted) throw new Error('Cancelled')
        throw formatChatError(e)
      } finally {
        inflight.delete(p.requestId)
      }
    }
  )

  /** Simplify just the sentences the user selected. Interactive priority: the user is waiting on it. */
  ipcMain.handle('ai:simplify-sentences', async (_evt, sentences: SentenceIn[]) => {
    const list = (Array.isArray(sentences) ? sentences : [])
      .filter((s) => s && typeof s.id === 'string' && typeof s.text === 'string')
      .slice(0, 60)
      .map((s) => ({ id: s.id, text: s.text.slice(0, 1200) }))
    if (!list.length) return []
    if (!(await checkOllamaHealth()).ok) throw new Error('The local AI is not running. Start Ollama to simplify text.')
    return simplifySentences(ollamaGenerate, list)
  })

  ipcMain.handle('ai:cancel', (_evt, requestId: string) => {
    inflight.get(requestId)?.abort()
  })

  ipcMain.handle('ai:health', async () => {
    return checkOllamaHealth()
  })

  // Selective review (measured: same output as no review on this set, but risky blocks are still fact-checked),
  // with a stronger installed model as reviewer when the machine can hold both. See docs/MODEL_BENCHMARK.md.
  // Without a trustworthy reviewer (the 4B model rejected 50% of faithful rewrites even with the lenient prompt),
  // the rule-based checks (numbers, dates, grammar, length) gate the rewrite and nothing claims to be model-reviewed.
  let simplifier = createSimplifier(ollamaGenerate, { review: 'never' })
  let simplifierKey = 'default'
  ipcMain.handle('ai:simplify-chunks', async (_evt, chunks: SimplifyChunk[]) => {
    // Eco mode skips the second, larger model: it keeps GPU/RAM use low at the cost of model fact-checking.
    const reviewer = isEco() ? { strict: false } : pickReviewer(await listInstalledModels(), os.totalmem() / 1024 ** 3)
    const key = JSON.stringify(reviewer)
    if (key !== simplifierKey) {
      simplifier = createSimplifier(ollamaGenerate, { review: reviewer.model ? 'selective' : 'never', reviewer })
      simplifierKey = key
    }
    return simplifier(chunks)
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
