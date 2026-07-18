import { describe, expect, it, vi } from 'vitest'
import { selectPagePassages } from '../../src/ai/pagePassages'
import { detectPageActionIntent, pageActionSay, type PagePassageSnapshot } from '../../src/ai/pageActions'

const snapshot: PagePassageSnapshot = {
  title: 'Jet engine', url: 'https://example.test/jet-engine',
  passages: [
    { id: 'p0', text: 'A jet engine produces thrust by expelling a fast-moving jet.', context: 'Overview' },
    { id: 'p1', text: 'Frank Whittle patented his design in England in 1930.', context: 'History' },
    { id: 'p2', text: 'Hans von Ohain independently developed a turbojet in Germany.', context: 'History' },
    { id: 'p3', text: 'Modern engines power passenger aircraft around the world.', context: 'Applications' }
  ]
}

describe('semantic page passage selection', () => {
  it.each(['highlight', 'underline', 'bold', 'scroll to'])('uses semantic selection for %s requests', async (action) => {
    const intent = detectPageActionIntent(`${action} all the parts where it talks about where it was invented`)
    if (intent.kind === 'none' || intent.kind === 'clear') throw new Error('Expected a page action')
    const generate = vi.fn().mockResolvedValue('["p1","p2"]')
    const result = await selectPagePassages(intent.query, snapshot, generate)
    expect(result).toEqual({ ids: ['p1', 'p2'], usedFallback: false })
    const input = JSON.parse(generate.mock.calls[0][0].prompt)
    expect(input.passages).toEqual(snapshot.passages)
    expect(input.title).toBe('Jet engine')
  })

  it('finds invention passages with the model offline', async () => {
    const result = await selectPagePassages('where it was invented', snapshot, vi.fn().mockRejectedValue(new Error('offline')))
    expect(result).toEqual({ ids: ['p1', 'p2'], usedFallback: true })
  })

  it('reads the whole page in batches and keeps more than eight matches', async () => {
    const passages = Array.from({ length: 70 }, (_, i) => ({
      id: `p${i}`, text: `Passage ${i}: ${'Detailed article content. '.repeat(20)}`, context: 'History'
    }))
    const generate = vi.fn(async ({ prompt }: { prompt: string }) =>
      JSON.stringify(JSON.parse(prompt).passages.map((p: { id: string }) => p.id)))
    const result = await selectPagePassages('where it began', { ...snapshot, passages }, generate)
    expect(generate.mock.calls.length).toBeGreaterThan(1)
    expect(result.ids).toEqual(passages.map((p) => p.id))
    expect(result.usedFallback).toBe(false)
  })

  it('does not repeat a failed connection for the rest of a long page', async () => {
    const passages = Array.from({ length: 50 }, (_, i) => ({
      id: `p${i}`, text: `It was invented in England. ${'Details. '.repeat(80)}`, context: 'History'
    }))
    const generate = vi.fn().mockRejectedValue(new Error('offline'))
    const result = await selectPagePassages('invented', { ...snapshot, passages }, generate)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(result.ids).toHaveLength(50)
  })

  it.each(['not JSON', '["invented-id"]', '{"ids": [12]}'])('falls back on invalid output: %s', async (raw) => {
    expect(await selectPagePassages('invented', snapshot, vi.fn().mockResolvedValue(raw)))
      .toEqual({ ids: ['p1', 'p2'], usedFallback: true })
  })

  it('preserves explicit evidence when the model overlooks a passage', async () => {
    expect(await selectPagePassages('where it was invented', snapshot, vi.fn().mockResolvedValue('[]')))
      .toEqual({ ids: ['p1', 'p2'], usedFallback: false })
  })

  it('does not preserve shared topic words without the requested aspect', async () => {
    expect(await selectPagePassages('where the jet engine was invented', {
      ...snapshot, passages: [snapshot.passages[0]]
    }, vi.fn().mockResolvedValue('{"ids":[]}'))).toEqual({ ids: [], usedFallback: false })
  })

  it('does not confuse a month or design details with an invention location', async () => {
    const passages = [
      { id: 'p0', text: 'In March, the patent was submitted.', context: 'History' },
      { id: 'p1', text: 'The patent showed a two-stage compressor.', context: 'History' },
      { id: 'p2', text: 'In Spain, a pilot was granted a patent for a jet engine design.', context: 'History' }
    ]
    expect(await selectPagePassages('where it was invented', { ...snapshot, passages }, vi.fn().mockResolvedValue('{"ids":[]}')))
      .toEqual({ ids: ['p2'], usedFallback: false })
  })

  it('accepts fenced JSON and deduplicates IDs in page order', async () => {
    expect(await selectPagePassages('invented', snapshot, vi.fn().mockResolvedValue('```json\n["p2", "p1", "p2"]\n```')))
      .toEqual({ ids: ['p1', 'p2'], usedFallback: false })
  })

  it('accepts constrained JSON objects', async () => {
    expect(await selectPagePassages('invented', snapshot, vi.fn().mockResolvedValue('{"ids":["p1","p2"]}')))
      .toEqual({ ids: ['p1', 'p2'], usedFallback: false })
  })

  it('distinguishes failed semantic matching and stale pages from no matches', () => {
    const intent = detectPageActionIntent('highlight where it was invented')
    expect(pageActionSay(intent, { count: 0, usedFallback: true })).toContain('local AI')
    expect(pageActionSay(intent, { count: 0, stale: true })).toContain('page changed')
    expect(pageActionSay(intent, { count: 0 })).toBe('I could not find that on this page.')
  })
})
