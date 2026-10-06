import { describe, expect, it, vi } from 'vitest'
import { createSimplifier, needsReview, numberCores, numberIssues, pickReviewer, rewriteIssues } from '../../src/ai/simplifyBlocks'
import { heuristicSummarizeParagraph, summaryWordRange } from '../../src/focus/heuristicSimplify'
import { automotiveEngine } from '../fixtures/automotiveEngine'

const source = 'The steam engine is a device that uses heat to produce mechanical motion. Its boiler produces steam by boiling water, and the steam provides power to move the engine.'
const good = 'Steam engines turn heat into mechanical motion. Boilers boil water to produce steam that powers the engine.'

function response(key: string, rows: unknown[]) { return JSON.stringify({ [key]: rows }) }

describe('Focus rewrite pipeline', () => {
  it('cuts long blocks much harder than short ones', () => {
    const long = automotiveEngine.find((c) => c.id === 'history')!.text
    const words = long.split(/\s+/).length
    const range = summaryWordRange(long)
    expect(words).toBeGreaterThan(100)
    expect(range.target / words).toBeLessThan(0.4) // a wall of text becomes about a third
    expect(range.min).toBeLessThan(range.target)
    expect(range.target).toBeLessThan(range.max)
    const mid = summaryWordRange(Array(45).fill('word').join(' '))
    const short = summaryWordRange(Array(20).fill('word').join(' '))
    expect(range.target / words).toBeLessThan(mid.target / 45)
    expect(mid.target / 45).toBeLessThan(short.target / 20)
    expect(summaryWordRange('A short line.')).toEqual({ min: 3, max: 3, target: 3 })
  })

  it('processes all blocks, sends text beyond 900 characters, and caches only validated results', async () => {
    const seen: string[] = []
    const generate = vi.fn(async (params: { system: string; prompt: string }) => {
      const { blocks } = JSON.parse(params.prompt)
      if (params.system.startsWith('Check')) return response('reviews', blocks.map((b: { id: string }) => ({ id: b.id, issues: [] })))
      seen.push(...blocks.map((b: { source: string }) => b.source))
      return response('blocks', blocks.map((b: { id: string }) => ({ id: b.id, summary: good })))
    })
    const simplify = createSimplifier(generate)
    const chunks = Array.from({ length: 7 }, (_, i) => ({ id: `${i}`, text: source }))
    const results = await simplify(chunks)
    expect(results.map((r) => r.id)).toEqual(chunks.map((c) => c.id))
    expect(results.every((r) => r.summary === good && r.status === 'simplified')).toBe(true)
    expect(seen).toHaveLength(7)
    const calls = generate.mock.calls.length
    expect((await simplify([{ id: 'new-id', text: source }]))[0].id).toBe('new-id')
    expect(generate).toHaveBeenCalledTimes(calls)

    const long = automotiveEngine.find((c) => c.id === 'history')!
    await simplify([long])
    expect(seen).toContain(long.text)
    expect(long.text.length).toBeGreaterThan(900)
  })

  it('repairs drafts outside the word range without clipping them', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce(response('blocks', [{ id: 'a', summary: source }]))
      .mockResolvedValueOnce(response('blocks', [{ id: 'a', summary: good }]))
      .mockResolvedValueOnce(response('reviews', [{ id: 'a', issues: [] }]))
    const [result] = await createSimplifier(generate)([{ id: 'a', text: source }])
    expect(result.summary).toBe(good)
    const repair = JSON.parse(generate.mock.calls[1][0].prompt).blocks[0].repair
    expect(repair.draft).toBe(source)
    expect(repair.issues[0]).toMatch(/words/)
  })

  it('repairs missing mechanisms, even when a draft meets the word budget', async () => {
    const bad = 'Steam engines are powerful machines that produce mechanical motion. These machines have many uses across the world.'
    expect(rewriteIssues(source, bad)).toEqual([])
    const generate = vi.fn()
      .mockResolvedValueOnce(response('blocks', [{ id: 'a', summary: bad }]))
      .mockResolvedValueOnce(response('reviews', [{ id: 'a', issues: ['Restore the boiler boiling water to create steam.'] }]))
      .mockResolvedValueOnce(response('blocks', [{ id: 'a', summary: good }]))
      .mockResolvedValueOnce(response('reviews', [{ id: 'a', issues: [] }]))
    const [result] = await createSimplifier(generate)([{ id: 'a', text: source }])
    expect(result.summary).toBe(good)
    expect(JSON.parse(generate.mock.calls[2][0].prompt).blocks[0].repair.issues).toEqual(['Restore the boiler boiling water to create steam.'])
  })

  it.each(['{"reviews":[]}', '{"reviews":[{"id":"a","issues":false}]}', '{"reviews":[{"id":"wrong","issues":[]}]}'])('fails closed for missing or malformed reviews: %s', async (review) => {
    const generate = vi.fn(async (p: { system: string }) => p.system.startsWith('Check')
      ? review : response('blocks', [{ id: 'a', summary: good }]))
    const [result] = await createSimplifier(generate)([{ id: 'a', text: source }])
    expect(result.summary).toBe(source)
    expect(result.status).toBe('preserved')
  })

  it('does not cache a timeout and retries the model on the next invocation', async () => {
    const generate = vi.fn().mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(response('blocks', [{ id: 'a', summary: good }]))
      .mockResolvedValueOnce(response('reviews', [{ id: 'a', issues: [] }]))
    const simplify = createSimplifier(generate)
    const chunks = [{ id: 'a', text: source }]
    expect((await simplify(chunks))[0].status).toBe('preserved')
    expect((await simplify(chunks))[0].status).toBe('simplified')
  })

  it.each(automotiveEngine)('preserves the definitions, options and history of $id when offline', ({ text, required }) => {
    const result = heuristicSummarizeParagraph(text)
    for (const pattern of required) expect(result.summary).toMatch(pattern)
  })

  it('never drops or invents numbers to meet a budget', () => {
    expect(rewriteIssues('In 2013, China had smaller research budgets than Europe and Japan.', 'China had smaller research budgets than Europe.')).toEqual(expect.arrayContaining([expect.stringContaining('Restore all source numbers')]))
    expect(rewriteIssues('The motor runs at a constant speed.', 'The motor runs at 45 mph.')).toEqual(expect.arrayContaining([expect.stringContaining('not present in the source')]))
  })

  describe('selective review mode (opt-in)', () => {
    it('skips the review call for a simple, low-risk block that passed the hard checks', async () => {
      const generate = vi.fn(async () => response('blocks', [{ id: 'a', summary: good }]))
      const [result] = await createSimplifier(generate, { review: 'selective' })([{ id: 'a', text: source }])
      expect(result.status).toBe('simplified')
      expect(generate).toHaveBeenCalledTimes(1)
    })
    it('still reviews dense or cause-and-effect blocks', () => {
      expect(needsReview('In 1769 Watt patented a condenser, and by 1800 over 450 engines were in use.', 'Watt patented a condenser.')).toBe(true)
      expect(needsReview('The valve closes because pressure rises, which allows the piston to move, so that the wheel turns.', 'The valve closes and the wheel turns.')).toBe(true)
      expect(needsReview(source, good)).toBe(false)
      expect(needsReview(source, good, true)).toBe(true)
    })
  })

  describe('pickReviewer', () => {
    it('uses a stronger installed model with the strict checklist only when memory allows', () => {
      expect(pickReviewer(['qwen3:4b', 'qwen3:8b'], 16)).toEqual({ model: 'qwen3:8b', strict: true })
      expect(pickReviewer(['qwen3:4b', 'qwen3:8b'], 8)).toEqual({ strict: false })
      expect(pickReviewer(['qwen3:4b'], 32)).toEqual({ strict: false })
    })
  })

  describe('number rules', () => {
    it('compares numbers by digits, not formatting', () => {
      expect(numberCores('In 1,769 and the 1800s, the 20th century saw 3.5% growth')).toEqual(['1769', '1800', '20', '3.5'])
    })
    it('never allows invented numbers', () => {
      expect(numberIssues('Watt patented it in 1769.', 'Watt patented it in 1796.')).toEqual(expect.arrayContaining([expect.stringContaining('not present')]))
    })
    it('short blocks must keep all numbers; long blocks must keep at least half', () => {
      const short = 'Watt patented the engine in 1769 and sold 450 of them by 1800.'
      expect(numberIssues(short, 'Watt patented the engine in 1769.')).toEqual(expect.arrayContaining([expect.stringContaining('Restore all')]))
      const long = Array(70).fill('word').join(' ') + ' In 1712 and 1769 and 1800 and 1830 it changed.'
      expect(numberIssues(long, 'It changed in 1712 and 1769.')).toEqual([])
      expect(numberIssues(long, 'It changed in 1712.')).toEqual(expect.arrayContaining([expect.stringContaining('Restore all')]))
    })
  })
})
