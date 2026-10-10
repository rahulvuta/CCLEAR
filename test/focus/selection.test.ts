import { describe, expect, it } from 'vitest'
import { getApplySelectionScript, getCaptureSelectionScript, getRestoreSelectionScript, getSelectionProbeScript, SELECTION_CSS } from '../../src/focus/selection'

// These run inside web pages, so a syntax error would only appear at runtime. Compile them here.
const compiles = (src: string) => () => new Function(`return ${src}`)

describe('selection simplification scripts', () => {
  it('all compile as JavaScript', () => {
    expect(compiles(getSelectionProbeScript())).not.toThrow()
    expect(compiles(getCaptureSelectionScript())).not.toThrow()
    expect(compiles(getRestoreSelectionScript())).not.toThrow()
    expect(compiles(getApplySelectionScript([{ id: 'a', text: 'He said "hi" and left.' }, { id: 'b', text: "It's </script> fine." }]))).not.toThrow()
  })
  it('embeds simplified text as data, never as markup', () => {
    const script = getApplySelectionScript([{ id: 'a', text: '</script><img src=x onerror=alert(1)>' }])
    // the text is only ever assigned through textContent and travels as a JSON string
    expect(script).toContain('span.textContent')
    expect(script).not.toContain('innerHTML')
  })
  it('hides the leftover pieces of multi-node sentences and tints the changed ones', () => {
    expect(SELECTION_CSS).toContain('cclear-sel-empty')
    expect(SELECTION_CSS).toContain('display: none')
  })
  it('restore handles both sentence-level and Focus-mode blocks', () => {
    const s = getRestoreSelectionScript()
    expect(s).toContain('data-cclear-orig')
    expect(s).toContain('data-cclear-original-html')
    expect(s).toContain('data-cclear-user-restored')
  })
})
