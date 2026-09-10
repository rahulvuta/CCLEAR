import { parseWebUrl } from '../shared/urlPolicy'

export type ToolName =
  | 'highlight' | 'underline' | 'bold' | 'scroll_to' | 'clear_marks'
  | 'open_url' | 'open_tab' | 'search_web' | 'play_youtube'
  | 'click_text' | 'type_text'
  | 'back' | 'forward' | 'reload'
  | 'park_tab'

export type ToolCall = { name: ToolName; args: Record<string, string> }

export type GateMode = 'auto' | 'confirm' | 'deny'
export type GateDecision = { mode: GateMode; reason: string }

/** Everything the gate may use. None of it comes from the model. */
export type GateContext = {
  /** The user's own latest message. */
  userText: string
  /** URLs produced by deterministic code (Wikipedia resolver, web lookup results). */
  trustedUrls: string[]
}

export type ProposedAction = { id: string; call: ToolCall; decision: GateDecision; label: string }

const TOOL_NAMES = new Set<string>([
  'highlight', 'underline', 'bold', 'scroll_to', 'clear_marks', 'open_url', 'open_tab', 'search_web',
  'play_youtube', 'click_text', 'type_text', 'back', 'forward', 'reload', 'park_tab'
])

const SENSITIVE_FIELD = /pass(word|code)?|card|cvv|cvc|ssn|social|security|\bpin\b|routing|account\s*number|iban|secret|token/i

/** Validate model output into a ToolCall; unknown tools or missing args are dropped, never guessed. */
export function toToolCall(name: unknown, rawArgs: unknown): ToolCall | null {
  if (typeof name !== 'string' || !TOOL_NAMES.has(name)) return null
  const args: Record<string, string> = {}
  if (rawArgs && typeof rawArgs === 'object') {
    for (const [k, v] of Object.entries(rawArgs as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number') args[k] = String(v).slice(0, 500)
    }
  }
  const need: Partial<Record<ToolName, string[]>> = {
    highlight: ['query'], underline: ['query'], bold: ['query'], scroll_to: ['query'],
    open_url: ['url'], open_tab: ['url'], search_web: ['query'], play_youtube: ['query'],
    click_text: ['text'], type_text: ['label', 'text']
  }
  for (const k of need[name as ToolName] ?? []) if (!args[k]?.trim()) return null
  return { name: name as ToolName, args }
}

const LEGACY_RE =
  /\[(GOTO|NEW_TAB|SEARCH|PLAY_YOUTUBE|CLICK|TYPE|HIGHLIGHT|UNDERLINE|BOLD|SCROLL):?\s*([\s\S]*?)\]|\[(BACK|FORWARD|RELOAD|CLEAR_MARKS)\]/gi

/** Older model/pipeline output uses [TAG: arg]. Parse it into the same typed calls so it hits the same gate. */
export function parseLegacyTags(text: string): ToolCall[] {
  const calls: ToolCall[] = []
  for (const m of text.matchAll(LEGACY_RE)) {
    const tag = (m[1] ?? m[3]).toUpperCase()
    const arg = (m[2] ?? '').trim()
    let call: ToolCall | null = null
    switch (tag) {
      case 'GOTO': call = toToolCall('open_url', { url: arg }); break
      case 'NEW_TAB': call = toToolCall('open_tab', { url: arg || 'about:blank' }); break
      case 'SEARCH': call = toToolCall('search_web', { query: arg }); break
      case 'PLAY_YOUTUBE': call = toToolCall('play_youtube', { query: arg }); break
      case 'CLICK': call = toToolCall('click_text', { text: arg }); break
      case 'TYPE': {
        const i = arg.indexOf(',')
        call = i > 0 ? toToolCall('type_text', { label: arg.slice(0, i).trim(), text: arg.slice(i + 1).trim() }) : null
        break
      }
      case 'HIGHLIGHT': call = toToolCall('highlight', { query: arg }); break
      case 'UNDERLINE': call = toToolCall('underline', { query: arg }); break
      case 'BOLD': call = toToolCall('bold', { query: arg }); break
      case 'SCROLL': call = toToolCall('scroll_to', { query: arg }); break
      case 'BACK': call = toToolCall('back', {}); break
      case 'FORWARD': call = toToolCall('forward', {}); break
      case 'RELOAD': call = toToolCall('reload', {}); break
      case 'CLEAR_MARKS': call = toToolCall('clear_marks', {}); break
    }
    if (call) calls.push(call)
  }
  return calls
}

export function stripLegacyTags(text: string): string {
  return text.replace(LEGACY_RE, '').replace(/\s{2,}/g, ' ').trim()
}

function normUrl(u: string): string {
  const p = parseWebUrl(u)
  if (!p) return ''
  return `${p.hostname.replace(/^www\./, '')}${p.pathname.replace(/\/$/, '')}${p.search}`.toLowerCase()
}

function mentions(userText: string, host: string): boolean {
  const h = host.replace(/^www\./, '').toLowerCase()
  const t = userText.toLowerCase()
  if (t.includes(h)) return true
  const label = h.split('.')[0]
  return label.length >= 4 && new RegExp(`\\b${label.replace(/[^a-z0-9]/g, '')}\\b`).test(t)
}

function queryFromUser(query: string, userText: string): boolean {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)
  if (!words.length) return false
  const t = userText.toLowerCase()
  return words.every((w) => t.includes(w))
}

