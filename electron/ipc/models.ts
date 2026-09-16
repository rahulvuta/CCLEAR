import { ipcMain } from 'electron'
import os from 'node:os'
import { DEFAULT_OLLAMA_HOST, DEFAULT_VISION_MODEL, getActiveModel, setActiveModel } from '../../src/ai/ollamaClient'
import { hasModel, recommendModel } from '../../src/ai/modelAdvice'
import { pickReviewer } from '../../src/ai/simplifyBlocks'
import { getPrefs, setPrefs } from './prefs'

export type ModelStatus = {
  ollama: boolean
  error?: string
  installed: Array<{ name: string; sizeGB: number }>
  active: string
  activeInstalled: boolean
  vision: string
  visionInstalled: boolean
  ramGB: number
  recommended: { name: string; reason: string; tested: boolean }
  /** Who fact-checks Focus-mode rewrites: a stronger installed model, or the rule-based checks only. */
  simplifyChecks: string
}

async function status(): Promise<ModelStatus> {
  const ramGB = Math.round(os.totalmem() / 1024 ** 3)
  const base = {
    active: getActiveModel(),
    vision: DEFAULT_VISION_MODEL,
    ramGB,
    recommended: recommendModel(ramGB)
  }
  try {
    const r = await fetch(`${DEFAULT_OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2500) })
    if (!r.ok) throw new Error(`Ollama returned ${r.status}`)
    const data = (await r.json()) as { models?: Array<{ name: string; size?: number }> }
    const installed = (data.models ?? []).map((m) => ({ name: m.name, sizeGB: Math.round(((m.size ?? 0) / 1024 ** 3) * 10) / 10 }))
    const names = installed.map((m) => m.name)
    return {
      ...base,
      ollama: true,
      simplifyChecks: pickReviewer(names, ramGB).model ?? 'rules',
      installed,
      activeInstalled: hasModel(names, base.active),
      visionInstalled: hasModel(names, base.vision)
    }
  } catch (e) {
    return {
      ...base,
      ollama: false,
      simplifyChecks: 'rules',
      error: e instanceof Error ? e.message : 'Cannot reach Ollama',
      installed: [],
      activeInstalled: false,
      visionInstalled: false
    }
  }
}

const pulls = new Map<string, AbortController>()

export function registerModelsIpc() {
  const saved = getPrefs().aiModel
  if (saved) setActiveModel(saved)

  ipcMain.handle('models:status', () => status())

  ipcMain.handle('models:select', (_e, name: string) => {
    if (typeof name !== 'string' || !/^[\w.\-:/]{1,80}$/.test(name)) return false
    setActiveModel(name)
    setPrefs({ aiModel: name })
    return true
  })

  /** Download a model through the local Ollama daemon, streaming progress back to the window. */
  ipcMain.handle('models:pull', async (evt, name: string) => {
    if (typeof name !== 'string' || !/^[\w.\-:/]{1,80}$/.test(name)) return { ok: false, error: 'Invalid model name' }
    pulls.get(name)?.abort()
    const ctl = new AbortController()
    pulls.set(name, ctl)
    try {
      const r = await fetch(`${DEFAULT_OLLAMA_HOST}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name, stream: true }),
        signal: ctl.signal
      })
      if (!r.ok || !r.body) return { ok: false, error: `Ollama returned ${r.status}` }
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const o = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string }
            if (o.error) return { ok: false, error: o.error }
            if (!evt.sender.isDestroyed()) evt.sender.send('models:pull-progress', { name, status: o.status ?? '', completed: o.completed ?? 0, total: o.total ?? 0 })
          } catch {
            /* ignore partial line */
          }
        }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: ctl.signal.aborted ? 'Cancelled' : e instanceof Error ? e.message : 'Download failed' }
    } finally {
      pulls.delete(name)
    }
  })

  ipcMain.handle('models:cancel-pull', (_e, name: string) => {
    pulls.get(name)?.abort()
  })
}
