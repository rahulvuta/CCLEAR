/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WebviewTag } from 'electron'
import { ChatSidebar } from './components/ChatSidebar'
import { TabStrip, type UITab } from './components/TabStrip'
import { TopBar } from './components/TopBar'
import { WebviewHost } from './components/WebviewHost'
import type { ChatMessage, PageBlockForSimplify, TabContextItem, TabContextSummary } from '../shared/types'
import type { ApplySummaryItem } from '../focus/simplify'
import { WhyAmIHereBox } from './components/WhyAmIHereBox'
import {
  buildApplySummariesScript,
  buildRestoreSummariesScript,
  focusSimplifyCacheKey,
  getExtractChunksScript,
  pageBlocksToSimplifyChunks,
  sameFocusSimplifyPage
} from '../focus/simplify'
import { selectBlocksForSimplify } from '../focus/blockFilters'
import { getInjectReadingAssistScript, getSetFocusVisualScript } from '../focus/injector'
import { detectPageActionIntent, pageActionSay, parsePageActionTags, type PageActionIntent } from '../ai/pageActions'
import { getPageMarkScript, getPagePassagesScript } from '../focus/pageMarks'
import type { PagePassageSnapshot } from '../ai/pageActions'
import { needsScreenVision } from '../ai/screenVision'

const EXTRACT_MIN_CHARS = 90
/** Top-N passages per page (fewer keeps total time reliably under ~5s with local model). */
const SIMPLIFY_MAX_BLOCKS = 100
/** Immediate schedule after focus/nav */
const FOCUS_SIMPLIFY_DEBOUNCE_MS = 800
/** Re-scan when article text is still hydrating */
const EXTRACT_RETRY_DELAYS_MS = [300, 800, 1500] as const

