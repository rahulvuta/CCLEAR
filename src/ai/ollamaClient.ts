export const DEFAULT_MODEL = process.env.ADHD_OLLAMA_MODEL ?? 'mistral:7b'
export const DEFAULT_OLLAMA_HOST = process.env.ADHD_OLLAMA_HOST ?? 'http://127.0.0.1:11434'

export async function checkOllamaHealth(host = DEFAULT_OLLAMA_HOST): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${host.replace(/\/$/, '')}/api/tags`, { method: 'GET' })
    if (!r.ok) return { ok: false, error: `Ollama returned ${r.status}` }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Cannot reach Ollama. Is it running?'
    }
  }
}

export async function ollamaChat(params: {
  host?: string
  model?: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
}): Promise<string> {
  const host = params.host ?? DEFAULT_OLLAMA_HOST
  const model = params.model ?? DEFAULT_MODEL
  const r = await fetch(`${host.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: params.messages,
      stream: false,
      options: {
        temperature: params.temperature ?? 0.25
      }
    })
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(t || `Ollama chat failed (${r.status})`)
  }
  const data = (await r.json()) as { message?: { content?: string }; error?: string }
  if (data.error) throw new Error(data.error)
  return data.message?.content?.trim() ?? ''
}

export async function ollamaGenerate(params: {
  host?: string
  model?: string
  system: string
  prompt: string
  temperature?: number
  numPredict?: number
  /** Abort slow generations (defaults 12s) */
  timeoutMs?: number
}): Promise<string> {
  const host = params.host ?? DEFAULT_OLLAMA_HOST
  const model = params.model ?? DEFAULT_MODEL
  const options: Record<string, unknown> = {
    temperature: params.temperature ?? 0.35
  }
  if (params.numPredict) {
    options.num_predict = params.numPredict
  }
  const timeoutMs = params.timeoutMs ?? 12000
  const ctl = new AbortController()
  const abortTimer = setTimeout(() => ctl.abort(), timeoutMs)

  try {
    const r = await fetch(`${host.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({
        model,
        system: params.system,
        prompt: params.prompt,
        stream: false,
        options
      })
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      throw new Error(t || `Ollama generate failed (${r.status})`)
    }
    const data = (await r.json()) as { response?: string; error?: string }
    if (data.error) throw new Error(data.error)
    return data.response?.trim() ?? ''
  } catch (e) {
    const aborted =
      (e instanceof Error && e.name === 'AbortError') ||
      (typeof e === 'object' && e !== null && 'name' in e && (e as { name: string }).name === 'AbortError')
    if (aborted) {
      throw new Error(`Ollama generate timed out after ${timeoutMs}ms`)
    }
    throw e
  } finally {
    clearTimeout(abortTimer)
  }
}
