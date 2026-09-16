import { describe, expect, it } from 'vitest'
import { hasModel, recommendModel } from '../../src/ai/modelAdvice'

describe('model advice', () => {
  it('recommends the measured default on 16 GB and flags the 8 GB option as untested', () => {
    expect(recommendModel(16)).toMatchObject({ name: 'qwen3:4b', tested: true })
    expect(recommendModel(8)).toMatchObject({ name: 'qwen3:1.7b', tested: false })
  })
  it('matches installed model names', () => {
    expect(hasModel(['qwen3:4b', 'llava:latest'], 'qwen3:4b')).toBe(true)
    expect(hasModel(['llava:latest'], 'llava')).toBe(true)
    expect(hasModel(['qwen3:4b'], 'qwen3:1.7b')).toBe(false)
  })
})
