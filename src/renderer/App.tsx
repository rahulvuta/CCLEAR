/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WebviewTag } from 'electron'
import { ChatSidebar } from './components/ChatSidebar'
import { TabStrip, type UITab } from './components/TabStrip'
import { TopBar } from './components/TopBar'
import { WebviewHost } from './components/WebviewHost'
import type { ChatMessage, PageBlockForSimplify, TabContextItem } from '../shared/types'
import type { ApplySummaryItem } from '../focus/simplify'
import {
  buildApplySummariesScript,
  buildRestoreSummariesScript,
  getExtractChunksScript,
  pageBlocksToSimplifyChunks
} from '../focus/simplify'
import { getInjectReadingAssistScript, getSetFocusVisualScript } from '../focus/injector'

const EXTRACT_MIN_CHARS = 90
/** Top-N passages per page (fewer keeps total time reliably under ~5s with local model). */
const SIMPLIFY_MAX_BLOCKS = 3
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
  const [tabs, setTabs] = useState<UITab[]>([{ id: firstId, url: 'about:blank', title: 'Home' }])
  const [activeId, setActiveId] = useState(firstId)
  const [navUrl, setNavUrl] = useState('about:blank')
  const [focusModeEnabled, setFocusModeEnabled] = useState(false)
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

  const injectAssist = useCallback(async (w: WebviewTag, focusVisual: boolean) => {
    try {
      await w.executeJavaScript(getInjectReadingAssistScript(), true)
      await w.executeJavaScript(getSetFocusVisualScript(focusVisual), true)
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

    const cacheKey = simplifyCacheKey(tabId, trimmed)
    const already = (await w.executeJavaScript(
      `document.querySelector('[data-adhd-simplified="true"]') != null`,
      true
    )) as boolean
    if (already) return

    const cached = simplifyApplyCacheRef.current.get(cacheKey)
    if (cached && cached.length > 0) {
      await w.executeJavaScript(buildApplySummariesScript(cached), true)
      return
    }

    const tryExtract = async () =>
      (await w.executeJavaScript(getExtractChunksScript(EXTRACT_MIN_CHARS), true)) as PageBlockForSimplify[]

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

    try {
      const res = await window.adhdBrowser.ai.simplifyChunks(chunks)
      const out = res.map((r) => ({
        ...r,
        original: origById.get(r.id),
        summary: r.summary || (origById.get(r.id) ?? '').slice(0, 200),
        keyPoints: r.keyPoints ?? [],
        tagName: tagById.get(r.id)
      }))
      await w.executeJavaScript(buildApplySummariesScript(out), true)
      simplifyApplyCacheRef.current.set(cacheKey, out)
    } catch (e) {
      console.warn('[adhd] focus simplify:', e instanceof Error ? e.message : e)
    }
  }, [])

  /** Enqueue so we never drop a run when Ollama or another tab is busy */
  const enqueueFocusAutoSimplify = useCallback((tabId: string, pageUrl: string) => {
    simplifyChainRef.current = simplifyChainRef.current
      .then(() => runFocusAutoSimplifyImpl(tabId, pageUrl))
      .catch((e) => console.warn('[adhd] focus simplify chain:', e))
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
    void window.adhdBrowser.prefs
      .get()
      .then((p) => {
        if (!cancelled) setFocusModeEnabled(p.focusModeEnabled)
      })
      .catch(() => {})
    void window.adhdBrowser.ai
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
    await window.adhdBrowser.prefs.set({ focusModeEnabled: next })
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

      const updUrlFromNav = (_e: any, url: string) => {
        invalidateSimplifyLatestRef.current(id)
        setTabs((prev) =>
          prev.map((t) => (t.id === id ? { ...t, url: url || t.url } : t))
        )
        if (activeIdRef.current === id) setNavUrl(url || '')
      }

      const onTitle = (_e: any, title: string) => {
        setTabs((prev) =>
          prev.map((t) => (t.id === id ? { ...t, title: title || t.title } : t))
        )
      }

      const onLoad = async () => {
        await injectAssist(w, focusModeEnabledRef.current)
        const tid = id
        if (!focusModeEnabledRef.current || activeIdRef.current !== tid) return
        const pageUrl =
          tabsRef.current.find((x) => x.id === tid)?.url ?? 'about:blank'
        runFocusAutoSimplifyRef.current(tid, pageUrl)
      }

      w.addEventListener('did-navigate', updUrlFromNav as any)
      w.addEventListener('did-navigate-in-page', updUrlFromNav as any)
      w.addEventListener('did-finish-load', onLoad)
      w.addEventListener('page-title-updated', onTitle as any)
    },
    [injectAssist]
  )

  useEffect(() => {
    const w = webviewRefs.current[activeId]
    if (!w) return
    void injectAssist(w, focusModeEnabled).catch(() => {})
  }, [focusModeEnabled, activeId, injectAssist])

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
    setTabs((prev) =>
      prev.map((t) => (t.id === activeId ? { ...t, url: nextUrl, title: t.title } : t))
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
    setTabs((t) => [...t, { id, url: 'about:blank', title: 'New tab' }])
    setActiveId(id)
  }

  function closeTab(idToClose: string) {
    if (tabs.length <= 1) return
    const idx = tabs.findIndex((t) => t.id === idToClose)
    if (idx < 0) return

    delete webviewRefs.current[idToClose]
    invalidateSimplifyStateForTab(idToClose)

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
      const assistant = await window.adhdBrowser.ai.chat(nextMsgs.slice(-16), tabContextItems, activeId)
      setChatMsgs([...nextMsgs, { role: 'assistant', content: assistant }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setChatMsgs([...nextMsgs, { role: 'assistant', content: `Assistant error:\n${msg}` }])
    } finally {
      setChatSending(false)
    }
  }

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
        />
        <WebviewHost tabs={tabs} activeId={activeId} setWebviewRef={(id, el) => setWebviewRef(id, el)} />
      </div>
      <aside
        className="chatDrawer"
        id="adhd-chat-drawer"
        data-open={sidebarOpen ? 'true' : 'false'}
      >
        <div className="chatDrawerInner">
          <button
            type="button"
            className="chatEdgeToggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Collapse assistant' : 'Expand assistant'}
            aria-expanded={sidebarOpen}
            aria-controls="adhd-chat-panel"
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
          <div className="chatPanel" id="adhd-chat-panel" aria-hidden={!sidebarOpen}>
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
