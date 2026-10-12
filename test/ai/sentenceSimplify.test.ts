import { describe, expect, it, vi } from 'vitest'
import { acceptSentenceRewrite, shouldSimplifySentence, simplifySentences } from '../../src/ai/sentenceSimplify'

const long = 'Because the cylinder no longer had to be reheated after every stroke, the engine used far less fuel in 1769.'

describe('acceptSentenceRewrite', () => {
  it('accepts a shorter, faithful rewrite', () => {
    expect(acceptSentenceRewrite(long, 'The cylinder stayed hot, so the engine used far less fuel in 1769.')).toBe(true)
  })
  it('rejects changed numbers, longer text, stubs, and identical text', () => {
    expect(acceptSentenceRewrite(long, 'The engine used far less fuel in 1796.')).toBe(false)
    expect(acceptSentenceRewrite(long, long + ' This was a very important and widely celebrated development for everybody involved.')).toBe(false)
    expect(acceptSentenceRewrite(long, 'It used less.')).toBe(false)
    expect(acceptSentenceRewrite(long, long)).toBe(false)
  })
  it('rejects a rewrite that drops a number', () => {
    expect(acceptSentenceRewrite(long, 'The engine used far less fuel because the cylinder stayed hot.')).toBe(false)
  })
})

describe('shouldSimplifySentence', () => {
  it('leaves short sentences alone', () => {
    expect(shouldSimplifySentence('Steam engines turn heat into motion.')).toBe(false)
    expect(shouldSimplifySentence(long)).toBe(true)
  })
})

describe('simplifySentences', () => {
  const resp = (rows: Array<{ id: string; text: string }>) => JSON.stringify({ sentences: rows })
  it('rewrites valid sentences and keeps short ones untouched', async () => {
    const gen = vi.fn(async () => resp([{ id: 'a', text: 'The cylinder stayed hot, so the engine used far less fuel in 1769.' }]))
    const out = await simplifySentences(gen, [{ id: 'a', text: long }, { id: 'b', text: 'It worked.' }])
    expect(out[0]).toMatchObject({ id: 'a', changed: true })
    expect(out[1]).toEqual({ id: 'b', text: 'It worked.', changed: false })
    expect(gen).toHaveBeenCalledTimes(1)
  })
  it('retries a rejected rewrite once, then leaves the original', async () => {
    const gen = vi.fn(async () => resp([{ id: 'a', text: 'The engine used far less fuel in 1796.' }]))
    const out = await simplifySentences(gen, [{ id: 'a', text: long }])
    expect(out[0]).toEqual({ id: 'a', text: long, changed: false })
    expect(gen).toHaveBeenCalledTimes(2)
  })
  it('survives garbage model output and ignores unknown ids', async () => {
    const out = await simplifySentences(async () => 'not json', [{ id: 'a', text: long }])
    expect(out[0].changed).toBe(false)
    const out2 = await simplifySentences(async () => resp([{ id: 'zzz', text: 'x' }]), [{ id: 'a', text: long }])
    expect(out2[0].changed).toBe(false)
  })
})
