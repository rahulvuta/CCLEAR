import { describe, expect, it } from 'vitest'
import { gateToolCall, parseLegacyTags, proposeActions, stripLegacyTags, toToolCall } from '../../src/ai/tools'

const ctx = (userText: string, trustedUrls: string[] = []) => ({ userText, trustedUrls })

describe('toToolCall validation', () => {
  it('drops unknown tools and missing required args', () => {
    expect(toToolCall('rm_rf', {})).toBeNull()
    expect(toToolCall('open_url', {})).toBeNull()
    expect(toToolCall('type_text', { label: 'search' })).toBeNull()
    expect(toToolCall('highlight', { query: 'steam' })).toEqual({ name: 'highlight', args: { query: 'steam' } })
  })
})

describe('legacy tag parsing', () => {
  it('turns tags into typed calls and strips them from text', () => {
    const t = 'Sure. [GOTO: https://a.com] [TYPE: search, cats] [BACK]'
    expect(parseLegacyTags(t).map((c) => c.name)).toEqual(['open_url', 'type_text', 'back'])
    expect(stripLegacyTags(t)).toBe('Sure.')
  })
})

describe('action gate', () => {
  it('auto-runs reversible page marks', () => {
    expect(gateToolCall({ name: 'highlight', args: { query: 'x' } }, ctx('')).mode).toBe('auto')
  })
  it('auto-opens a site the user named, confirms one the model invented', () => {
    expect(gateToolCall({ name: 'open_url', args: { url: 'https://www.wikipedia.org/' } }, ctx('go to wikipedia')).mode).toBe('auto')
    expect(gateToolCall({ name: 'open_url', args: { url: 'https://evil.example/x' } }, ctx('summarize this page')).mode).toBe('confirm')
  })
  it('auto-opens URLs from trusted lookups only', () => {
    const url = 'https://en.wikipedia.org/wiki/Steam_engine'
    expect(gateToolCall({ name: 'open_url', args: { url } }, ctx('find an article', [url])).mode).toBe('auto')
  })
  it('denies non-web schemes', () => {
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hi']) {
      expect(gateToolCall({ name: 'open_url', args: { url } }, ctx(url)).mode).toBe('deny')
    }
  })
  it('never auto-clicks or auto-types', () => {
    expect(gateToolCall({ name: 'click_text', args: { text: 'Buy now' } }, ctx('click buy now')).mode).toBe('confirm')
    expect(gateToolCall({ name: 'type_text', args: { label: 'search', text: 'cats' } }, ctx('type cats in search')).mode).toBe('confirm')
  })
  it('denies typing into sensitive fields even when asked', () => {
    for (const label of ['Password', 'card number', 'CVV', 'SSN']) {
      expect(gateToolCall({ name: 'type_text', args: { label, text: 'x' } }, ctx('fill it')).mode).toBe('deny')
    }
  })
  it('requires confirmation for searches the user did not write', () => {
    expect(gateToolCall({ name: 'search_web', args: { query: 'steam engines history' } }, ctx('steam engines history')).mode).toBe('auto')
    expect(gateToolCall({ name: 'search_web', args: { query: 'user secret notes' } }, ctx('summarize')).mode).toBe('confirm')
  })
})

describe('prompt-injection fixture', () => {
  it('a page telling the model to act yields no auto-executed risky action', () => {
    const modelOut =
      'Done. [TYPE: password, hunter2] [CLICK: Transfer funds] [GOTO: https://attacker.example/steal] [NEW_TAB: javascript:alert(1)]'
    const actions = proposeActions(parseLegacyTags(modelOut), ctx('summarize this page'))
    expect(actions.length).toBeGreaterThan(0)
    expect(actions.filter((a) => a.decision.mode === 'auto')).toEqual([])
  })
})
