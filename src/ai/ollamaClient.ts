export const DEFAULT_MODEL = process.env.CCLEAR_OLLAMA_MODEL ?? 'mistral:7b'
export const DEFAULT_VISION_MODEL = process.env.CCLEAR_OLLAMA_VISION_MODEL ?? 'llava:latest'
export const DEFAULT_OLLAMA_HOST = process.env.CCLEAR_OLLAMA_HOST ?? 'http://127.0.0.1:11434'

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

export async function checkVisionModelHealth(
  host = DEFAULT_OLLAMA_HOST,
  model = DEFAULT_VISION_MODEL
): Promise<{ ok: boolean; error?: string }> {
  const health = await checkOllamaHealth(host)
  if (!health.ok) return health

  try {
    const r = await fetch(`${host.replace(/\/$/, '')}/api/tags`, { method: 'GET' })
    if (!r.ok) return { ok: false, error: `Ollama returned ${r.status}` }
    const data = (await r.json()) as { models?: Array<{ name?: string }> }
    const names = (data.models ?? []).map((m) => m.name ?? '')
    const found = names.some((n) => n === model || n.startsWith(`${model}:`))
    if (!found) {
      return { ok: false, error: `Vision model "${model}" not found. Run: ollama pull ${model}` }
    }
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Cannot reach Ollama vision model'
    }
  }
}

function stripDataUriPrefix(base64: string): string {
  const m = base64.match(/^data:image\/[a-z+]+;base64,(.+)$/i)
  return m ? m[1] : base64
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

export async function ollamaVisionChat(params: {
  host?: string
  model?: string
  system?: string
  userText: string
  imageBase64: string
  temperature?: number
  timeoutMs?: number
}): Promise<string> {
  const host = params.host ?? DEFAULT_OLLAMA_HOST
  const model = params.model ?? DEFAULT_VISION_MODEL
  const imageBase64 = stripDataUriPrefix(params.imageBase64.trim())
  const timeoutMs = params.timeoutMs ?? 90000
  const ctl = new AbortController()
  const abortTimer = setTimeout(() => ctl.abort(), timeoutMs)

  const messages: Array<{
    role: 'system' | 'user'
    content: string
    images?: string[]
  }> = []

  if (params.system) {
    messages.push({ role: 'system', content: params.system })
  }
  messages.push({
    role: 'user',
    content: params.userText,
    images: [imageBase64]
  })

  try {
    const r = await fetch(`${host.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: params.temperature ?? 0.2
        }
      })
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      throw new Error(t || `Ollama vision chat failed (${r.status})`)
    }
    const data = (await r.json()) as { message?: { content?: string }; error?: string }
    if (data.error) throw new Error(data.error)
    return data.message?.content?.trim() ?? ''
  } catch (e) {
    const aborted =
      (e instanceof Error && e.name === 'AbortError') ||
      (typeof e === 'object' && e !== null && 'name' in e && (e as { name: string }).name === 'AbortError')
    if (aborted) {
      throw new Error(`Ollama vision chat timed out after ${timeoutMs}ms`)
    }
    throw e
  } finally {
    clearTimeout(abortTimer)
  }
}

export async function ollamaGenerate(params: {
  host?: string
  model?: string
  system: string
  prompt: string
  temperature?: number
  numPredict?: number
  /** Abort slow generations (defaults 30s; chat uses explicit longer timeout) */
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
  const timeoutMs = params.timeoutMs ?? 30000
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
