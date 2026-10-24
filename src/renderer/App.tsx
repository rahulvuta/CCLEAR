/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WebviewTag } from 'electron'
import { ChatSidebar } from './components/ChatSidebar'
import { TabStrip, type UITab } from './components/TabStrip'
import { GROUP_COLORS, cleanGroupName, loadGroupMap, moveBeforeTab, moveIntoGroup, nextGroupName, type GroupColor, type GroupMap } from './tabGroups'
import { TopBar } from './components/TopBar'
import { WebviewHost } from './components/WebviewHost'
import type { PageBlockForSimplify, TabContextItem, TabContextSummary } from '../shared/types'
import type { ApplySummaryItem } from '../focus/simplify'
import { WhyAmIHereBox } from './components/WhyAmIHereBox'
import { SessionBar } from './components/SessionBar'
import { ParkingPanel } from './components/ParkingPanel'
import { DriftNudge } from './components/DriftNudge'
import { ResumeToast } from './components/ResumeToast'
import { ReadingPanel } from './components/ReadingPanel'
import { useReading } from './hooks/useReading'
import { SettingsPanel } from './components/SettingsPanel'
import { FrictionGate } from './components/FrictionGate'
import { FindBar } from './components/FindBar'
import { SessionRecap } from './components/SessionRecap'
import { TabDiet } from './components/TabDiet'
import { buildRecap, type Recap } from '../session/recap'
import { getApplySelectionScript, getCaptureSelectionScript, getRestoreSelectionScript } from '../focus/selection'
import { shouldSimplifySentence } from '../ai/sentenceSimplify'
import { CommandPalette } from './components/CommandPalette'
import type { Command } from '../shared/palette'
import { useAssistant } from './hooks/useAssistant'
import { useSession } from './hooks/useSession'
import { useDrift } from './hooks/useDrift'
import { progressKey } from '../session/store'
import { describeProgress, getProgressProbeScript, getScrollToRatioScript, worthResuming } from '../session/progress'
import type { ParkedItem, ReadingProgress } from '../shared/session'
import {
  buildApplySummariesScript,
  buildRestoreSummariesScript,
  focusSimplifyCacheKey,
  getExtractChunksScript,
  pageBlocksToSimplifyChunks,
  sameFocusSimplifyPage
} from '../focus/simplify'
import { selectBlocksForSimplify } from '../focus/blockFilters'
import { viewportFirst } from '../focus/order'
import { getInjectReadingAssistScript, getSetFocusVisualScript } from '../focus/injector'
import { getManualMarkScript } from '../focus/manualMarks'
import { markColor, type MarkColor } from '../shared/markColors'

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
  const freshWindow = useMemo(() => new URLSearchParams(window.location.search).has('newWindow'), [])
  const firstId = useMemo(() => String(crypto.randomUUID()), [])
  const [tabs, setTabs] = useState<UITab[]>([{ id: firstId, url: 'about:blank', src: 'about:blank', title: '' }])
  const [activeId, setActiveId] = useState(firstId)
  const [groups, setGroups] = useState<GroupMap>(() => {
    try { return loadGroupMap(localStorage.getItem('cclear.tabGroups.v1')) } catch { return {} }
  })
  const [groupingBusy, setGroupingBusy] = useState(false)
  const closedTabsRef = useRef<Array<{ tab: UITab; index: number }>>([])
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
  const parkTabRef = useRef<(tabId: string) => void>(() => {})
  const hasGoalRef = useRef(false)

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

  const aiHealthyRef = useRef(false)
  const [aiHealthy, setAiHealthy] = useState<boolean | null>(null)
  const webviewRefs = useRef<Record<string, WebviewTag | null>>({})
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs

  useEffect(() => {
    try { localStorage.setItem('cclear.tabGroups.v1', JSON.stringify(groups)) } catch { /* */ }
  }, [groups])

  const setupOnce = useRef(new WeakSet<WebviewTag>())
  const focusModeEnabledRef = useRef(focusModeEnabled)
  const activeIdRef = useRef(activeId)
  const focusSimplifyScheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastInferredRef = useRef<Map<string, string>>(new Map())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  focusModeEnabledRef.current = focusModeEnabled
  activeIdRef.current = activeId

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0]
  const isNewTab = !activeTab?.url || activeTab.url === 'about:blank'

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
      await w.executeJavaScript(getInjectReadingAssistScript(markColor(localStorage.getItem('cclear.highlightColor'))), true)
    } catch {
      //
    }
  }, [])

  useEffect(() => {
    const update = () => { for (const w of Object.values(webviewRefs.current)) if (w) void injectAssist(w) }
    window.addEventListener('cclear:highlight-color', update)
    return () => window.removeEventListener('cclear:highlight-color', update)
  }, [injectAssist])

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
    const byId = new Map(list.map((b) => [b.id, b]))
    const scrollMetrics = async () => {
      try {
        const m = JSON.parse(String(await w.executeJavaScript('JSON.stringify({ y: window.scrollY, h: window.innerHeight })', true)))
        return { y: Number(m.y) || 0, h: Number(m.h) || 800 }
      } catch {
        return { y: 0, h: 800 }
      }
    }

    try {
      const out: ApplySummaryItem[] = []
      // Lazy, viewport-first: simplify what is on screen and about two screens ahead, then wait for the reader
      // to scroll. This keeps the model idle on long pages instead of rewriting text nobody has reached yet.
      let remaining = [...list]
      let first = true
      while (remaining.length) {
        if (!stillCurrent()) return
        const m = await scrollMetrics()
        const ordered = viewportFirst(remaining, m.y, m.h)
        const nearest = ordered[0]
        const tooFar = typeof nearest.y === 'number' && (nearest.y > m.y + m.h * 2.5 || nearest.y < m.y - m.h * 1.2)
        if (tooFar) {
          const idle = document.hidden || !document.hasFocus()
          await new Promise<void>((r) => setTimeout(r, idle ? 4000 : 1500))
          continue
        }
        // Small first batch so the first visible paragraphs change quickly; gentler batches afterwards.
        const size = first ? 2 : 3
        first = false
        const picked = ordered.slice(0, size)
        remaining = remaining.filter((b) => !picked.some((p) => p.id === b.id))

        setSimplifyBusy(true)
        let res: Awaited<ReturnType<typeof window.cclearBrowser.ai.simplifyChunks>>
        try {
          res = await window.cclearBrowser.ai.simplifyChunks(pageBlocksToSimplifyChunks(picked))
        } finally {
          if (epoch === simplifyEpochRef.current) setSimplifyBusy(false)
        }
        if (!stillCurrent()) return
        const batch = res.map((r) => ({
          ...r,
          original: byId.get(r.id)?.text,
          summary: r.summary || (byId.get(r.id)?.text ?? ''),
          highlightPhrases: r.highlightPhrases ?? [],
          termEmphasis: r.termEmphasis ?? [],
          tagName: byId.get(r.id)?.tagName
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
        // A short breather between batches so the GPU is not pinned for the whole page.
        await new Promise<void>((r) => setTimeout(r, 400))
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
        if (!cancelled) {
          setFocusModeEnabled(p.focusModeEnabled)
          setEco(p.eco ?? true)
        }
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
      reading.setShowingOriginal(false)
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

        setTabs((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, url: effectiveUrl, favicon: '' } : t
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
        await applyReadingRef.current(w)
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
        
        // The goal bar already says why you are here; only guess when there is no goal.
        if (pageUrl && !pageUrl.startsWith('about:') && !hasGoalRef.current) {
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
      w.addEventListener('found-in-page', ((e: any) => {
        const r = e.result
        if (!r) return
        setFindActive(r.activeMatchOrdinal ?? 0)
        setFindCount(r.matches ?? 0)
      }) as any)
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
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeId
          ? { ...t, url: nextUrl, src: nextUrl, title: t.title, favicon: '' }
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

  function closeTabs(ids: string[]) {
    const current = tabsRef.current
    const closing = current.map((tab, index) => ({ tab, index })).filter(({ tab }) => ids.includes(tab.id))
    if (!closing.length || (current.length === 1 && current[0].url === 'about:blank')) return
    closedTabsRef.current = [...closedTabsRef.current, ...closing.filter(({ tab }) => tab.url !== 'about:blank')].slice(-25)
    for (const { tab } of closing) {
      delete webviewRefs.current[tab.id]
      delete historyMapRef.current[tab.id]
      invalidateSimplifyStateForTab(tab.id)
    }
    setTabContexts((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.includes(id))))
    setContextLoading((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.includes(id))))
    const remaining = current.filter((tab) => !ids.includes(tab.id))
    if (!remaining.length) {
      const id = String(crypto.randomUUID())
      setTabs([{ id, url: 'about:blank', src: 'about:blank', title: '' }])
      setActiveId(id)
      return
    }
    setTabs(remaining)
    if (ids.includes(activeIdRef.current)) {
      const firstIndex = closing[0].index
      const next = remaining[Math.min(firstIndex, remaining.length - 1)]
      activateTab(next.id, next.group)
    }
  }

  function closeTab(id: string) { closeTabs([id]) }

  function reopenClosedTab() {
    const entry = closedTabsRef.current.pop()
    if (!entry) return
    const current = tabsRef.current
    const restored = { ...entry.tab, id: String(crypto.randomUUID()), src: entry.tab.url }
    const next = current.length === 1 && current[0].url === 'about:blank' ? [] : [...current]
    next.splice(Math.min(entry.index, next.length), 0, restored)
    setTabs(next)
    activateTab(restored.id, restored.group)
  }

  function activateTab(id: string, group?: string) {
    const name = group ?? tabsRef.current.find((tab) => tab.id === id)?.group
    if (name && groups[name]?.collapsed) setGroups((previous) => ({ ...previous, [name]: { ...previous[name], collapsed: false } }))
    setActiveId(id)
  }

  function createGroup(id: string) {
    const name = nextGroupName([...Object.keys(groups), ...tabsRef.current.map((tab) => tab.group || '')])
    setGroups((previous) => ({ ...previous, [name]: { color: GROUP_COLORS[Object.keys(previous).length % GROUP_COLORS.length], collapsed: false } }))
    setTabs((previous) => previous.map((tab) => tab.id === id ? { ...tab, group: name } : tab))
  }

  function moveToGroup(id: string, name: string) {
    setGroups((previous) => previous[name] ? { ...previous, [name]: { ...previous[name], collapsed: false } } : { ...previous, [name]: { color: GROUP_COLORS[Object.keys(previous).length % GROUP_COLORS.length], collapsed: false } })
    setTabs((previous) => moveIntoGroup(previous, id, name))
  }

  function removeFromGroup(id: string) {
    setTabs((previous) => {
      const moving = previous.find((tab) => tab.id === id)
      if (!moving?.group) return previous
      const rest = previous.filter((tab) => tab.id !== id)
      let last = -1
      for (let index = 0; index < rest.length; index++) if (rest[index].group === moving.group) last = index
      rest.splice(last + 1, 0, { ...moving, group: undefined })
      return rest
    })
  }

  function renameGroup(name: string, raw: string) {
    const next = cleanGroupName(raw)
    if (!next || next === name) return
    if (tabsRef.current.some((tab) => tab.group?.toLocaleLowerCase() === next.toLocaleLowerCase())) {
      notify('A group with that name already exists.')
      return
    }
    setTabs((previous) => previous.map((tab) => tab.group === name ? { ...tab, group: next } : tab))
    setGroups((previous) => {
      const copy = { ...previous }
      const meta = copy[name] || { color: 'blue' as GroupColor, collapsed: false }
      delete copy[name]
      copy[next] = meta
      return copy
    })
  }

  function ungroup(name: string) {
    setTabs((previous) => previous.map((tab) => tab.group === name ? { ...tab, group: undefined } : tab))
    setGroups((previous) => { const copy = { ...previous }; delete copy[name]; return copy })
  }

  function closeGroup(name: string) {
    closeTabs(tabsRef.current.filter((tab) => tab.group === name).map((tab) => tab.id))
  }

  // First run: if the local AI is not ready, show the setup panel once instead of failing quietly.
  useEffect(() => {
    if (aiHealthy !== false) return
    try {
      if (localStorage.getItem('cclear.setupShown') === '1') return
      localStorage.setItem('cclear.setupShown', '1')
    } catch {
      //
    }
    setSettingsOpen(true)
  }, [aiHealthy])

  // ── Session, assistant and drift ────────────────────────────────────────────
  const session = useSession()
  hasGoalRef.current = Boolean(session.state.current)
  const [stepsLoading, setStepsLoading] = useState(false)
  const [parkingOpen, setParkingOpen] = useState(false)
  const [readingOpen, setReadingOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteMode, setPaletteMode] = useState<'all' | 'tabs'>('all')
  const [recap, setRecap] = useState<Recap | null>(null)
  const [dietDismissedUntil, setDietDismissedUntil] = useState(0)
  const [calmNote, setCalmNote] = useState('')
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findActive, setFindActive] = useState(0)
  const [findCount, setFindCount] = useState(0)
  const shortcutExtraRef = useRef<(action: string, args: unknown[]) => void>(() => {})
  const [blockerEnabled, setBlockerEnabled] = useState(true)
  const [eco, setEco] = useState(true)
  const [blockedCount, setBlockedCount] = useState(0)
  const [friction, setFriction] = useState<{ tabId: string; host: string } | null>(null)
  const frictionPassed = useRef(new Map<string, number>())
  const reading = useReading({ webviewRefs, activeIdRef })
  const applyReadingRef = useRef(reading.applyTo)
  applyReadingRef.current = reading.applyTo
  const [resumeOffer, setResumeOffer] = useState<{ tabId: string; progress: ReadingProgress } | null>(null)

  function navigateActive(url: string) {
    const aid = activeIdRef.current
    setNavUrl(url)
    setTabs((prev) => prev.map((t) => (t.id === aid ? { ...t, url, src: url, title: '', favicon: '' } : t)))
  }

  function openTabAt(url: string) {
    const id = String(crypto.randomUUID())
    setTabs((t) => [...t, { id, url, src: url, title: '' }])
    setActiveId(id)
  }

  const getTabText = useCallback(async (tabId: string) => {
    const w = webviewRefs.current[tabId]
    if (!w) return ''
    try {
      return String(
        await w.executeJavaScript(
          `(document.querySelector('article, main, [role="main"]') || document.body).innerText.replace(/\\s+/g,' ').trim().slice(0,800)`,
          true
        )
      )
    } catch {
      return ''
    }
  }, [])

  const drift = useDrift({
    tabs,
    activeId,
    session: session.state.current,
    assistLevel: session.state.assistLevel,
    getText: getTabText
  })

  function parkTab(tabId: string, note?: string) {
    const tab = tabsRef.current.find((t) => t.id === tabId)
    if (!tab || !tab.url || tab.url === 'about:blank') return
    const prog = session.state.progress[progressKey(tab.url)]
    session.dispatch({
      type: 'park',
      item: {
        id: crypto.randomUUID(),
        kind: 'tab',
        title: tab.title || tab.url,
        url: tab.url,
        favicon: tab.favicon,
        note: note && note !== 'Parked from chat' ? note : undefined,
        createdAt: Date.now(),
        scrollRatio: prog?.ratio
      }
    })
    if (tabsRef.current.length <= 1) {
      navigateActive('about:blank')
    } else {
      closeTab(tabId)
    }
  }

  parkTabRef.current = (id) => parkTab(id)

  function restoreParked(item: ParkedItem) {
    if (!item.url) return
    openTabAt(item.url)
    session.dispatch({ type: 'unpark', id: item.id })
    setParkingOpen(false)
  }

  function backToTask() {
    const target = tabsRef.current.find((t) => t.id !== activeIdRef.current && drift.verdicts[t.id]?.verdict === 'on' && t.url !== 'about:blank')
    if (target) setActiveId(target.id)
    else openTabAt('about:blank')
    drift.dismissNudge()
  }

  const assistant = useAssistant({
    webviewRefs,
    tabsRef,
    activeIdRef,
    tabContextItems,
    goal: session.state.current?.goal,
    normalizeUrl,
    navigateActive,
    openTab: openTabAt,
    goBack,
    goForward,
    reload,
    injectAssist,
    parkActiveTab: (note) => parkTab(activeIdRef.current, note),
    switchTab: setActiveId
  })

  useEffect(() => {
    const api = window.cclearBrowser.ai
    if (!api.onChatProgress) return
    return api.onChatProgress((payload) => {
      assistant.setThink(payload.think || '')
      assistant.setDraft(payload.content || '')
    })
  }, [assistant.setThink, assistant.setDraft])

  // Restore the previous session's tabs once, right after the saved state loads.
  const restoredOnce = useRef(false)
  useEffect(() => {
    if (restoredOnce.current || !session.ready) return
    restoredOnce.current = true
    if (freshWindow) return
    const saved = session.restored?.tabs ?? []
    if (!saved.length) return
    // If the user already started browsing before the saved state finished loading, do not overwrite their tabs.
    const untouched = tabsRef.current.length === 1 && (!tabsRef.current[0].url || tabsRef.current[0].url === 'about:blank')
    if (!untouched) return
    const next = saved.map((t) => ({ id: String(crypto.randomUUID()), url: t.url, src: t.url, title: t.title, favicon: t.favicon, group: t.group }))
    setTabs(next)
    const activeIdx = Math.max(0, saved.findIndex((t) => t.active))
    setActiveId(next[activeIdx].id)
  }, [session.ready, session.restored, freshWindow])

  // Marks the moment the saved session has loaded and its tabs were restored, so automated checks and demos
  // know it is safe to start interacting (earlier input could be overwritten by the restore).
  useEffect(() => {
    if (!session.ready) return
    const t = setTimeout(() => document.documentElement.setAttribute('data-cclear-ready', '1'), 400)
    return () => clearTimeout(t)
  }, [session.ready])

  // Persist the open tabs so a restart (or crash) returns to the same place.
  const tabsSnapshot = useMemo(
    () => JSON.stringify(tabs.filter((t) => t.url && t.url !== 'about:blank').map((t) => ({ url: t.url, title: t.title, favicon: t.favicon, group: t.group, active: t.id === activeId }))),
    [tabs, activeId]
  )
  useEffect(() => {
    if (!session.ready || !restoredOnce.current || freshWindow) return
    session.dispatch({ type: 'saveTabs', tabs: JSON.parse(tabsSnapshot) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsSnapshot, session.ready, freshWindow])

  // Remember how far the user got on the active page.
  const recordProgress = useCallback(async (tabId: string) => {
    const w = webviewRefs.current[tabId]
    const tab = tabsRef.current.find((t) => t.id === tabId)
    if (!w || !tab || !tab.url || tab.url === 'about:blank') return
    try {
      const raw = await w.executeJavaScript(getProgressProbeScript(), true)
      const p = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (!p?.tall) return
      session.dispatch({
        type: 'progress',
        progress: { url: progressKey(tab.url), title: tab.title, ratio: Number(p.ratio) || 0, heading: p.heading || undefined, at: Date.now() }
      })
    } catch {
      //
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void recordProgress(activeIdRef.current)
    }, 15000)
    return () => clearInterval(timer)
  }, [recordProgress])

  // Leaving a tab (or switching away) saves its position first.
  const prevActive = useRef(activeId)
  useEffect(() => {
    if (prevActive.current !== activeId) void recordProgress(prevActive.current)
    prevActive.current = activeId
  }, [activeId, recordProgress])

  // Offer to resume when a page with saved progress finishes loading.
  const offeredFor = useRef(new Set<string>())
  useEffect(() => {
    const tab = tabs.find((t) => t.id === activeId)
    if (!tab || !tab.url || tab.url === 'about:blank') return
    const key = progressKey(tab.url)
    const sig = `${activeId}|${key}`
    if (offeredFor.current.has(sig)) return
    const p = session.state.progress[key]
    if (!worthResuming(p, Date.now())) return
    offeredFor.current.add(sig)
    const timer = setTimeout(() => setResumeOffer({ tabId: activeId, progress: p }), 1800)
    return () => clearTimeout(timer)
  }, [activeId, tabs, session.state.progress])

  // Count of ads/trackers blocked on the active page.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return
      const w = webviewRefs.current[activeIdRef.current]
      try {
        const id = w?.getWebContentsId?.()
        setBlockedCount(id ? await window.cclearBrowser.blocker.count(id) : 0)
      } catch {
        setBlockedCount(0)
      }
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  // Pause sites: a short deliberate delay before a site the user chose to be careful with.
  useEffect(() => {
    const tab = tabs.find((t) => t.id === activeId)
    const host = (() => {
      try {
        return tab ? new URL(tab.url).hostname.replace(/^www\./, '') : ''
      } catch {
        return ''
      }
    })()
    const hit = host && session.state.frictionHosts.some((h) => host === h || host.endsWith(`.${h}`))
    if (!hit) {
      if (friction && friction.tabId === activeId) setFriction(null)
      return
    }
    const passedAt = frictionPassed.current.get(`${activeId}|${host}`)
    if (passedAt && Date.now() - passedAt < 20 * 60_000) return
    if (!friction || friction.tabId !== activeId || friction.host !== host) {
      setFriction({ tabId: activeId, host })
      try { webviewRefs.current[activeId]?.setAudioMuted(true) } catch { /* */ }
    }
  }, [tabs, activeId, session.state.frictionHosts, friction])

  const activeSiteHost = (() => {
    try {
      return new URL(activeTab.url).hostname.replace(/^www\./, '')
    } catch {
      return ''
    }
  })()

  // ── Find in page, command palette, selection actions ───────────────────────
  function runFind(forward: boolean) {
    const w = webviewRefs.current[activeIdRef.current]
    if (!w || !findQuery.trim()) return
    try {
      w.findInPage(findQuery, { forward, findNext: true })
    } catch {
      //
    }
  }
  function openFind() {
    setFindOpen(true)
    const w = webviewRefs.current[activeIdRef.current]
    if (w && findQuery.trim()) {
      try {
        w.findInPage(findQuery)
      } catch {
        //
      }
    }
  }
  function closeFind() {
    setFindOpen(false)
    setFindActive(0)
    setFindCount(0)
    try {
      webviewRefs.current[activeIdRef.current]?.stopFindInPage('clearSelection')
    } catch {
      //
    }
  }
  useEffect(() => {
    // typing in the find box searches live
    const w = webviewRefs.current[activeIdRef.current]
    if (!findOpen || !w) return
    try {
      if (findQuery.trim()) w.findInPage(findQuery)
      else w.stopFindInPage('clearSelection')
    } catch {
      //
    }
  }, [findQuery, findOpen])

  // ── Simplify / restore just the selected text, sentence by sentence ────────
  function notify(text: string, ms = 7000) {
    setNotice(text)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = ms ? setTimeout(() => setNotice(''), ms) : null
  }

  async function simplifySelection() {
    const w = webviewRefs.current[activeIdRef.current]
    if (!w) return
    try {
      const raw = await w.executeJavaScript(getCaptureSelectionScript(), true)
      const cap = raw ? (JSON.parse(String(raw)) as { sentences: Array<{ id: string; text: string }> }) : null
      if (!cap || !cap.sentences.length) return notify('Select some text on the page first.')
      const targets = cap.sentences.filter((x) => shouldSimplifySentence(x.text))
      if (!targets.length) return notify('Those sentences are already short and simple.')
      notify(`Simplifying ${targets.length} sentence${targets.length === 1 ? '' : 's'}…`, 0)
      const res = await window.cclearBrowser.ai.simplifySentences(targets)
      const changed = res.filter((r) => r.changed)
      if (!changed.length) return notify('I could not make those simpler without risking the meaning, so I left them as they are.')
      await w.executeJavaScript(getApplySelectionScript(changed), true)
      notify(`Simplified ${changed.length} sentence${changed.length === 1 ? '' : 's'}. Select them and right-click → “Show original” to undo.`, 9000)
    } catch (e) {
      notify(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Could not simplify the selection.')
    }
  }

  async function restoreSelection() {
    const w = webviewRefs.current[activeIdRef.current]
    if (!w) return
    try {
      const n = Number(await w.executeJavaScript(getRestoreSelectionScript(), true))
      notify(n ? `Restored the original text (${n} ${n === 1 ? 'piece' : 'pieces'}).` : 'Nothing simplified in the selection.')
    } catch {
      notify('Could not restore the selection.')
    }
  }

  async function markSelection(mode: 'highlight' | 'underline' | 'remove', color?: MarkColor) {
    const w = webviewRefs.current[activeIdRef.current]
    if (!w) return
    try {
      await injectAssist(w)
      const result = await w.executeJavaScript(getManualMarkScript(mode, color || markColor(localStorage.getItem('cclear.highlightColor'))), true) as { count: number; reason?: string }
      if (!result.count) return notify(result.reason === 'selection' ? 'Select text on the page first.' : result.reason === 'unsupported' ? 'This page does not support text marks.' : 'No marks found in that selection.')
      notify(mode === 'remove' ? 'Removed marks from the selection.' : mode === 'underline' ? 'Underlined the selection.' : `Highlighted the selection in ${color || markColor(localStorage.getItem('cclear.highlightColor'))}.`, 3500)
    } catch { notify('Could not mark that selection.') }
  }

  shortcutExtraRef.current = (action, args) => {
    const arg = String(args[0] ?? '')
    switch (action) {
      case 'close-tab': return closeTab(activeIdRef.current)
      case 'reopen-tab': return reopenClosedTab()
      case 'next-tab': {
        const current = tabsRef.current
        const index = current.findIndex((tab) => tab.id === activeIdRef.current)
        if (current.length > 1) activateTab(current[(index + 1) % current.length].id)
        return
      }
      case 'prev-tab': {
        const current = tabsRef.current
        const index = current.findIndex((tab) => tab.id === activeIdRef.current)
        if (current.length > 1) activateTab(current[(index - 1 + current.length) % current.length].id)
        return
      }
      case 'go-tab': {
        const current = tabsRef.current
        const index = Number(args[0])
        const target = index === -1 ? current[current.length - 1] : current[index]
        if (target) activateTab(target.id)
        return
      }
      case 'move-tab-left':
      case 'move-tab-right': {
        const current = tabsRef.current
        const index = current.findIndex((tab) => tab.id === activeIdRef.current)
        const other = current[index + (action === 'move-tab-left' ? -1 : 1)]
        if (!other) return
        setTabs((previous) => {
          const copy = [...previous]
          const from = copy.findIndex((tab) => tab.id === activeIdRef.current)
          const to = copy.findIndex((tab) => tab.id === other.id)
          const [moving] = copy.splice(from, 1)
          copy.splice(to, 0, { ...moving, group: other.group })
          return copy
        })
        return
      }
      case 'find': return openFind()
      case 'find-next': return findOpen ? runFind(true) : openFind()
      case 'find-prev': return findOpen ? runFind(false) : openFind()
      case 'palette': setPaletteMode('all'); return setPaletteOpen(true)
      case 'tab-search': setPaletteMode('tabs'); return setPaletteOpen(true)
      case 'home': return navigateActive('about:blank')
      case 'print': return void webviewRefs.current[activeIdRef.current]?.print()
      case 'devtools': return void webviewRefs.current[activeIdRef.current]?.openDevTools()
      case 'stop-loading': return void webviewRefs.current[activeIdRef.current]?.stop()
      case 'open-url-new-tab': return openTabAt(arg)
      case 'reader': return void reading.openReader()
      case 'calm': return calmView()
      case 'selection-simplify': return void simplifySelection()
      case 'selection-restore': return void restoreSelection()
      case 'selection-highlight': return void markSelection('highlight', arg ? markColor(arg) : undefined)
      case 'selection-underline': return void markSelection('underline')
      case 'selection-unmark': return void markSelection('remove')
      case 'selection-explain':
        setSidebarOpen(true)
        return void assistant.send(`Explain this in simple words: “${arg}”`)
      case 'selection-define':
        setSidebarOpen(true)
        return void assistant.send(`Define: “${arg}”`)
      case 'selection-park':
        return session.dispatch({ type: 'park', item: { id: crypto.randomUUID(), kind: 'thought', title: arg.slice(0, 200), createdAt: Date.now() } })
    }
  }

  function buildCommands(): Command[] {
    const cmds: Command[] = []
    const act = (id: string, title: string, run: () => void, keywords = '', hint?: string) => cmds.push({ id, title, run, keywords, hint, group: 'Actions' })
    act('new-tab', 'New tab', newTab, 'open blank')
    act('reopen-tab', 'Reopen closed tab', reopenClosedTab, 'restore undo close', navigator.platform.includes('Mac') ? '⌘⇧T' : 'Ctrl+Shift+T')
    act('group-tab', 'Add this tab to a group', () => createGroup(activeIdRef.current), 'organize tabs')
    act('park-tab', 'Park this tab for later', () => parkTab(activeIdRef.current), 'save close later')
    act('park-thought', 'Park a thought', () => setParkingOpen(true), 'note idea remember')
    act('parking', 'Open parking lot', () => setParkingOpen(true), 'parked saved')
    act('calm', 'I feel overwhelmed (calm view)', calmView, 'panic anxious too much stressed simplify')
    act('reader', 'Open reader view', () => void reading.openReader(), 'simplify article summary tldr')
    act('reading', 'Reading tools (fonts, line focus)', () => setReadingOpen(true), 'typography dyslexia ruler dim')
    act('sel-simplify', 'Simplify selected text', () => void simplifySelection(), 'phrase sentence shorten easier select')
    act('sel-restore', 'Show original of selected text', () => void restoreSelection(), 'undo unsimplify restore select')
    act('sel-highlight', 'Highlight selected text', () => void markSelection('highlight'), 'mark color selection')
    act('sel-underline', 'Underline selected text', () => void markSelection('underline'), 'mark selection')
    act('sel-unmark', 'Remove marks from selected text', () => void markSelection('remove'), 'unhighlight underline selection')
    act('find', 'Find in page', openFind, 'search text')
    act('focus', `${focusModeEnabled ? 'Turn off' : 'Turn on'} Simplify mode`, () => void persistFocusMode(!focusModeEnabled), 'simplify')
    act('settings', 'Settings', () => setSettingsOpen(true), 'preferences model ollama blocker')
    act('assistant', sidebarOpen ? 'Hide assistant' : 'Show assistant', () => setSidebarOpen((v) => !v), 'chat sidebar')
    if (session.state.current) {
      act('end-goal', 'Finish this goal', endSession, 'done complete session')
    } else {
      act('new-goal', 'Set a goal', () => document.getElementById('cclear-goal-input')?.focus(), 'start session task')
    }
    for (const level of ['off', 'quiet', 'balanced', 'coach'] as const) {
      act(`nudge-${level}`, `Check-ins: ${level}`, () => session.dispatch({ type: 'assistLevel', level }), 'nudges distraction')
    }
    for (const t of tabs) {
      cmds.push({ id: `tab-${t.id}`, title: `${t.id === activeId ? 'Current tab' : 'Switch to'}: ${t.title || t.url || 'New tab'}`, hint: t.url, group: 'Tabs', run: () => activateTab(t.id) })
    }
    for (const p of session.state.parked.filter((x) => x.kind === 'tab')) {
      cmds.push({ id: `parked-${p.id}`, title: `Reopen: ${p.title}`, hint: p.url, group: 'Parked', run: () => restoreParked(p) })
    }
    for (const url of [...recentHistory].reverse().slice(0, 15)) {
      cmds.push({ id: `hist-${url}`, title: url.replace(/^https?:\/\/(www\.)?/, ''), group: 'History', run: () => navigateActive(url) })
    }
    return cmds
  }

  const paletteDynamic = (q: string): Command[] => {
    const out: Command[] = []
    const ask = q.replace(/^\/ask\s*/i, '')
    out.push({ id: 'dyn-ask', title: `Ask CCLEAR: ${ask}`, group: 'Ask', run: () => { setSidebarOpen(true); void assistant.send(q) } })
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(q) || /^https?:\/\//i.test(q)) {
      out.push({ id: 'dyn-go', title: `Go to ${q}`, group: 'Actions', run: () => navigateActive(normalizeUrl(q)) })
    }
    out.push({ id: 'dyn-search', title: `Search the web for “${q}”`, group: 'Actions', run: () => openTabAt(`https://www.google.com/search?q=${encodeURIComponent(q)}`) })
    out.push({ id: 'dyn-thought', title: `Park thought: ${q}`, group: 'Actions', run: () => session.dispatch({ type: 'park', item: { id: crypto.randomUUID(), kind: 'thought', title: q.slice(0, 200), createdAt: Date.now() } }) })
    return out
  }

  // ── Session end, time accounting, tab diet, calm view ──────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      if (!session.state.current) return
      const c = drift.takeCounters()
      if (c.on || c.off || c.nudges) session.dispatch({ type: 'addTime', on: c.on, off: c.off, nudges: c.nudges })
    }, 30000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.state.current?.id])

  function endSession() {
    const cur = session.state.current
    if (!cur) return
    const c = drift.takeCounters()
    setRecap(
      buildRecap({
        session: cur,
        now: Date.now(),
        onSeconds: (cur.onSeconds ?? 0) + c.on,
        offSeconds: (cur.offSeconds ?? 0) + c.off,
        nudges: (cur.nudges ?? 0) + c.nudges,
        parkedDuring: session.state.parked.filter((p) => p.createdAt >= cur.startedAt).length
      })
    )
    session.dispatch({ type: 'addTime', on: c.on, off: c.off, nudges: c.nudges })
    session.dispatch({ type: 'end', now: Date.now() })
  }

  /** Park several tabs at once (one state update, so nothing is closed twice). */
  function parkMany(ids: string[]) {
    const now = Date.now()
    const doomed = tabsRef.current.filter((t) => ids.includes(t.id) && t.url && t.url !== 'about:blank')
    if (!doomed.length) return
    for (const t of doomed) {
      session.dispatch({
        type: 'park',
        item: { id: crypto.randomUUID(), kind: 'tab', title: t.title || t.url, url: t.url, favicon: t.favicon, createdAt: now, scrollRatio: session.state.progress[progressKey(t.url)]?.ratio }
      })
    }
    const remaining = tabsRef.current.filter((t) => !doomed.some((d) => d.id === t.id))
    if (!remaining.length) {
      const id = String(crypto.randomUUID())
      setTabs([{ id, url: 'about:blank', src: 'about:blank', title: '' }])
      setActiveId(id)
    } else {
      setTabs(remaining)
      if (!remaining.some((t) => t.id === activeIdRef.current)) setActiveId(remaining[0].id)
    }
  }

  const offTabIds = tabs.filter((t) => t.id !== activeId && drift.verdicts[t.id]?.verdict === 'off').map((t) => t.id)
  const showDiet =
    Boolean(session.state.current) && session.state.assistLevel !== 'off' && !drift.nudge && !recap &&
    Date.now() > dietDismissedUntil && (offTabIds.length >= 3 || (tabs.length >= 8 && offTabIds.length >= 2))

  /** "I feel overwhelmed": quiet everything, show only the next step, and open the simplest view of the page. */
  function calmView() {
    setSidebarOpen(false)
    setParkingOpen(false)
    setSettingsOpen(false)
    setReadingOpen(false)
    const next = session.state.current?.steps.find((x) => !x.done)
    setCalmNote(next ? `Take a breath. One thing: ${next.text}` : session.state.current ? `Take a breath. One thing: ${session.state.current.goal}` : 'Take a breath. You only need to do one thing right now.')
    void reading.openReader()
  }

  const tabUrlsKey = useMemo(() => tabs.map(t => t.url).sort().join('|'), [tabs])

  async function autoGroupTabs() {
    const candidates = tabsRef.current.filter((tab) => !tab.group && tab.url !== 'about:blank')
    if (candidates.length < 2) { notify('Open at least two ungrouped pages to group them.'); return }
    setGroupingBusy(true)
    try {
      const items: TabContextItem[] = candidates.map((tab) => ({ id: tab.id, title: tab.title, url: tab.url, isActive: tab.id === activeIdRef.current }))
      const suggestions = await window.cclearBrowser.ai.groupTabs(items)
      const validIds = new Set(candidates.map((tab) => tab.id))
      const names = new Map<string, string[]>()
      for (const suggestion of suggestions) {
        const name = typeof suggestion.group === 'string' ? cleanGroupName(suggestion.group) : ''
        if (!validIds.has(suggestion.id) || !name) continue
        names.set(name, [...(names.get(name) || []), suggestion.id])
      }
      const clusters = [...names].filter(([, ids]) => ids.length >= 2)
      if (!clusters.length) { notify('No clear tab groups found. You can group tabs manually by right-clicking one.'); return }
      setGroups((previous) => {
        const copy = { ...previous }
        for (const [name] of clusters) if (!copy[name]) copy[name] = { color: GROUP_COLORS[Object.keys(copy).length % GROUP_COLORS.length], collapsed: false }
        return copy
      })
      setTabs((previous) => {
        let next = previous
        for (const [name, ids] of clusters) for (const id of ids) next = moveIntoGroup(next, id, name)
        return next
      })
      notify('Grouped similar tabs. Right-click a group to rename or recolor it.')
    } catch {
      notify('Could not group tabs. Check that the local AI model is running.')
    } finally {
      setGroupingBusy(false)
    }
  }

  // Keyboard shortcuts from native menu
  useEffect(() => {
    const handleShortcut = (action: string, ...args: unknown[]) => {
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
          shortcutExtraRef.current('close-tab', args)
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
        case 'park-tab':
          parkTabRef.current(currentActiveId)
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
          shortcutExtraRef.current('next-tab', args)
          break
        }
        case 'prev-tab': {
          shortcutExtraRef.current('prev-tab', args)
          break
        }
        case 'go-tab': {
          shortcutExtraRef.current('go-tab', args)
          break
        }
        default:
          shortcutExtraRef.current(action, args)
          break
      }
    }
    const unsubscribe = window.cclearBrowser.onShortcut(handleShortcut)
    // The shell also catches the three core tab actions when a native menu accelerator is unavailable.
    // Keys typed inside a web page remain covered by Electron's application menu.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.isComposing) return
      const primary = navigator.platform.includes('Mac') ? event.metaKey : event.ctrlKey
      if (!primary) return
      const key = event.key.toLowerCase()
      const action = key === 't' ? (event.shiftKey ? 'reopen-tab' : 'new-tab') : key === 'w' && !event.shiftKey ? 'close-tab' : ''
      if (!action) return
      event.preventDefault()
      handleShortcut(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { unsubscribe(); window.removeEventListener('keydown', onKeyDown) }
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
        <TabStrip
          tabs={tabs}
          activeId={activeId}
          groups={groups}
          onActivate={activateTab}
          onClose={closeTab}
          onNewTab={newTab}
          onSearchTabs={() => { setPaletteMode('tabs'); setPaletteOpen(true) }}
          onCreateGroup={createGroup}
          onMoveToGroup={moveToGroup}
          onRemoveFromGroup={removeFromGroup}
          onMoveBefore={(id, beforeId) => setTabs((previous) => moveBeforeTab(previous, id, beforeId))}
          onToggleGroup={(name) => setGroups((previous) => ({ ...previous, [name]: { color: previous[name]?.color || 'blue', collapsed: !previous[name]?.collapsed } }))}
          onRenameGroup={renameGroup}
          onColorGroup={(name, color) => setGroups((previous) => ({ ...previous, [name]: { color, collapsed: previous[name]?.collapsed || false } }))}
          onUngroup={ungroup}
          onCloseGroup={closeGroup}
          onAutoGroup={() => void autoGroupTabs()}
          groupingBusy={groupingBusy}
          verdicts={drift.verdicts}
        />
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
          readingOpen={readingOpen}
          onToggleReading={() => setReadingOpen((v) => !v)}
          blockedCount={blockedCount}
          onOpenSettings={() => setSettingsOpen((v) => !v)}
          onOpenPalette={() => { setPaletteMode('all'); setPaletteOpen(true) }}
        />
        {!isNewTab && <SessionBar
          session={session.state.current}
          verdict={drift.verdicts[activeId]}
          parkedCount={session.state.parked.length}
          stepsLoading={stepsLoading}
          onStart={(goal) => {
            setStepsLoading(true)
            void session.startGoal(goal).finally(() => setStepsLoading(false))
          }}
          onEnd={endSession}
          onToggleStep={(id) => session.dispatch({ type: 'toggleStep', id })}
          onAddStep={(text) => session.dispatch({ type: 'addStep', text, id: crypto.randomUUID() })}
          onRemoveStep={(id) => session.dispatch({ type: 'removeStep', id })}
          onOpenParking={() => setParkingOpen((v) => !v)}
        />}
        <WebviewHost
          recentHistory={recentHistory}
          tabs={tabs}
          activeId={activeId}
          setWebviewRef={(id, el) => setWebviewRef(id, el)}
          onNavigate={(url) => {
            const normalized = normalizeUrl(url)
            setNavUrl(normalized)
            setTabs(prev => prev.map(t => t.id === activeId ? { ...t, url: normalized, src: normalized, title: '', favicon: '' } : t))
          }}
          session={session.state.current}
          parked={session.state.parked}
          recentProgress={Object.values(session.state.progress).filter((p) => worthResuming(p, Date.now())).sort((a, b) => b.at - a.at).slice(0, 3)}
          onStartGoal={(goal) => {
            setStepsLoading(true)
            void session.startGoal(goal).finally(() => setStepsLoading(false))
          }}
          onEndGoal={endSession}
          onToggleStep={(id) => session.dispatch({ type: 'toggleStep', id })}
          onAddStep={(text) => session.dispatch({ type: 'addStep', text, id: crypto.randomUUID() })}
          onRemoveStep={(id) => session.dispatch({ type: 'removeStep', id })}
          onOpenParking={() => setParkingOpen((v) => !v)}
          onRestoreParked={restoreParked}
          stepsLoading={stepsLoading}
          overlay={
            friction && friction.tabId === activeId ? (
          <FrictionGate
            host={friction.host}
            goal={session.state.current?.goal}
            onContinue={() => {
              frictionPassed.current.set(`${friction.tabId}|${friction.host}`, Date.now())
              try { webviewRefs.current[friction.tabId]?.setAudioMuted(false) } catch { /* */ }
              setFriction(null)
            }}
            onLeave={() => {
              const f = friction
              setFriction(null)
              try { webviewRefs.current[f.tabId]?.setAudioMuted(false) } catch { /* */ }
              if (tabsRef.current.length > 1) closeTab(f.tabId)
              else navigateActive('about:blank')
            }}
          />
        ) : null
          }
        />
        {drift.nudge && session.state.current && (
          <DriftNudge
            nudge={drift.nudge}
            goal={session.state.current.goal}
            onBack={backToTask}
            onRelevant={() => {
              session.dispatch({ type: 'allowHost', host: drift.nudge!.host })
              drift.dismissNudge()
            }}
            onPark={() => {
              const id = drift.nudge!.tabId
              drift.dismissNudge()
              parkTab(id)
            }}
            onSnooze={() => drift.snoozeNudge()}
            onDismiss={drift.dismissNudge}
          />
        )}
        {showDiet && (
          <TabDiet
            total={tabs.length}
            offCount={offTabIds.length}
            onPark={() => parkMany(offTabIds)}
            onDismiss={() => setDietDismissedUntil(Date.now() + 15 * 60_000)}
          />
        )}
        {notice && !calmNote && (
          <div className="resumeToast" role="status" aria-live="polite">
            <span>{notice}</span>
            <button type="button" className="nudgeLink" onClick={() => setNotice('')}>Dismiss</button>
          </div>
        )}
        {calmNote && (
          <div className="resumeToast" role="status" aria-live="polite">
            <span>{calmNote}</span>
            <button type="button" className="nudgeLink" onClick={() => setCalmNote('')}>Dismiss</button>
          </div>
        )}
        {resumeOffer && resumeOffer.tabId === activeId && !drift.nudge && (
          <ResumeToast
            text={describeProgress(resumeOffer.progress)}
            onResume={() => {
              void webviewRefs.current[resumeOffer.tabId]?.executeJavaScript(getScrollToRatioScript(resumeOffer.progress.ratio), true).catch(() => {})
              setResumeOffer(null)
            }}
            onDismiss={() => setResumeOffer(null)}
          />
        )}
        {readingOpen && (
          <ReadingPanel
            prefs={reading.prefs}
            onChange={reading.update}
            onReader={() => {
              setReadingOpen(false)
              void reading.openReader()
            }}
            readerError={reading.readerError}
            focusModeOn={focusModeEnabled}
            showingOriginal={reading.showingOriginal}
            onToggleOriginal={() => void reading.toggleOriginal()}
            onClose={() => setReadingOpen(false)}
          />
        )}
        {findOpen && (
          <FindBar open query={findQuery} setQuery={setFindQuery} activeMatch={findActive} matchCount={findCount} onFind={runFind} onClose={closeFind} />
        )}
        {settingsOpen && (
          <SettingsPanel
            assistLevel={session.state.assistLevel}
            onAssistLevel={(level) => session.dispatch({ type: 'assistLevel', level })}
            frictionHosts={session.state.frictionHosts}
            onFriction={(host, on) => session.dispatch({ type: 'friction', host, on })}
            eco={eco}
            onEco={(on) => {
              setEco(on)
              void window.cclearBrowser.prefs.set({ eco: on })
            }}
            blockerEnabled={blockerEnabled}
            onBlockerEnabled={(on) => {
              setBlockerEnabled(on)
              void window.cclearBrowser.blocker.setEnabled(on)
            }}
            siteHost={activeSiteHost}
            siteAllowed={session.state.blockerAllow.some((h) => activeSiteHost === h || activeSiteHost.endsWith(`.${h}`))}
            onSiteAllowed={(on) => {
              session.dispatch({ type: 'blockerAllow', host: activeSiteHost, on })
              try { webviewRefs.current[activeIdRef.current]?.reload() } catch { /* */ }
            }}
            onClose={() => setSettingsOpen(false)}
            onModelChanged={() => {
              void window.cclearBrowser.ai.health().then((h) => setAiHealthy(h.ok)).catch(() => setAiHealthy(false))
            }}
            onOpenOllama={() => {
              openTabAt('https://ollama.com/download')
              setSettingsOpen(false)
            }}
          />
        )}
        {parkingOpen && (
          <ParkingPanel
            items={session.state.parked}
            onClose={() => setParkingOpen(false)}
            onRestore={restoreParked}
            onDelete={(id) => session.dispatch({ type: 'unpark', id })}
            onAddThought={(text) =>
              session.dispatch({ type: 'park', item: { id: crypto.randomUUID(), kind: 'thought', title: text, createdAt: Date.now() } })
            }
          />
        )}
      </div>
      {recap && (
        <SessionRecap
          recap={recap}
          onClose={() => setRecap(null)}
          onNewGoal={() => {
            setRecap(null)
            setTimeout(() => document.getElementById('cclear-goal-input')?.focus(), 50)
          }}
        />
      )}
      {paletteOpen && <CommandPalette mode={paletteMode} commands={buildCommands()} dynamic={paletteDynamic} onClose={() => setPaletteOpen(false)} />}
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
            <span className="chatEdgeText" aria-hidden="true">Assistant</span>
          </button>
          <div className="chatPanel" id="cclear-chat-panel" aria-hidden={!sidebarOpen}>
            {!session.state.current && (
              <WhyAmIHereBox summaries={tabContexts[activeId] || []} isLoading={contextLoading[activeId] || false} />
            )}
            <ChatSidebar
              aiHealthy={aiHealthy}
              aiHint="Runs fully local on your Mac when Ollama is installed."
              messages={assistant.messages}
              input={assistant.input}
              setInput={assistant.setInput}
              sending={assistant.sending}
              thinking={assistant.think}
              draft={assistant.draft}
              onSend={(o) => void assistant.send(o)}
              onCancel={assistant.cancel}
              onOpenSource={(src) => void assistant.openSource(src)}
              onSwitchTab={setActiveId}
              onOpenSetup={() => setSettingsOpen(true)}
              onConfirmAction={(m, a) => void assistant.confirmAction(m, a)}
              onDismissAction={assistant.dismissAction}
            />
          </div>
        </div>
      </aside>
    </div>
  )
}
