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
  getExtractChunksScript,
  pageBlocksToSimplifyChunks
} from '../focus/simplify'
import { getInjectReadingAssistScript, getSetFocusVisualScript } from '../focus/injector'

const EXTRACT_MIN_CHARS = 90
/** Top-N passages per page (fewer keeps total time reliably under ~5s with local model). */
const SIMPLIFY_MAX_BLOCKS = 100
/** Immediate schedule after focus/nav */
const FOCUS_SIMPLIFY_DEBOUNCE_MS = 80
/** Re-scan when article text is still hydrating */
const EXTRACT_RETRY_DELAYS_MS = [120, 400, 900] as const

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
  return `https://duckduckgo.com/?q=${q}`
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
  const [tabs, setTabs] = useState<UITab[]>([{ id: firstId, url: 'about:blank', title: '' }])
  const [activeId, setActiveId] = useState(firstId)
  const [navUrl, setNavUrl] = useState('about:blank')
  const [focusModeEnabled, setFocusModeEnabled] = useState(false)
  const [simplifyBusy, setSimplifyBusy] = useState(false)
  
  const [tabContexts, setTabContexts] = useState<Record<string, TabContextSummary[]>>({})
  const [contextLoading, setContextLoading] = useState<Record<string, boolean>>({})
  const historyMapRef = useRef<Record<string, string[]>>({})

  /** Last simplified payloads per `${tabId}|url` for instant re-apply */
  const simplifyApplyCacheRef = useRef<Map<string, ApplySummaryItem[]>>(new Map())
  /** Serial queue so no request is dropped while another tab or navigation is in flight */
  const simplifyChainRef = useRef<Promise<void>>(Promise.resolve())
  const runFocusAutoSimplifyRef = useRef<(tabId: string, pageUrl: string) => void>(() => {})

  function simplifyCacheKey(tabId: string, url: string): string {
    return `${tabId}|${url || 'about:blank'}`
  }

  function invalidateSimplifyStateForTab(tabId: string) {
    for (const k of [...simplifyApplyCacheRef.current.keys()]) {
      if (k.startsWith(`${tabId}|`)) simplifyApplyCacheRef.current.delete(k)
    }
  }

  const invalidateSimplifyLatestRef = useRef(invalidateSimplifyStateForTab)
  invalidateSimplifyLatestRef.current = invalidateSimplifyStateForTab

  const [chatInput, setChatInput] = useState('')
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([])
  const [chatSending, setChatSending] = useState(false)
  const [aiHealthy, setAiHealthy] = useState<boolean | null>(null)
  const webviewRefs = useRef<Record<string, WebviewTag | null>>({})
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs

  const setupOnce = useRef(new WeakSet<WebviewTag>())
  const focusModeEnabledRef = useRef(focusModeEnabled)
  const activeIdRef = useRef(activeId)
  const focusSimplifyScheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    if (!focusModeEnabledRef.current) return
    const w = webviewRefs.current[tabId]
    if (!w) return
    const trimmed = pageUrl.trim()
    if (/^about:/i.test(trimmed)) return

    await waitForWebviewQuiet(w)

    let isSearch = false
    try {
      const host = new URL(trimmed).hostname
      isSearch = /google\.|duckduckgo\.|bing\.|yahoo\.|brave\.|kagi\./i.test(host)
    } catch {
      isSearch = false
    }
    const cacheKey = simplifyCacheKey(tabId, trimmed)
    const already = (await w.executeJavaScript(
      `document.querySelector('[data-cclear-simplified]') != null`,
      true
    )) as boolean
    if (already) return

    const cached = simplifyApplyCacheRef.current.get(cacheKey)
    if (cached && cached.length > 0) {
      const appliedCount = (await w.executeJavaScript(buildApplySummariesScript(cached, isSearch), true)) as number
      if (appliedCount > 0) {
        return
      }
    }

    const tryExtract = async () =>
      (await w.executeJavaScript(getExtractChunksScript(EXTRACT_MIN_CHARS, isSearch), true)) as PageBlockForSimplify[]

    let blocks = await tryExtract()
    if (!blocks.length) {
      for (const ms of EXTRACT_RETRY_DELAYS_MS) {
        if (!focusModeEnabledRef.current) return
        await new Promise<void>((r) => setTimeout(r, ms))
        try {
          if (typeof w.isLoading === 'function' && w.isLoading()) {
            await waitForWebviewQuiet(w)
          }
        } catch {
          //
        }
        blocks = await tryExtract()
        if (blocks.length) break
      }
    }
    if (!blocks.length) return

    const list = [...blocks]
      .sort((a, b) => b.text.length - a.text.length)
      .slice(0, SIMPLIFY_MAX_BLOCKS)

    const chunks = pageBlocksToSimplifyChunks(list)
    const origById = new Map(list.map((b) => [b.id, b.text]))
    const tagById = new Map(list.map((b) => [b.id, b.tagName]))

    setSimplifyBusy(true)
    try {
      const res = await window.cclearBrowser.ai.simplifyChunks(chunks)
      const out = res.map((r) => ({
        ...r,
        original: origById.get(r.id),
        summary: r.summary || (origById.get(r.id) ?? '').slice(0, 200),
        keyPoints: r.keyPoints ?? [],
        tagName: tagById.get(r.id)
      }))
      await w.executeJavaScript(buildApplySummariesScript(out, isSearch), true)
      simplifyApplyCacheRef.current.set(cacheKey, out)
    } catch (e) {
      console.warn('[cclear] focus simplify:', e instanceof Error ? e.message : e)
    } finally {
      setSimplifyBusy(false)
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
    await window.cclearBrowser.prefs.set({ focusModeEnabled: next })
    if (!next) {
      await restoreSimplifiedAcrossAllTabs()
    }
  }, [])

  useEffect(() => {
    focusSimplifyScheduleRef.current && clearTimeout(focusSimplifyScheduleRef.current)
    focusSimplifyScheduleRef.current = null

    if (!focusModeEnabled) return

    focusSimplifyScheduleRef.current = setTimeout(() => {
      focusSimplifyScheduleRef.current = null
      const tid = activeIdRef.current
      const url = tabsRef.current.find((x) => x.id === tid)?.url ?? 'about:blank'
      enqueueFocusAutoSimplify(tid, url)
    }, FOCUS_SIMPLIFY_DEBOUNCE_MS)

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

      const updUrlFromNav = (_e: any, url: string) => {
        invalidateSimplifyLatestRef.current(id)
        
        const effectiveUrl = url || 'about:blank'
        const currentReactUrl = tabsRef.current.find((t) => t.id === id)?.url

        // Ignore delayed about:blank commits if we've already instructed the tab to go elsewhere
        if (effectiveUrl === 'about:blank' && latestIntendedUrl && latestIntendedUrl !== 'about:blank') {
          return
        }
        
        let favicon = ''
        if (effectiveUrl !== 'about:blank') {
          try {
            const host = new URL(effectiveUrl).hostname
            if (host) favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`
          } catch { }
        }

        setTabs((prev) =>
          prev.map((t) => (t.id === id ? { ...t, url: effectiveUrl, favicon: favicon || t.favicon } : t))
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
    
    let favicon = ''
    try {
      const host = new URL(nextUrl).hostname
      if (host) favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`
    } catch { }

    setTabs((prev) =>
      prev.map((t) => (t.id === activeId ? { ...t, url: nextUrl, title: t.title, favicon: favicon || t.favicon } : t))
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
    try {
      webviewRefs.current[activeId]?.reload()
    } catch {
      //
    }
  }

  function newTab() {
    const id = String(crypto.randomUUID())
    setTabs((t) => [...t, { id, url: 'about:blank', title: '' }])
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
    const nextMsgs: ChatMessage[] = [...chatMsgs, { role: 'user', content: txt }]
    setChatMsgs(nextMsgs)
    if (!override) setChatInput('')
    try {
      const assistant = await window.cclearBrowser.ai.chat(nextMsgs.slice(-16), tabContextItems, activeId)
      
      // Execute AI actions
      if (assistant.includes('[GOTO:')) {
        const m = assistant.match(/\[GOTO:\s*([^\]]+)\]/i)
        if (m) {
          const url = normalizeUrl(m[1])
          const aid = activeIdRef.current
          setNavUrl(url)
          setTabs(prev => prev.map(t => t.id === aid ? { ...t, url, title: '' } : t))
        }
      }
      if (assistant.includes('[NEW_TAB')) {
        const m = assistant.match(/\[NEW_TAB:?\s*([^\]]*)\]/i)
        const url = (m && m[1].trim()) ? normalizeUrl(m[1]) : 'about:blank'
        const id = String(crypto.randomUUID())
        setTabs(t => [...t, { id, url, title: '' }])
        setActiveId(id)
      }
      if (assistant.includes('[BACK]')) goBack()
      if (assistant.includes('[FORWARD]')) goForward()
      if (assistant.includes('[RELOAD]')) reload()

      // Clean display message
      const displayMsg = assistant
        .replace(/\[GOTO:[^\]]+\]/gi, '')
        .replace(/\[NEW_TAB:?[^\]]*\]/gi, '')
        .replace(/\[BACK\]/gi, '')
        .replace(/\[FORWARD\]/gi, '')
        .replace(/\[RELOAD\]/gi, '')
        .trim()

      setChatMsgs([...nextMsgs, { role: 'assistant', content: displayMsg || assistant }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setChatMsgs([...nextMsgs, { role: 'assistant', content: `Assistant error:\n${msg}` }])
    } finally {
      setChatSending(false)
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
    }, 3000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabUrlsKey, tabs.length])

  // Keyboard shortcuts from native menu
  useEffect(() => {
    return window.cclearBrowser.onShortcut((action, ...args) => {
      const currentTabs = tabsRef.current
      const currentActiveId = activeIdRef.current
      const w = webviewRefs.current[currentActiveId]

      switch (action) {
        case 'new-tab': {
          const id = String(crypto.randomUUID())
          setTabs((t) => [...t, { id, url: 'about:blank', title: '' }])
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
          try { w?.reload() } catch {}
          break
        case 'hard-reload':
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
          setFocusModeEnabled(!focusModeEnabledRef.current)
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
            setTabs(prev => prev.map(t => t.id === activeId ? { ...t, url: normalized, title: '', favicon: favicon || t.favicon } : t))
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
              onSend={(o) => void handleSendChat(o)}
            />
          </div>
        </div>
      </aside>
    </div>
  )
}
