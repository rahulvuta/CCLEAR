/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useRef, useState, type MutableRefObject } from 'react'
import type { WebviewTag } from 'electron'
import type { ChatMessage, TabContextItem } from '../../shared/types'
import type { UITab } from '../components/TabStrip'
import { detectPageActionIntent, buildPageMarkQuery, pageActionSay, type PageActionIntent, type PagePassageSnapshot } from '../../ai/pageActions'
import type { ToolCall } from '../../ai/tools'
import { getPageMarkScript, getPagePassagesScript } from '../../focus/pageMarks'
import { needsScreenVision } from '../../ai/screenVision'
import { looksLikePageQuestion } from '../../ai/askPage'
import { looksLikeTabsQuestion } from '../../ai/askTabs'

export type AssistantEnv = {
  webviewRefs: MutableRefObject<Record<string, WebviewTag | null>>
  tabsRef: MutableRefObject<UITab[]>
  activeIdRef: MutableRefObject<string>
  tabContextItems: TabContextItem[]
  goal?: string
  normalizeUrl: (raw: string) => string
  navigateActive: (url: string) => void
  openTab: (url: string) => void
  goBack: () => void
  goForward: () => void
  reload: () => void
  injectAssist: (w: WebviewTag) => Promise<void>
  parkActiveTab: (note?: string) => void
  switchTab: (tabId: string) => void
}

type Msg = ChatMessage
type ActionState = NonNullable<Msg['actions']>[number]['state']

/** Click helper injected into the page. Matches visible text only. */
const clickScript = (text: string) => `(() => {
  const t = ${JSON.stringify(text)}.toLowerCase();
  const els = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]'));
  const el = els.find(e => (e.innerText || e.value || '').toLowerCase().includes(t));
  if (el) { el.click(); return true; } return false;
})()`

/** Typing helper: fills the field but never submits, and refuses password-like inputs. */
const typeScript = (label: string, text: string) => `(() => {
  const l = ${JSON.stringify(label)}.toLowerCase();
  const inputs = Array.from(document.querySelectorAll('input, textarea')).filter(i => !['password','hidden','file'].includes((i.type||'').toLowerCase()));
  const el = inputs.find(i => [i.placeholder, i.name, i.id, i.getAttribute('aria-label')].some(v => (v||'').toLowerCase().includes(l)));
  if (!el) return false;
  el.focus(); el.value = ${JSON.stringify(text)};
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`

