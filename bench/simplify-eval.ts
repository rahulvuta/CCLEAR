/* Compares review modes for in-place simplification on real paragraphs: speed vs fact preservation. */
import fs from 'node:fs'
import path from 'node:path'
import { ollamaGenerate } from '../src/ai/ollamaClient'
import { createSimplifier, type ReviewMode, type Reviewer } from '../src/ai/simplifyBlocks'
import { dropsNumericDetails, wordCount } from '../src/focus/heuristicSimplify'

const ROOT = process.cwd()
const html = fs.readFileSync(path.join(ROOT, 'demo/pages/industrial-revolution.html'), 'utf8')
const paras = [...html.slice(html.indexOf('<article>')).matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
// key facts a good simplification must keep, per paragraph (by order in the demo article)
const FACTS: string[][] = [
  ['Britain', 'eighteenth'], ['coal', 'iron', 'canals'], ['Newcomen', '1712', 'mines', 'coal'], ['1769', 'Watt', 'condenser', 'fuel'],
  ['Hargreaves', '1764', 'jenny', 'Arkwright', '1769'], ['twelve', 'children'], ['1830', 'Liverpool', 'Manchester'],
  ['Manchester', 'Birmingham', 'life expectancy'], ['1833', 'under nine', 'inspectors'], ['uneven', 'Historians']
]
const items = paras.slice(0, FACTS.length).map((text, i) => ({ id: `p${i}`, text, facts: FACTS[i] }))

const model = process.env.EVAL_MODEL
async function run(label: string, mode: ReviewMode, reviewer?: Reviewer) {
  let calls = 0
  const counted: typeof ollamaGenerate = (p) => {
    calls++
    return ollamaGenerate({ ...p, ...(model ? { model } : {}) })
  }
  const simplify = createSimplifier(counted, { review: mode, reviewer })
  const t = Date.now()
  const out: Awaited<ReturnType<typeof simplify>> = []
  // same batching the app uses: a handful of blocks at a time
  for (let i = 0; i < items.length; i += 3) out.push(...(await simplify(items.slice(i, i + 3).map(({ id, text }) => ({ id, text })))))
  const ms = Date.now() - t
  let simplified = 0, kept = 0, total = 0, numBad = 0, ratio = 0
  out.forEach((r, i) => {
    if (r.status !== 'simplified') return
    simplified++
    const { text, facts } = items[i]
    for (const f of facts) {
      total++
      if (r.summary.toLowerCase().includes(f.toLowerCase())) kept++
    }
    if (dropsNumericDetails(text, r.summary) || dropsNumericDetails(r.summary, text)) numBad++
    ratio += wordCount(r.summary) / wordCount(text)
  })
  return {
    config: label, seconds: Math.round(ms / 100) / 10, llmCalls: calls, simplified: `${simplified}/${items.length}`,
    keyFactRecall: total ? Math.round((kept / total) * 100) : 0, numberViolations: numBad,
    avgCompression: simplified ? Math.round((ratio / simplified) * 100) : 0
  }
}

const results = []
const CONFIGS: Array<[string, ReviewMode, Reviewer | undefined]> = [
  ['4b writes, 4b reviews (lenient)', 'always', { strict: false }],
  ['4b writes, 8b reviews (strict)', 'always', { model: 'qwen3:8b', strict: true }],
  ['4b writes, 8b reviews risky blocks only', 'selective', { model: 'qwen3:8b', strict: true }],
  ['4b writes, no review', 'never', undefined]
]
for (const [label, mode, reviewer] of CONFIGS) {
  console.error('config', label)
  results.push(await run(label, mode, reviewer))
}
console.log(JSON.stringify({ model: model ?? 'default', results }, null, 2))
fs.writeFileSync(path.join(ROOT, 'docs/simplify-review-eval.json'), JSON.stringify({ date: new Date().toISOString(), model: model ?? 'default', results }, null, 2))