function normalizeUrl(raw: string): string {
  const t = raw.trim()
  if (!t) return 'about:blank'
  if (/^about:/i.test(t)) return t
  if (/^https?:\/\//i.test(t)) return t
  const local = /^mailto:|^file:/i.test(t)
  if (local) return t
  // Handle localhost and IP addresses
  if (/^localhost(:\d+)?/i.test(t) || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i.test(t)) return `http://${t}`
  if (t.includes('.') && !t.includes(' ')) return `https://${t}`
  const q = encodeURIComponent(t)
  return `https://www.google.com/search?q=${q}`
}

function faviconForUrl(url: string): string {
  try {
    const host = new URL(url).hostname
    if (host) return `https://www.google.com/s2/favicons?domain=${host}&sz=64`
  } catch {
    //
  }
  return ''
}

async function waitForWebviewQuietImpl(w: WebviewTag): Promise<void> {
  try {
    if (typeof w.isLoading !== 'function') return
    await new Promise<void>((resolve) => {
      try {
        if (!w.isLoading()) {
          resolve()
          return
        }
      } catch {
        resolve()
        return
      }
      let done = false
      const finish = () => {
        if (done) return
        try {
          if (!w.isLoading()) {
            done = true
            cleanup()
            resolve()
          }
        } catch {
          done = true
          cleanup()
          resolve()
        }
      }
      const onStop = () => finish()
      const onFinish = () => finish()
      const safety = window.setTimeout(() => {
        done = true
        cleanup()
        resolve()
      }, 1400)
      function cleanup() {
        clearTimeout(safety)
        w.removeEventListener('did-stop-loading', onStop)
        w.removeEventListener('did-finish-load', onFinish)
      }
      w.addEventListener('did-stop-loading', onStop)
      w.addEventListener('did-finish-load', onFinish)
    })
  } catch {
    //
  }
  await new Promise<void>((r) => setTimeout(r, 80))
}

async function waitForWebviewQuiet(w: WebviewTag): Promise<void> {
  await Promise.race([
    waitForWebviewQuietImpl(w),
    new Promise<void>((r) => setTimeout(r, 400)),
  ])
}

export function App() {
  const firstId = useMemo(() => String(crypto.randomUUID()), [])
  const [tabs, setTabs] = useState<UITab[]>([{ id: firstId, url: 'about:blank', src: 'about:blank', title: '' }])
  const [activeId, setActiveId] = useState(firstId)
  const [navUrl, setNavUrl] = useState('about:blank')
  const [focusModeEnabled, setFocusModeEnabled] = useState(false)
  const [simplifyBusy, setSimplifyBusy] = useState(false)
  
  const [tabContexts, setTabContexts] = useState<Record<string, TabContextSummary[]>>({})
  const [contextLoading, setContextLoading] = useState<Record<string, boolean>>({})
  const historyMapRef = useRef<Record<string, string[]>>({})

  /** Last simplified payloads per tab+URL. Kept until reload or tab close so Focus off/on is instant. */
  const simplifyApplyCacheRef = useRef<Map<string, ApplySummaryItem[]>>(new Map())
  /** Serial queue so no request is dropped while another tab or navigation is in flight */
  const simplifyChainRef = useRef<Promise<void>>(Promise.resolve())
  /** Bumped when Focus turns off or the page changes so in-flight applies are discarded */
  const simplifyEpochRef = useRef(0)
  const runFocusAutoSimplifyRef = useRef<(tabId: string, pageUrl: string) => void>(() => {})
  const persistFocusModeRef = useRef<(next: boolean) => Promise<void>>(async () => {})

  function simplifyCacheKey(tabId: string, url: string): string {
    return focusSimplifyCacheKey(tabId, url)
  }

  function invalidateSimplifyStateForTab(tabId: string) {
    for (const k of [...simplifyApplyCacheRef.current.keys()]) {
      if (k.startsWith(`${tabId}|`)) simplifyApplyCacheRef.current.delete(k)
    }
  }

  function hasSimplifyCache(tabId: string, url: string): boolean {
    return (simplifyApplyCacheRef.current.get(simplifyCacheKey(tabId, url))?.length ?? 0) > 0
  }

  const invalidateSimplifyLatestRef = useRef(invalidateSimplifyStateForTab)
  invalidateSimplifyLatestRef.current = invalidateSimplifyStateForTab

  const [chatInput, setChatInput] = useState('')
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([])
  const [chatSending, setChatSending] = useState(false)
  const [chatThink, setChatThink] = useState('')
  const [chatDraft, setChatDraft] = useState('')
  const aiHealthyRef = useRef(false)
  const [aiHealthy, setAiHealthy] = useState<boolean | null>(null)
  const webviewRefs = useRef<Record<string, WebviewTag | null>>({})
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs

  const setupOnce = useRef(new WeakSet<WebviewTag>())
  const focusModeEnabledRef = useRef(focusModeEnabled)
  const activeIdRef = useRef(activeId)
  const focusSimplifyScheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastInferredRef = useRef<Map<string, string>>(new Map())
  const [sidebarOpen, setSidebarOpen] = useState(true)
  focusModeEnabledRef.current = focusModeEnabled
  activeIdRef.current = activeId

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0]

  const tabContextItems: TabContextItem[] = useMemo(
    () =>
      tabs.map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        isActive: t.id === activeId
      })),
    [tabs, activeId]
  )

  /** Inject reading-assist CSS into a webview (idempotent) */
  const injectAssist = useCallback(async (w: WebviewTag) => {
    try {
      await w.executeJavaScript(getInjectReadingAssistScript(), true)
    } catch {
      //
    }
  }, [])

  /** Apply or remove the focus-visual class on a webview */
  const applyFocusVisual = useCallback(async (w: WebviewTag, enabled: boolean) => {
    try {
      await w.executeJavaScript(getSetFocusVisualScript(enabled), true)
    } catch {
      //
    }
  }, [])

  const runFocusAutoSimplifyImpl = useCallback(async (tabId: string, pageUrl: string) => {
    const epoch = simplifyEpochRef.current
    const w = webviewRefs.current[tabId]
    if (!w) return
    const trimmed = pageUrl.trim()
    if (/^about:/i.test(trimmed)) return

    const stillCurrent = () => {
      if (epoch !== simplifyEpochRef.current || !focusModeEnabledRef.current || activeIdRef.current !== tabId) {
        return false
      }
      try {
        const now = w.getURL()
        if (now && !/^about:/i.test(now) && !sameFocusSimplifyPage(now, trimmed)) return false
      } catch {
        //
      }
      return true
    }

    if (!stillCurrent()) return

    let isSearch = false
    try {
      const host = new URL(trimmed).hostname
      isSearch = /google\.|duckduckgo\.|bing\.|yahoo\.|brave\.|kagi\./i.test(host)
    } catch {
      isSearch = false
    }
    const cacheKey = simplifyCacheKey(tabId, trimmed)
    const already = (await w.executeJavaScript(
      `document.documentElement.hasAttribute('data-cclear-focus-complete')`,
      true
    )) as boolean
    if (already) return
    if (!stillCurrent()) return

    const cached = simplifyApplyCacheRef.current.get(cacheKey)
    if (cached && cached.length > 0) {
      try {
        let appliedCount = (await w.executeJavaScript(buildApplySummariesScript(cached, isSearch), true)) as number
        if (appliedCount === 0) {
          await waitForWebviewQuiet(w)
          if (!stillCurrent()) return
          appliedCount = (await w.executeJavaScript(buildApplySummariesScript(cached, isSearch), true)) as number
        }
        if (appliedCount > 0 && stillCurrent()) {
          await w.executeJavaScript(`document.documentElement.setAttribute('data-cclear-focus-complete', '')`, true)
        }
      } catch {
        // Keep the first pass; do not generate a second rewrite for this page.
      }
      return
    }

    await waitForWebviewQuiet(w)
    if (!stillCurrent()) return

    let liveUrl = trimmed
    try {
      liveUrl = w.getURL() || trimmed
    } catch {
      liveUrl = trimmed
    }
    if (liveUrl && !/^about:/i.test(liveUrl) && !sameFocusSimplifyPage(liveUrl, trimmed)) {
      return
    }
    if (!stillCurrent()) return

    const tryExtract = async () =>
      (await w.executeJavaScript(getExtractChunksScript(EXTRACT_MIN_CHARS, isSearch), true)) as PageBlockForSimplify[]

    let blocks = await tryExtract()
    if (!blocks.length) {
      for (const ms of EXTRACT_RETRY_DELAYS_MS) {
        if (!stillCurrent()) return
        await new Promise<void>((r) => setTimeout(r, ms))
        try {
          if (typeof w.isLoading === 'function' && w.isLoading()) {
            await waitForWebviewQuiet(w)
          }
        } catch {
          //
        }
        if (!stillCurrent()) return
        blocks = await tryExtract()
        if (blocks.length) break
      }
    }
    if (!blocks.length) return
    if (!stillCurrent()) return

    const list = selectBlocksForSimplify(blocks, SIMPLIFY_MAX_BLOCKS)
    if (!list.length) return

    const chunks = pageBlocksToSimplifyChunks(list)
    const origById = new Map(list.map((b) => [b.id, b.text]))
    const tagById = new Map(list.map((b) => [b.id, b.tagName]))

    setSimplifyBusy(true)
    try {
      const out: ApplySummaryItem[] = []
      for (let offset = 0; offset < chunks.length; offset += 3) {
        if (!stillCurrent()) return
        const res = await window.cclearBrowser.ai.simplifyChunks(chunks.slice(offset, offset + 3))
        if (!stillCurrent()) return
        const batch = res.map((r) => ({
          ...r,
          original: origById.get(r.id),
          summary: r.summary || (origById.get(r.id) ?? ''),
          highlightPhrases: r.highlightPhrases ?? [],
          termEmphasis: r.termEmphasis ?? [],
          tagName: tagById.get(r.id)
        }))
        await w.executeJavaScript(buildApplySummariesScript(batch, isSearch), true)
        out.push(...batch)
        if (!stillCurrent()) {
          try {
            await w.executeJavaScript(buildRestoreSummariesScript(), true)
          } catch {
            //
          }
          return
        }
      }
      if (out.length > 0) simplifyApplyCacheRef.current.set(cacheKey, out)
      await w.executeJavaScript(`document.documentElement.setAttribute('data-cclear-focus-complete', '')`, true)
    } catch (e) {
      console.warn('[cclear] focus simplify:', e instanceof Error ? e.message : e)
    } finally {
      if (epoch === simplifyEpochRef.current) setSimplifyBusy(false)
    }
  }, [])

  /** Enqueue so we never drop a run when Ollama or another tab is busy */
  const enqueueFocusAutoSimplify = useCallback((tabId: string, pageUrl: string) => {
    simplifyChainRef.current = simplifyChainRef.current
      .then(() => runFocusAutoSimplifyImpl(tabId, pageUrl))
      .catch((e) => console.warn('[cclear] focus simplify chain:', e))
  }, [runFocusAutoSimplifyImpl])

  runFocusAutoSimplifyRef.current = enqueueFocusAutoSimplify

  async function restoreSimplifiedAcrossAllTabs() {
    for (const t of tabsRef.current) {
      const w = webviewRefs.current[t.id]
      if (!w) continue
      try {
        await w.executeJavaScript(buildRestoreSummariesScript(), true)
      } catch {
        //
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    void window.cclearBrowser.prefs
      .get()
      .then((p) => {
        if (!cancelled) setFocusModeEnabled(p.focusModeEnabled)
      })
      .catch(() => {})
    void window.cclearBrowser.ai
      .health()
      .then((h) => {
        if (!cancelled) setAiHealthy(h.ok)
      })
      .catch(() => {
        setAiHealthy(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const u = activeTab?.url ?? 'about:blank'
    setNavUrl(u || 'about:blank')
  }, [activeTab?.url, activeTab?.id])

  const persistFocusMode = useCallback(async (next: boolean) => {
    setFocusModeEnabled(next)
    if (!next) {
      simplifyEpochRef.current += 1
      setSimplifyBusy(false)
    }
    await window.cclearBrowser.prefs.set({ focusModeEnabled: next })
    if (!next) {
      await restoreSimplifiedAcrossAllTabs()
    }
  }, [])
  persistFocusModeRef.current = persistFocusMode

  useEffect(() => {
    focusSimplifyScheduleRef.current && clearTimeout(focusSimplifyScheduleRef.current)
    focusSimplifyScheduleRef.current = null

    if (!focusModeEnabled) return

    const tid = activeIdRef.current
    const url = tabsRef.current.find((x) => x.id === tid)?.url ?? 'about:blank'
    const delay = hasSimplifyCache(tid, url) ? 0 : FOCUS_SIMPLIFY_DEBOUNCE_MS

    focusSimplifyScheduleRef.current = setTimeout(() => {
      focusSimplifyScheduleRef.current = null
      enqueueFocusAutoSimplify(tid, url)
    }, delay)

    return () => {
      if (focusSimplifyScheduleRef.current) clearTimeout(focusSimplifyScheduleRef.current)
      focusSimplifyScheduleRef.current = null
    }
  }, [focusModeEnabled, activeId, activeTab.url, enqueueFocusAutoSimplify])

  const attachIfNeeded = useCallback(
    (id: string, w: WebviewTag) => {
      if (setupOnce.current.has(w)) return
      setupOnce.current.add(w)

      let latestIntendedUrl: string | null = null

      const commitDisplayUrl = (raw: string) => {
        const effectiveUrl = (raw || '').trim() || 'about:blank'
        if (effectiveUrl === 'about:blank' && latestIntendedUrl && latestIntendedUrl !== 'about:blank') {
          return
        }

        const prevUrl = tabsRef.current.find((t) => t.id === id)?.url
        if (prevUrl === effectiveUrl) return
        if (
          prevUrl &&
          prevUrl !== effectiveUrl &&
          prevUrl !== 'about:blank' &&
          effectiveUrl !== 'about:blank'
        ) {
          simplifyEpochRef.current += 1
        }

        const favicon = effectiveUrl !== 'about:blank' ? faviconForUrl(effectiveUrl) : ''

        setTabs((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, url: effectiveUrl, favicon: favicon || t.favicon } : t
          )
        )
        if (activeIdRef.current === id) {
          setNavUrl(effectiveUrl === 'about:blank' ? '' : effectiveUrl)
        }

        if (effectiveUrl && effectiveUrl !== 'about:blank') {
          if (!historyMapRef.current[id]) historyMapRef.current[id] = []
          const arr = historyMapRef.current[id]
          if (arr[arr.length - 1] !== effectiveUrl) arr.push(effectiveUrl)
        }
      }

      const urlFromNavEvent = (e: any): string => {
        if (e && typeof e.url === 'string' && e.url) return e.url
        try {
          return w.getURL() || ''
        } catch {
          return ''
        }
      }

      const updUrlFromNav = (e: any) => {
        if (e && e.isMainFrame === false) return
        commitDisplayUrl(urlFromNavEvent(e))
      }

      const syncUrlFromWebview = () => {
        try {
          commitDisplayUrl(w.getURL() || '')
        } catch {
          //
        }
      }

      const onTitle = (_e: any, title: string) => {
        setTabs((prev) =>
          prev.map((t) => (t.id === id ? { ...t, title: title || t.title } : t))
        )
      }
      
      const onFavicon = (_e: any, favicons: string[]) => {
        if (favicons && favicons[0]) {
          setTabs((prev) =>
            prev.map((t) => (t.id === id ? { ...t, favicon: favicons[0] } : t))
          )
        }
      }

      const onLoad = async () => {
        syncUrlFromWebview()
        await injectAssist(w)
        await applyFocusVisual(w, focusModeEnabledRef.current)
        const tid = id
        
        // Sync title on load just in case event was missed
        const currentTitle = w.getTitle()
        if (currentTitle && currentTitle !== 'about:blank') {
          setTabs(prev => prev.map(t => t.id === tid ? { ...t, title: currentTitle } : t))
        }

        let pageUrl = 'about:blank'
        try {
          pageUrl = w.getURL() || 'about:blank'
        } catch {
          pageUrl = tabsRef.current.find((x) => x.id === tid)?.url ?? 'about:blank'
        }
        
        if (pageUrl && !pageUrl.startsWith('about:')) {
          if (lastInferredRef.current.get(tid) !== pageUrl) {
            lastInferredRef.current.set(tid, pageUrl)
            setContextLoading(p => ({ ...p, [tid]: true }))
            const hist = historyMapRef.current[tid] || []
            try {
              const summary = await window.cclearBrowser.ai.inferContext(pageUrl, w.getTitle(), hist)
              setTabContexts(p => {
                const prevArr = p[tid] || []
                return { ...p, [tid]: [...prevArr, summary].slice(-10) }
              })
            } catch {
            } finally {
              setContextLoading(p => ({ ...p, [tid]: false }))
            }
          }
        }

        if (!focusModeEnabledRef.current || activeIdRef.current !== tid) return
        runFocusAutoSimplifyRef.current(tid, pageUrl)
      }

      w.addEventListener('did-start-navigation', ((e: any) => {
        if (e.isMainFrame) {
          latestIntendedUrl = e.url
        }
      }) as any)
      
      w.addEventListener('did-navigate', updUrlFromNav as any)
      w.addEventListener('did-navigate-in-page', updUrlFromNav as any)
      w.addEventListener('did-stop-loading', syncUrlFromWebview as any)
      w.addEventListener('did-finish-load', onLoad)
      w.addEventListener('page-title-updated', onTitle as any)
      w.addEventListener('page-favicon-updated', onFavicon as any)
    },
    [injectAssist]
  )

  useEffect(() => {
    // Apply reading assist + focus visual to all tabs when focus mode toggles
    Object.entries(webviewRefs.current).forEach(([, w]) => {
      if (w) {
        void injectAssist(w).catch(() => {})
        void applyFocusVisual(w, focusModeEnabled).catch(() => {})
      }
    })
  }, [focusModeEnabled, activeId, injectAssist, applyFocusVisual])

  const setWebviewRef = useCallback(
    (id: string, el: WebviewTag | null) => {
      webviewRefs.current[id] = el
      if (el) attachIfNeeded(id, el)
    },
    [attachIfNeeded]
  )

  function goNavigate() {
    const nextUrl = normalizeUrl(navUrl)
    setNavUrl(nextUrl)
    const favicon = faviconForUrl(nextUrl)

    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeId
          ? { ...t, url: nextUrl, src: nextUrl, title: t.title, favicon: favicon || t.favicon }
          : t
      )
    )
  }

  function goBack() {
    try {
      webviewRefs.current[activeId]?.goBack()
    } catch {
      //
    }
  }

  function goForward() {
    try {
      webviewRefs.current[activeId]?.goForward()
    } catch {
      //
    }
  }

  function reload() {
    simplifyEpochRef.current += 1
    invalidateSimplifyStateForTab(activeId)
    try {
      webviewRefs.current[activeId]?.reload()
    } catch {
      //
    }
  }

  function newTab() {
    const id = String(crypto.randomUUID())
    setTabs((t) => [...t, { id, url: 'about:blank', src: 'about:blank', title: '' }])
    setActiveId(id)
  }

  function closeTab(idToClose: string) {
    if (tabs.length <= 1) return
    const idx = tabs.findIndex((t) => t.id === idToClose)
    if (idx < 0) return

    delete webviewRefs.current[idToClose]
    delete historyMapRef.current[idToClose]
    invalidateSimplifyStateForTab(idToClose)

    // Clean up context state for the closed tab
    setTabContexts(p => { const n = { ...p }; delete n[idToClose]; return n })
    setContextLoading(p => { const n = { ...p }; delete n[idToClose]; return n })

    const filtered = tabs.filter((t) => t.id !== idToClose)

    let nextActive = activeId
    if (activeId === idToClose) {
      nextActive = tabs[idx - 1]?.id ?? filtered[0]?.id ?? activeId
    }

    setTabs(filtered)
    setActiveId(nextActive)
  }

  const handleSendChat = async (override?: string) => {
    const txt = String(override ?? chatInput ?? '').trim()
    if (!txt || chatSending) return
    setChatSending(true)
    setChatThink('')
    setChatDraft('')
    const nextMsgs: ChatMessage[] = [...chatMsgs, { role: 'user', content: txt }]
    setChatMsgs(nextMsgs)
    if (!override) setChatInput('')
    try {
      const activeWv = webviewRefs.current[activeIdRef.current]
      let pageUrl = ''
      try { pageUrl = activeWv?.getURL?.() || '' } catch { pageUrl = '' }

      const runPageMark = async (intent: PageActionIntent) => {
        if (!activeWv || intent.kind === 'none') return { count: 0, scrolled: false }
        await injectAssist(activeWv)
        if (intent.kind === 'clear') {
          return activeWv.executeJavaScript(getPageMarkScript({ mode: 'clear' }), true)
        }
        setChatDraft('Finding matching passages…')
        const snapshot: PagePassageSnapshot = await activeWv.executeJavaScript(getPagePassagesScript(), true)
        const selection = await window.cclearBrowser.ai.selectPagePassages(intent.query, snapshot)
        const selectedIds = new Set(selection.ids)
        const raw = await activeWv.executeJavaScript(getPageMarkScript({
          mode: intent.kind,
          url: snapshot.url,
          passages: snapshot.passages.filter((p) => selectedIds.has(p.id))
        }), true)
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        return {
          count: Number(parsed?.count || 0), scrolled: Boolean(parsed?.scrolled),
          stale: Boolean(parsed?.stale), usedFallback: selection.usedFallback
        }
      }

      const pageAct = detectPageActionIntent(txt)
      if (pageAct.kind !== 'none') {
        if (!activeWv || /^about:/i.test(pageUrl)) {
          setChatMsgs([...nextMsgs, { role: 'assistant', content: 'Open a page first, then I can mark or scroll on it.' }])
          return
        }
        const result = await runPageMark(pageAct)
        setChatMsgs([...nextMsgs, { role: 'assistant', content: pageActionSay(pageAct, result) }])
        return
      }

      // Grab screen text if a webview is active
      let screenText = ''
      let screenImageBase64: string | undefined
      const activeTab = tabsRef.current.find((t) => t.id === activeIdRef.current)
      const isBlankTab = !activeTab?.url || activeTab.url === 'about:blank'
      if (activeWv) {
        try {
          const raw = await activeWv.executeJavaScript(
            `(() => {
              const title = document.title || '';
              const href = String(location.href || '');
              if (!href || href === 'about:blank') return JSON.stringify({ title, href, text: '' });
              const main = document.querySelector('#mw-content-text .mw-parser-output, #mw-content-text, article, main, [role="main"]');
              const rawText = String((main && (main.innerText || main.textContent)) || (document.body && (document.body.innerText || document.body.textContent)) || '');
              const text = rawText.replace(/\\s+/g, ' ').trim().slice(0, 1600);
              return JSON.stringify({ title, href, text });
            })()`,
            true
          )
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
          const title = String(parsed?.title || '')
          const href = String(parsed?.href || pageUrl || '')
          const text = String(parsed?.text || '')
          screenText = text ? `TITLE: ${title}\nURL: ${href}\nTEXT: ${text}` : ''
        } catch {
          //
        }
        if (needsScreenVision(txt) && !isBlankTab) {
          try {
            const image = await activeWv.capturePage()
            const size = image.getSize()
            const maxW = 1280
            const resized = size.width > maxW ? image.resize({ width: maxW }) : image
            screenImageBase64 = resized.toPNG().toString('base64')
          } catch {
            //
          }
        }
      }

      const assistant = await window.cclearBrowser.ai.chat(
        nextMsgs.slice(-16),
        tabContextItems,
        activeId,
        screenText,
        screenImageBase64
      )

      const taggedAct = parsePageActionTags(assistant)
      let pageActionMessage = ''
      if (taggedAct.kind !== 'none' && activeWv && !/^about:/i.test(pageUrl)) {
        pageActionMessage = pageActionSay(taggedAct, await runPageMark(taggedAct))
      }
      
      // Execute AI actions
      if (assistant.includes('[GOTO:')) {
        const m = assistant.match(/\[GOTO:\s*([\s\S]*?)\]/i)
        if (m) {
          const url = normalizeUrl(m[1].trim())
          const aid = activeIdRef.current
          setNavUrl(url)
          setTabs(prev => prev.map(t => t.id === aid ? { ...t, url, src: url, title: '' } : t))
        }
      }
      if (assistant.includes('[NEW_TAB')) {
        const m = assistant.match(/\[NEW_TAB:?\s*([\s\S]*?)\]/i)
        const url = (m && m[1].trim()) ? normalizeUrl(m[1].trim()) : 'about:blank'
        const id = String(crypto.randomUUID())
        setTabs(t => [...t, { id, url, src: url, title: '' }])
        setActiveId(id)
      }
      if (assistant.includes('[BACK]')) goBack()
      if (assistant.includes('[FORWARD]')) goForward()
      if (assistant.includes('[RELOAD]')) reload()

      if (assistant.includes('[SEARCH:')) {
        const m = assistant.match(/\[SEARCH:\s*([\s\S]*?)\]/i)
        if (m) {
          const q = m[1].trim()
          const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`
          const aid = activeIdRef.current
          setNavUrl(url)
          setTabs(prev => prev.map(t => t.id === aid ? { ...t, url, src: url, title: '' } : t))
        }
      }

      if (assistant.includes('[PLAY_YOUTUBE:')) {
        const m = assistant.match(/\[PLAY_YOUTUBE:\s*([\s\S]*?)\]/i)
        if (m) {
          const q = m[1].trim()
          const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
          const aid = activeIdRef.current
          setNavUrl(url)
          setTabs(prev => prev.map(t => t.id === aid ? { ...t, url, src: url, title: '' } : t))
          
          // Auto-click the first video after load
          setTimeout(() => {
            const w = webviewRefs.current[aid]
            if (w) {
              w.executeJavaScript(`
                (() => {
                  const check = setInterval(() => {
                    const firstVid = document.querySelector('ytd-video-renderer a#video-title, ytd-compact-video-renderer a#video-title');
                    if (firstVid) {
                      clearInterval(check);
                      firstVid.click();
                    }
                  }, 500);
                  setTimeout(() => clearInterval(check), 5000);
                })();
              `, true).catch(() => {})
            }
          }, 1500)
        }
      }

      if (assistant.includes('[CLICK:')) {
        const m = assistant.match(/\[CLICK:\s*([\s\S]*?)\]/i)
        if (m) {
          const text = m[1].trim()
          const w = webviewRefs.current[activeIdRef.current]
          if (w) {
            w.executeJavaScript(`
              (() => {
                const text = ${JSON.stringify(text)}.toLowerCase();
                const els = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]'));
                const target = els.find(e => (e.innerText || e.value || '').toLowerCase().includes(text));
                if (target) {
                  target.click();
                  return true;
                }
                return false;
              })();
            `, true).catch(() => {})
          }
        }
      }

      if (assistant.includes('[TYPE:')) {
        const m = assistant.match(/\[TYPE:\s*([^,]+),\s*([\s\S]*?)\]/i)
        if (m) {
          const label = m[1].trim()
          const text = m[2].trim()
          const w = webviewRefs.current[activeIdRef.current]
          if (w) {
            w.executeJavaScript(`
              (() => {
                const l = ${JSON.stringify(label)}.toLowerCase();
                const inputs = Array.from(document.querySelectorAll('input, textarea'));
                const target = inputs.find(i => {
                  return (i.placeholder || '').toLowerCase().includes(l) ||
                         (i.name || '').toLowerCase().includes(l) ||
                         (i.id || '').toLowerCase().includes(l) ||
                         (i.getAttribute('aria-label') || '').toLowerCase().includes(l);
                });
                if (target) {
                  target.value = ${JSON.stringify(text)};
                  target.dispatchEvent(new Event('input', { bubbles: true }));
                  target.dispatchEvent(new Event('change', { bubbles: true }));
                  if (target.form) {
                    const sb = target.form.querySelector('input[type="submit"], button[type="submit"]');
                    if (sb) sb.click();
                    else target.form.submit();
                  } else {
                    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                  }
                  return true;
                }
                return false;
              })();
            `, true).catch(() => {})
          }
        }
      }

      // Clean display message
      const displayMsg = assistant
        .replace(/\[GOTO:[\s\S]*?\]/gi, '')
        .replace(/\[NEW_TAB:?[\s\S]*?\]/gi, '')
        .replace(/\[BACK\]/gi, '')
        .replace(/\[FORWARD\]/gi, '')
        .replace(/\[RELOAD\]/gi, '')
        .replace(/\[SEARCH:[\s\S]*?\]/gi, '')
        .replace(/\[PLAY_YOUTUBE:[\s\S]*?\]/gi, '')
        .replace(/\[CLICK:[\s\S]*?\]/gi, '')
        .replace(/\[TYPE:[\s\S]*?\]/gi, '')
        .replace(/\[HIGHLIGHT:[\s\S]*?\]/gi, '')
        .replace(/\[UNDERLINE:[\s\S]*?\]/gi, '')
        .replace(/\[BOLD:[\s\S]*?\]/gi, '')
        .replace(/\[SCROLL:[\s\S]*?\]/gi, '')
        .replace(/\[CLEAR_MARKS\]/gi, '')
        .trim()

      const hasTags = assistant.includes('[') && assistant.includes(']')
      const finalMsg = pageActionMessage || (displayMsg ? displayMsg : (hasTags ? "Action completed." : assistant))

      setChatMsgs([...nextMsgs, { role: 'assistant', content: finalMsg }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setChatMsgs([...nextMsgs, { role: 'assistant', content: `Assistant error:\n${msg}` }])
    } finally {
      setChatSending(false)
      setChatThink('')
      setChatDraft('')
    }
  }

  // Stable key for tab-grouping: only re-run when the set of URLs actually changes
  const tabUrlsKey = useMemo(() => tabs.map(t => t.url).sort().join('|'), [tabs])

  useEffect(() => {
    if (tabs.length < 2) return
    const currentTabs = tabsRef.current
    const items: TabContextItem[] = currentTabs.map(t => ({ id: t.id, title: t.title, url: t.url, isActive: t.id === activeIdRef.current }))
    const timer = setTimeout(async () => {
      try {
        const groups = await window.cclearBrowser.ai.groupTabs(items)
        if (groups && groups.length > 0) {
          setTabs(prev => prev.map(t => {
            const g = groups.find(x => x.id === t.id)
            return g ? { ...t, group: g.group } : t
          }))
        }
      } catch {
        // ignore
      }
    }, 8000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabUrlsKey, tabs.length])

  useEffect(() => {
    const api = window.cclearBrowser.ai
    if (!api.onChatProgress) return
    return api.onChatProgress((payload) => {
      setChatThink(payload.think || '')
      setChatDraft(payload.content || '')
    })
  }, [])

  // Keyboard shortcuts from native menu
  useEffect(() => {
    return window.cclearBrowser.onShortcut((action, ...args) => {
      const currentTabs = tabsRef.current
      const currentActiveId = activeIdRef.current
      const w = webviewRefs.current[currentActiveId]

      switch (action) {
        case 'new-tab': {
          const id = String(crypto.randomUUID())
          setTabs((t) => [...t, { id, url: 'about:blank', src: 'about:blank', title: '' }])
          setActiveId(id)
          break
        }
        case 'close-tab': {
          if (currentTabs.length <= 1) break
          const idx = currentTabs.findIndex((t) => t.id === currentActiveId)
          if (idx < 0) break
          delete webviewRefs.current[currentActiveId]
          delete historyMapRef.current[currentActiveId]
          invalidateSimplifyStateForTab(currentActiveId)
          setTabContexts(p => { const n = { ...p }; delete n[currentActiveId]; return n })
          setContextLoading(p => { const n = { ...p }; delete n[currentActiveId]; return n })
          const filtered = currentTabs.filter((t) => t.id !== currentActiveId)
          const nextActive = currentTabs[idx - 1]?.id ?? filtered[0]?.id ?? currentActiveId
          setTabs(filtered)
          setActiveId(nextActive)
          break
        }
        case 'focus-address': {
          const input = document.querySelector('.addrInput') as HTMLInputElement
          if (input) {
            input.focus()
            input.select()
          }
          break
        }
        case 'reload':
          simplifyEpochRef.current += 1
          invalidateSimplifyStateForTab(currentActiveId)
          try { w?.reload() } catch {}
          break
        case 'hard-reload':
          simplifyEpochRef.current += 1
          invalidateSimplifyStateForTab(currentActiveId)
          try { w?.reloadIgnoringCache() } catch {}
          break
        case 'zoom-in':
          try { if (w) w.setZoomFactor(Math.min(w.getZoomFactor() + 0.1, 3.0)) } catch {}
          break
        case 'zoom-out':
          try { if (w) w.setZoomFactor(Math.max(w.getZoomFactor() - 0.1, 0.25)) } catch {}
          break
        case 'zoom-reset':
          try { if (w) w.setZoomFactor(1.0) } catch {}
          break
        case 'toggle-focus':
          void persistFocusModeRef.current(!focusModeEnabledRef.current)
          break
        case 'toggle-sidebar':
          setSidebarOpen(prev => !prev)
          break
        case 'go-back':
          try { w?.goBack() } catch {}
          break
        case 'go-forward':
          try { w?.goForward() } catch {}
          break
        case 'next-tab': {
          if (currentTabs.length > 1) {
            const idx = currentTabs.findIndex(t => t.id === currentActiveId)
            setActiveId(currentTabs[(idx + 1) % currentTabs.length].id)
          }
          break
        }
        case 'prev-tab': {
          if (currentTabs.length > 1) {
            const idx = currentTabs.findIndex(t => t.id === currentActiveId)
            setActiveId(currentTabs[(idx - 1 + currentTabs.length) % currentTabs.length].id)
          }
          break
        }
        case 'go-tab': {
          const tabIndex = args[0] as number
          if (tabIndex === -1 && currentTabs.length > 0) {
            setActiveId(currentTabs[currentTabs.length - 1].id)
          } else if (tabIndex >= 0 && tabIndex < currentTabs.length) {
            setActiveId(currentTabs[tabIndex].id)
          }
          break
        }
      }
    })
  }, [])

  const recentHistory = useMemo(() => {
    const all = Object.values(historyMapRef.current).flat()
    const unique = [...new Set(all)].filter(url => 
      url && 
      !url.startsWith('about:') && 
      !url.includes('duckduckgo.com/?q=') && 
      !url.includes('google.com/search')
    )
    return unique.slice(-30)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabUrlsKey])

  return (
    <div className="appShell">
      <div className="chrome">
        <TabStrip tabs={tabs} activeId={activeId} setActiveId={setActiveId} onClose={(id) => closeTab(id)} onNewTab={newTab} />
        <TopBar
          navUrl={navUrl}
          setNavUrl={setNavUrl}
          onGoUrl={goNavigate}
          onBack={goBack}
          onForward={goForward}
          onReload={reload}
          focusModeEnabled={focusModeEnabled}
          setFocusModeEnabled={(v) => {
            void persistFocusMode(typeof v === 'function' ? v(focusModeEnabled) : v)
          }}
          simplifyBusy={simplifyBusy}
        />
        <WebviewHost
          recentHistory={recentHistory}
          tabs={tabs}
          activeId={activeId}
          setWebviewRef={(id, el) => setWebviewRef(id, el)}
          onNavigate={(url) => {
            const normalized = normalizeUrl(url)
            setNavUrl(normalized)
            let favicon = ''
            try {
              const host = new URL(normalized).hostname
              if (host) favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`
            } catch { }
            setTabs(prev => prev.map(t => t.id === activeId ? { ...t, url: normalized, src: normalized, title: '', favicon: favicon || t.favicon } : t))
          }}
        />
      </div>
      <aside
        className="chatDrawer"
        id="cclear-chat-drawer"
        data-open={sidebarOpen ? 'true' : 'false'}
      >
        <div className="chatDrawerInner">
          <button
            type="button"
            className="chatEdgeToggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Collapse assistant' : 'Expand assistant'}
            aria-expanded={sidebarOpen}
            aria-controls="cclear-chat-panel"
          >
            {sidebarOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 18l6-6-6-6" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 18l-6-6 6-6" />
              </svg>
            )}
          </button>
          <div className="chatPanel" id="cclear-chat-panel" aria-hidden={!sidebarOpen}>
            <WhyAmIHereBox summaries={tabContexts[activeId] || []} isLoading={contextLoading[activeId] || false} />
            <ChatSidebar
              aiHealthy={aiHealthy}
              aiHint="Runs fully local on your Mac when Ollama is installed."
              messages={chatMsgs}
              input={chatInput}
              setInput={setChatInput}
              sending={chatSending}
              thinking={chatThink}
              draft={chatDraft}
              onSend={(o) => void handleSendChat(o)}
            />
          </div>
        </div>
      </aside>
    </div>
  )
}
