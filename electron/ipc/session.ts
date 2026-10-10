import { ipcMain } from 'electron'
import Store from 'electron-store'
import type { SessionState } from '../../src/shared/session'
import { checkOllamaHealth, ollamaGenerate } from '../../src/ai/ollamaClient'
import { buildJudgePrompt, JUDGE_SCHEMA, JUDGE_SYSTEM } from '../../src/session/judge'

const store = new Store<{ state: SessionState | null }>({ name: 'cclear-session', defaults: { state: null } })

const STEPS_SCHEMA = {
  type: 'object',
  properties: { steps: { type: 'array', items: { type: 'string' } } },
  required: ['steps'],
  additionalProperties: false
}
/** In-memory copy so hot paths (the request blocker) never touch disk. */
let cached: SessionState | null = store.get('state')
export function getBlockerAllow(): string[] {
  return cached?.blockerAllow ?? []
}

const judgeCache = new Map<string, { relevant: boolean; why: string }>()

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as T
  } catch {
    return null
  }
}

export function registerSessionIpc() {
  ipcMain.handle('session:load', () => store.get('state'))

  ipcMain.handle('session:save', (_e, state: SessionState) => {
    // Cheap sanity bound so a renderer bug can't fill the disk.
    if (!state || typeof state !== 'object' || JSON.stringify(state).length > 2_000_000) return false
    store.set('state', state)
    cached = state
    return true
  })

  ipcMain.handle('session:suggest-steps', async (_e, goal: string): Promise<string[]> => {
    const g = String(goal ?? '').trim().slice(0, 200)
    if (!g || !(await checkOllamaHealth()).ok) return []
    try {
      const raw = await ollamaGenerate({
        system:
          'Break the user\'s goal into 3 to 6 concrete, ordered steps a student can do one at a time. Each step is a short imperative phrase (max 10 words). Do not repeat the goal. Return JSON {"steps": [...]}.',
        prompt: `Goal: ${g}`,
        format: STEPS_SCHEMA,
        directJson: true,
        temperature: 0.3,
        numPredict: 220,
        timeoutMs: 20000,
        priority: 'interactive'
      })
      const parsed = parseJson<{ steps?: unknown }>(raw)
      return Array.isArray(parsed?.steps) ? parsed.steps.filter((s): s is string => typeof s === 'string').slice(0, 6) : []
    } catch {
      return []
    }
  })

  /** Ask the local model whether a page fits the goal. Only called for pages the cheap scorer is unsure about. */
  ipcMain.handle(
    'session:judge',
    async (_e, p: { goal: string; steps?: string[]; title: string; url: string; text?: string }) => {
      const key = `${p.goal}|${p.url}|${p.title}`
      const hit = judgeCache.get(key)
      if (hit) return hit
      if (!(await checkOllamaHealth()).ok) return null
      try {
        const raw = await ollamaGenerate({
          system: JUDGE_SYSTEM,
          prompt: buildJudgePrompt(p),
          format: JUDGE_SCHEMA,
          directJson: true,
          temperature: 0.1,
          numPredict: 60,
          timeoutMs: 8000
        })
        const parsed = parseJson<{ relevant?: unknown; why?: unknown }>(raw)
        if (typeof parsed?.relevant !== 'boolean') return null
        const out = { relevant: parsed.relevant, why: typeof parsed.why === 'string' ? parsed.why.slice(0, 120) : '' }
        judgeCache.set(key, out)
        if (judgeCache.size > 300) judgeCache.delete(judgeCache.keys().next().value as string)
        return out
      } catch {
        return null
      }
    }
  )
}
