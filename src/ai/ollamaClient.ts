export const DEFAULT_MODEL = process.env.CCLEAR_OLLAMA_MODEL ?? 'qwen3:4b'
export const DEFAULT_VISION_MODEL = process.env.CCLEAR_OLLAMA_VISION_MODEL ?? 'llava:latest'
export const DEFAULT_OLLAMA_HOST = process.env.CCLEAR_OLLAMA_HOST ?? 'http://127.0.0.1:11434'

/** Qwen3 otherwise dumps a think trace that blows Focus timeouts and JSON parse. */
function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

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
      think: false,
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
  return stripThink(data.message?.content?.trim() ?? '')
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
  numCtx?: number
  format?: Record<string, unknown>
  /** Close Qwen3's thinking prefix for structured, non-thinking requests. */
  directJson?: boolean
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
  if (params.numCtx) options.num_ctx = params.numCtx
  const timeoutMs = params.timeoutMs ?? 30000
  const ctl = new AbortController()
  const abortTimer = setTimeout(() => ctl.abort(), timeoutMs)

  // Some installed Qwen3 templates always end in <think>, even with think:false.
  // Use its ChatML format with a closed thinking section for Focus JSON calls.
  const directQwen = params.directJson && params.format && /^qwen3(?::|$)/i.test(model)
  const escapeControl = (text: string) => text.replace(/<\|/g, '<\u200b|')
  const prompt = directQwen
    ? `<|im_start|>system\n${escapeControl(params.system)}<|im_end|>\n<|im_start|>user\n${escapeControl(params.prompt)}<|im_end|>\n<|im_start|>assistant\n<think>\n</think>\n\n`
    : params.prompt

  try {
    const r = await fetch(`${host.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({
        model,
        system: directQwen ? undefined : params.system,
        prompt,
        raw: directQwen ? true : undefined,
        stream: false,
        think: false,
        format: params.format,
        options
      })
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      throw new Error(t || `Ollama generate failed (${r.status})`)
    }
    const data = (await r.json()) as { response?: string; error?: string }
    if (data.error) throw new Error(data.error)
    return stripThink(data.response?.trim() ?? '')
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

export type ChatGenProgress = { think: string; content: string }

/** Stream Qwen3 so thinking stays out of the visible answer. */
export async function ollamaGenerateStream(params: {
  host?: string
  model?: string
  system: string
  prompt: string
  temperature?: number
  numPredict?: number
  timeoutMs?: number
  think?: boolean
  onProgress?: (p: ChatGenProgress) => void
}): Promise<ChatGenProgress> {
  const host = params.host ?? DEFAULT_OLLAMA_HOST
  const model = params.model ?? DEFAULT_MODEL
  const options: Record<string, unknown> = {
    temperature: params.temperature ?? 0.2
  }
  if (params.numPredict) options.num_predict = params.numPredict
  const timeoutMs = params.timeoutMs ?? 45000
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
        stream: true,
        think: params.think ?? true,
        options
      })
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      throw new Error(t || `Ollama generate failed (${r.status})`)
    }
    if (!r.body) throw new Error('Ollama returned no body')
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let think = ''
    let content = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const raw = line.trim()
        if (!raw) continue
        let obj: { response?: string; thinking?: string; done?: boolean; error?: string }
        try {
          obj = JSON.parse(raw) as { response?: string; thinking?: string; done?: boolean; error?: string }
        } catch {
          continue
        }
        if (obj.error) throw new Error(obj.error)
        if (obj.thinking) think += obj.thinking
        if (obj.response) content += obj.response
        params.onProgress?.({ think, content })
      }
    }
    if (buf.trim()) {
      try {
        const obj = JSON.parse(buf.trim()) as { response?: string; thinking?: string; error?: string }
        if (obj.error) throw new Error(obj.error)
        if (obj.thinking) think += obj.thinking
        if (obj.response) content += obj.response
      } catch (e) {
        if (e instanceof Error && e.message && !e.message.startsWith('Unexpected')) throw e
      }
    }
    content = stripThink(content.trim())
    think = think.trim()
    return { think, content }
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
