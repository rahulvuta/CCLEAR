import { ipcMain } from 'electron'
import type { ChatMessage, SimplifyChunk, TabContextItem } from '../../src/shared/types'
import { DEFAULT_MODEL, checkOllamaHealth, ollamaGenerate, ollamaGenerateStream } from '../../src/ai/ollamaClient'
import { compactChatContext, detectChatNavIntent, resolveChatNav } from '../../src/ai/chatAssist'
import { simplifyBlocks } from '../../src/ai/simplifyBlocks'
import { selectPagePassages } from '../../src/ai/pagePassages'
import type { PagePassageSnapshot } from '../../src/ai/pageActions'

function buildNavigationContextSnippet(tabs: TabContextItem[], activeTabId?: string): string {
  const lines = tabs.map((t) => {
    const mark = t.isActive || t.id === activeTabId ? '(active)' : ''
    return `- ${mark} Title: "${t.title}" URL: ${t.url}`
  })
  return lines.join('\n')
}

export function registerAiIpc() {
  ipcMain.handle('ai:select-page-passages', async (_evt, payload: { query: string; snapshot: PagePassageSnapshot }) => {
    return selectPagePassages(payload.query, payload.snapshot, undefined, (completed, total) => {
      if (!_evt.sender.isDestroyed()) {
        _evt.sender.send('ai:chat-progress', {
          think: '', content: `Finding matching passages… ${total ? Math.round(completed / total * 100) : 100}%`
        })
      }
    })
  })

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
      const lastUser = (payload.messages ?? []).filter((m) => m.role === 'user').slice(-1)[0]?.content ?? ''

      const navIntent = detectChatNavIntent(lastUser)
      const nav = await resolveChatNav(navIntent)
      if (nav) {
        return `${nav.say}\n${nav.actions}`
      }

      if (!health.ok) {
        throw new Error(
          `${health.error}\nTip: Install Ollama, run it, then: ollama pull ${DEFAULT_MODEL}`
        )
      }
      const context = buildNavigationContextSnippet(payload.tabs ?? [], payload.activeTabId)
      const { memory, recent } = compactChatContext(payload.messages ?? [])
      const page = (payload.screenText ?? '').trim().slice(0, 1600)
      const sysContent = [
        'You are CCLEAR, a local browser assistant.',
        'Write only the answer the user should read.',
        'Answer from PAGE TEXT when the question is about the current page. If PAGE TEXT is empty, say the tab has no readable page.',
        'Use MEMORY plus Recent turns for follow-ups like "what did I just ask".',
        'If they ask for N sentences, write exactly N sentences about the PAGE TEXT.',
        'If they ask to highlight, underline, bold, or scroll to a part of the current page, add one tag:',
        '[HIGHLIGHT: query] [UNDERLINE: query] [BOLD: query] [SCROLL: query] [CLEAR_MARKS]',
        'Only if they ask to open/search a page, add one tag: [GOTO: https://full-url] or [SEARCH: query].',
        '',
        memory ? `MEMORY:\n${memory}` : 'MEMORY: (none)',
        `TABS:\n${context || '(none)'}`,
        page ? `PAGE TEXT:\n${page}` : 'PAGE TEXT: (empty)'
      ].join('\n')
      try {
        const sendProgress = (p: { think: string; content: string }) => {
          try {
            _evt.sender.send('ai:chat-progress', p)
          } catch {
            //
          }
        }
        const streamed = await ollamaGenerateStream({
          system: sysContent,
          prompt: `${recent}\nassistant:`,
          temperature: 0.2,
          numPredict: 1600,
          timeoutMs: 90000,
          think: true,
          onProgress: sendProgress
        })
        let out = streamed.content || ''
        if (!out.trim()) {
          // Thinking used the token budget; get a short answer without a think trace.
          const fallback = await ollamaGenerate({
            system:
              'Answer using PAGE TEXT. Write only the answer the user should read. No preamble. No "okay let\'s see".',
            prompt: `PAGE:\n${page || '(empty)'}\n\nUSER: ${lastUser}\n\nAnswer:`,
            temperature: 0.2,
            numPredict: 280,
            timeoutMs: 20000
          })
          out = (fallback || '').trim()
          sendProgress({ think: streamed.think, content: out })
        }
        return out || 'I could not get an answer from the local model.'
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : 'AI request failed')
      }
    }
  )

  ipcMain.handle('ai:health', async () => {
    return checkOllamaHealth()
  })

  ipcMain.handle('ai:simplify-chunks', async (_evt, chunks: SimplifyChunk[]) => simplifyBlocks(chunks))

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