/**
 * Deterministic policy. The model can only *propose*; this decides what runs.
 * Page text may be in the prompt, so anything that moves the user or touches page inputs
 * runs only if the user's own words (or trusted code) justify it, otherwise it needs a click.
 */
export function gateToolCall(call: ToolCall, ctx: GateContext): GateDecision {
  switch (call.name) {
    case 'highlight': case 'underline': case 'bold': case 'scroll_to': case 'clear_marks':
    case 'back': case 'forward': case 'reload': case 'park_tab':
      return { mode: 'auto', reason: 'Reversible, local to this page' }

    case 'open_url': case 'open_tab': {
      const raw = call.args.url
      if (call.name === 'open_tab' && raw === 'about:blank') return { mode: 'auto', reason: 'Blank tab' }
      const parsed = parseWebUrl(raw)
      if (!parsed) return { mode: 'deny', reason: 'Only http(s) addresses can be opened' }
      if (ctx.trustedUrls.some((t) => normUrl(t) === normUrl(raw))) return { mode: 'auto', reason: 'Address came from a lookup' }
      if (mentions(ctx.userText, parsed.hostname)) return { mode: 'auto', reason: 'You named this site' }
      return { mode: 'confirm', reason: 'The assistant suggested this address' }
    }

    case 'search_web': case 'play_youtube':
      return queryFromUser(call.args.query, ctx.userText)
        ? { mode: 'auto', reason: 'Search uses your own words' }
        : { mode: 'confirm', reason: 'The search text was written by the assistant' }

    case 'click_text':
      return { mode: 'confirm', reason: 'Clicking can submit or change things on the page' }

    case 'type_text':
      if (SENSITIVE_FIELD.test(call.args.label)) return { mode: 'deny', reason: 'CCLEAR never fills sensitive fields' }
      return { mode: 'confirm', reason: 'Typing into a page needs your approval' }
  }
}

export function describeToolCall(call: ToolCall): string {
  const a = call.args
  switch (call.name) {
    case 'open_url': return `Open ${a.url}`
    case 'open_tab': return `Open ${a.url} in a new tab`
    case 'search_web': return `Search the web for “${a.query}”`
    case 'play_youtube': return `Search YouTube for “${a.query}”`
    case 'click_text': return `Click “${a.text}”`
    case 'type_text': return `Type “${a.text}” into “${a.label}” (won’t submit)`
    case 'highlight': return `Highlight “${a.query}”`
    case 'underline': return `Underline “${a.query}”`
    case 'bold': return `Bold “${a.query}”`
    case 'scroll_to': return `Scroll to “${a.query}”`
    case 'clear_marks': return 'Clear marks'
    case 'back': return 'Go back'
    case 'forward': return 'Go forward'
    case 'reload': return 'Reload'
    case 'park_tab': return 'Park this tab for later'
  }
}

let seq = 0
export function proposeActions(calls: ToolCall[], ctx: GateContext): ProposedAction[] {
  const seen = new Set<string>()
  const out: ProposedAction[] = []
  for (const call of calls.slice(0, 6)) {
    const key = call.name + JSON.stringify(call.args)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: `act-${Date.now().toString(36)}-${seq++}`, call, decision: gateToolCall(call, ctx), label: describeToolCall(call) })
  }
  return out
}
