import { DEFAULT_OLLAMA_HOST } from './ollamaClient'

export const EMBED_MODEL = process.env.CCLEAR_OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'

let unavailableUntil = 0
const cache = new Map<string, number[][]>()

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

async function embedRaw(inputs: string[], signal?: AbortSignal): Promise<number[][] | null> {
  const r = await fetch(`${DEFAULT_OLLAMA_HOST}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs, keep_alive: '30m' }),
    signal: signal ?? AbortSignal.timeout(15000)
  })
  if (!r.ok) return null
  const data = (await r.json()) as { embeddings?: number[][] }
  return Array.isArray(data.embeddings) && data.embeddings.length === inputs.length ? data.embeddings : null
}

/**
 * Cosine similarity of the question against every passage, using the local embedding model.
 * Returns null when the model is not installed or Ollama is down, and callers fall back to keywords.
 */
export async function semanticScores(pageKey: string, question: string, passages: string[], signal?: AbortSignal): Promise<number[] | null> {
  if (Date.now() < unavailableUntil || !passages.length) return null
  try {
    let docs = cache.get(pageKey)
    if (!docs) {
      docs = []
      for (let i = 0; i < passages.length; i += 64) {
        const part = await embedRaw(passages.slice(i, i + 64).map((p) => `search_document: ${p}`), signal)
        if (!part) throw new Error('embedding unavailable')
        docs.push(...part)
      }
      cache.set(pageKey, docs)
      if (cache.size > 8) cache.delete(cache.keys().next().value as string)
    }
    const q = await embedRaw([`search_query: ${question}`], signal)
    if (!q) throw new Error('embedding unavailable')
    return docs.map((d) => cosine(q[0], d))
  } catch {
    unavailableUntil = Date.now() + 60_000
    return null
  }
}
