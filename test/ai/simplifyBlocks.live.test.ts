import { expect, it } from 'vitest'
import { createSimplifier, rewriteIssues } from '../../src/ai/simplifyBlocks'
import { wordCount } from '../../src/focus/heuristicSimplify'
import { automotiveEngine } from '../fixtures/automotiveEngine'
import { ollamaGenerate } from '../../src/ai/ollamaClient'

it.skipIf(process.env.CCLEAR_LIVE_SIMPLIFY !== '1')('rewrites the reported article with Ollama, retaining its essential facts at 50–75%', async () => {
  const selected = process.env.CCLEAR_LIVE_IDS?.split(',')
  const passages = selected ? automotiveEngine.filter((c) => selected.includes(c.id)) : automotiveEngine
  const results = await createSimplifier(async (params) => {
    console.log('REQUEST', params.system.startsWith('Check') ? 'review' : 'rewrite', params.prompt)
    const raw = await ollamaGenerate(params).catch((error) => { console.error(error); throw error })
    console.log(params.system.startsWith('Check') ? 'REVIEW' : 'DRAFT', raw)
    return raw
  })(passages)
  for (const result of results) {
    const original = automotiveEngine.find((c) => c.id === result.id)!
    console.log(JSON.stringify({ id: result.id, status: result.status,
      ratio: wordCount(result.summary) / wordCount(original.text), summary: result.summary }))
  }
  for (const result of results) {
    const original = automotiveEngine.find((c) => c.id === result.id)!
    expect(result.status, result.id).toBe('simplified')
    expect(rewriteIssues(original.text, result.summary), result.id).toEqual([])
    for (const pattern of original.required) expect(result.summary, result.id).toMatch(pattern)
  }
}, 900000)