export function useAssistant(env: AssistantEnv) {
  const envRef = useRef(env)
  envRef.current = env

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [think, setThink] = useState('')
  const [draft, setDraft] = useState('')
  const requestRef = useRef<string | null>(null)
  const messagesRef = useRef<Msg[]>([])
  messagesRef.current = messages

  const runPageMark = useCallback(async (intent: PageActionIntent) => {
    const e = envRef.current
    const wv = e.webviewRefs.current[e.activeIdRef.current]
    if (!wv || intent.kind === 'none') return { count: 0, scrolled: false }
    await e.injectAssist(wv)
    if (intent.kind === 'clear') return wv.executeJavaScript(getPageMarkScript({ mode: 'clear' }), true)
    setDraft('Finding matching passages…')
    const snapshot: PagePassageSnapshot = await wv.executeJavaScript(getPagePassagesScript(), true)
    const selection = await window.cclearBrowser.ai.selectPagePassages(intent.query, snapshot)
    const ids = new Set(selection.ids)
    const raw = await wv.executeJavaScript(
      getPageMarkScript({ mode: intent.kind, url: snapshot.url, passages: snapshot.passages.filter((p) => ids.has(p.id)) }),
      true
    )
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return { count: Number(parsed?.count || 0), scrolled: Boolean(parsed?.scrolled), stale: Boolean(parsed?.stale), usedFallback: selection.usedFallback }
  }, [])

  /** Execute one *already-approved* tool call. Returns false if it could not run. */
  const runTool = useCallback(async (call: ToolCall): Promise<boolean> => {
    const e = envRef.current
    const wv = e.webviewRefs.current[e.activeIdRef.current]
    const a = call.args
    switch (call.name) {
      case 'open_url': e.navigateActive(e.normalizeUrl(a.url)); return true
      case 'open_tab': e.openTab(a.url === 'about:blank' ? 'about:blank' : e.normalizeUrl(a.url)); return true
      case 'search_web': e.navigateActive(`https://www.google.com/search?q=${encodeURIComponent(a.query)}`); return true
      case 'play_youtube': {
        e.navigateActive(`https://www.youtube.com/results?search_query=${encodeURIComponent(a.query)}`)
        const id = e.activeIdRef.current
        setTimeout(() => {
          e.webviewRefs.current[id]?.executeJavaScript(
            `(() => { const c = setInterval(() => { const v = document.querySelector('ytd-video-renderer a#video-title'); if (v) { clearInterval(c); v.click(); } }, 500); setTimeout(() => clearInterval(c), 5000); })()`,
            true
          ).catch(() => {})
        }, 1500)
        return true
      }
      case 'back': e.goBack(); return true
      case 'forward': e.goForward(); return true
      case 'reload': e.reload(); return true
      case 'click_text': return wv ? Boolean(await wv.executeJavaScript(clickScript(a.text), true).catch(() => false)) : false
      case 'type_text': return wv ? Boolean(await wv.executeJavaScript(typeScript(a.label, a.text), true).catch(() => false)) : false
      case 'park_tab': e.parkActiveTab(a.note); return true
      case 'clear_marks': await runPageMark({ kind: 'clear' }); return true
      case 'highlight': case 'underline': case 'bold': case 'scroll_to': {
        const kind = call.name === 'scroll_to' ? 'scroll' : call.name
        const q = buildPageMarkQuery(a.query)
        if (!q.terms.length && !q.phrases.length) return false
        const r = await runPageMark({ kind, query: a.query, terms: q.terms, phrases: q.phrases })
        return Number((r as any)?.count || 0) > 0
      }
    }
  }, [runPageMark])

  const setActionState = useCallback((msgIndex: number, actionId: string, state: ActionState) => {
    setMessages((prev) => prev.map((m, i) => (i !== msgIndex || !m.actions ? m : { ...m, actions: m.actions.map((x) => (x.id === actionId ? { ...x, state } : x)) })))
  }, [])

  const confirmAction = useCallback(async (msgIndex: number, actionId: string) => {
    const act = messagesRef.current[msgIndex]?.actions?.find((x) => x.id === actionId)
    if (!act || act.state !== 'pending') return
    setActionState(msgIndex, actionId, (await runTool(act.call)) ? 'done' : 'failed')
  }, [runTool, setActionState])

  const dismissAction = useCallback((msgIndex: number, actionId: string) => setActionState(msgIndex, actionId, 'dismissed'), [setActionState])

  /** Scroll the page to a cited passage and flash it. */
  const openSource = useCallback(async (src: NonNullable<Msg['sources']>[number]) => {
    const e = envRef.current
    const wv = e.webviewRefs.current[e.activeIdRef.current]
    if (!wv) return
    await e.injectAssist(wv)
    await wv
      .executeJavaScript(getPageMarkScript({ mode: 'scroll', url: src.url, passages: [{ id: src.id, text: src.text, context: src.context }] }), true)
      .catch(() => {})
  }, [])

  const cancel = useCallback(() => {
    if (requestRef.current) void window.cclearBrowser.ai.cancel(requestRef.current)
  }, [])

  const send = useCallback(async (override?: string) => {
    const txt = String(override ?? input ?? '').trim()
    if (!txt || sending) return
    const e = envRef.current
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    setSending(true); setThink(''); setDraft('')
    const next: Msg[] = [...messagesRef.current, { role: 'user', content: txt }]
    setMessages(next)
    if (!override) setInput('')
    const finish = (m: Msg) => setMessages([...next, m])
    try {
      const wv = e.webviewRefs.current[e.activeIdRef.current]
      let pageUrl = ''
      try { pageUrl = wv?.getURL?.() || '' } catch { /* */ }

      // Obvious page-mark commands stay deterministic: fast, precise, and need no model routing.
      const pageAct = detectPageActionIntent(txt)
      if (pageAct.kind !== 'none') {
        if (!wv || /^about:/i.test(pageUrl)) return finish({ role: 'assistant', content: 'Open a page first, then I can mark or scroll on it.' })
        return finish({ role: 'assistant', content: pageActionSay(pageAct, await runPageMark(pageAct)) })
      }

      const blank = !pageUrl || /^about:/i.test(pageUrl)

      // Questions spanning several tabs ("which tab mentions pricing?") use text from the open tabs.
      if (looksLikeTabsQuestion(txt)) {
        try {
          setDraft('Reading your tabs…')
          const open = e.tabsRef.current.filter((t) => t.url && !/^about:/i.test(t.url)).slice(0, 6)
          const texts = await Promise.all(
            open.map(async (t) => {
              const w = e.webviewRefs.current[t.id]
              let text = ''
              try {
                text = String(await w?.executeJavaScript(`(document.querySelector('article, main, [role="main"]') || document.body).innerText.replace(/\\s+/g,' ').trim().slice(0, 12000)`, true))
              } catch { /* skip unreadable tab */ }
              return { id: t.id, title: t.title, url: t.url, text }
            })
          )
          if (texts.filter((t) => t.text).length < 1) return finish({ role: 'assistant', content: 'Open a few pages first, then I can compare them.' })
          const res = await window.cclearBrowser.ai.askTabs({ requestId, question: txt, tabs: texts })
          return finish({ role: 'assistant', content: res.answer, tabSources: res.sources })
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err)
          return finish({ role: 'assistant', content: m === 'Cancelled' ? 'Cancelled.' : m })
        } finally {
          setDraft('')
        }
      }

      // Questions about the open page are answered from the page itself, with clickable citations.
      if (wv && !blank && looksLikePageQuestion(txt)) {
        const explicit = /^\/ask\b/i.test(txt)
        try {
          setDraft('Reading the page…')
          await e.injectAssist(wv)
          const snapshot: PagePassageSnapshot = await wv.executeJavaScript(getPagePassagesScript(), true)
          const ask = await window.cclearBrowser.ai.askPage({ requestId, question: txt, snapshot })
          if (ask.kind === 'answer') {
            return finish({ role: 'assistant', content: ask.answer, sources: ask.sources.map((s) => ({ ...s, url: snapshot.url })) })
          }
          if (explicit) return finish({ role: 'assistant', content: 'This page does not seem to cover that.' })
        } catch (err) {
          if (err instanceof Error && /Cancelled/.test(err.message)) return finish({ role: 'assistant', content: 'Cancelled.' })
          /* otherwise fall through to the general assistant */
        } finally {
          setDraft('')
        }
      }

      let screenText = ''
      let screenImageBase64: string | undefined
      if (wv && !blank) {
        try {
          const raw = await wv.executeJavaScript(`(() => {
            const main = document.querySelector('#mw-content-text .mw-parser-output, #mw-content-text, article, main, [role="main"]');
            const t = String((main && (main.innerText || main.textContent)) || (document.body && document.body.innerText) || '').replace(/\\s+/g, ' ').trim().slice(0, 1600);
            return JSON.stringify({ title: document.title || '', href: location.href, text: t });
          })()`, true)
          const p = typeof raw === 'string' ? JSON.parse(raw) : raw
          if (p?.text) screenText = `TITLE: ${p.title}\nURL: ${p.href}\nTEXT: ${p.text}`
        } catch { /* */ }
        if (needsScreenVision(txt)) {
          try {
            const image = await wv.capturePage()
            const size = image.getSize()
            screenImageBase64 = (size.width > 1280 ? image.resize({ width: 1280 }) : image).toPNG().toString('base64')
          } catch { /* */ }
        }
      }

      const res = await window.cclearBrowser.ai.assist({
        requestId,
        messages: next.slice(-16).map(({ role, content }) => ({ role, content })),
        tabs: e.tabContextItems,
        activeTabId: e.activeIdRef.current,
        screenText,
        screenImageBase64,
        goal: e.goal
      })

      const actions: NonNullable<Msg['actions']> = []
      for (const act of res.actions) {
        if (act.decision.mode === 'auto') {
          const ok = await runTool(act.call).catch(() => false)
          actions.push({ ...act, state: ok ? 'done' : 'failed' })
        } else if (act.decision.mode === 'confirm') {
          actions.push({ ...act, state: 'pending' })
        } else {
          actions.push({ ...act, state: 'dismissed' })
        }
      }
      const content = res.text || (actions.some((a) => a.state === 'done') ? 'Done.' : actions.length ? 'Here is what I can do:' : 'I did not catch that — try rephrasing?')
      finish({ role: 'assistant', content, actions: actions.length ? actions : undefined })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      finish({ role: 'assistant', content: msg === 'Cancelled' ? 'Cancelled.' : `Assistant error:\n${msg}` })
    } finally {
      requestRef.current = null
      setSending(false); setThink(''); setDraft('')
    }
  }, [input, sending, runPageMark, runTool])

  return { openSource, messages, input, setInput, sending, think, draft, setThink, setDraft, send, cancel, confirmAction, dismissAction }
}
