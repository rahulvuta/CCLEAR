import { describe, expect, it } from 'vitest'
import { viewportFirst } from '../../src/focus/order'

const b = (id: string, y?: number) => ({ id, y })

describe('viewportFirst', () => {
  it('puts on-screen blocks first, then below (nearest first), then above (nearest first)', () => {
    const blocks = [b('far-below', 5000), b('above-near', 300), b('visible-2', 900), b('above-far', 50), b('visible-1', 700), b('below-near', 1800)]
    const out = viewportFirst(blocks, 600, 700).map((x) => x.id)
    expect(out).toEqual(['visible-1', 'visible-2', 'below-near', 'far-below', 'above-near', 'above-far'])
  })
  it('keeps blocks without a position, after the positioned ones', () => {
    expect(viewportFirst([b('x'), b('v', 100)], 0, 800).map((x) => x.id)).toEqual(['v', 'x'])
  })
})
