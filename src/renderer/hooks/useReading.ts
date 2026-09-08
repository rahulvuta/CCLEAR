import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { WebviewTag } from 'electron'
import { clampReading, DEFAULT_READING, type ReaderContent, type ReadingPrefs } from '../../shared/reading'
import { getApplyReadingScript } from '../../reading/styles'
import { getHideReaderScript, getReaderExtractScript, getReaderSummaryScript, getShowReaderScript, readerText } from '../../reading/reader'
import { buildToggleOriginalScript } from '../../focus/simplify'

type Env = {
  webviewRefs: MutableRefObject<Record<string, WebviewTag | null>>
  activeIdRef: MutableRefObject<string>
}

export function useReading({ webviewRefs, activeIdRef }: Env) {
  const [prefs, setPrefsState] = useState<ReadingPrefs>(DEFAULT_READING)
  const [readerOpen, setReaderOpen] = useState(false)
  const [readerError, setReaderError] = useState('')
  const [showingOriginal, setShowingOriginal] = useState(false)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  useEffect(() => {
    window.cclearBrowser.prefs
      .get()
      .then((p) => setPrefsState(clampReading(p.reading)))
      .catch(() => {})
  }, [])

  const applyTo = useCallback(async (w: WebviewTag) => {
    try {
      await w.executeJavaScript(getApplyReadingScript(prefsRef.current), true)
    } catch {
      //
    }
  }, [])

  // Re-apply everywhere whenever settings change.
  useEffect(() => {
    for (const w of Object.values(webviewRefs.current)) if (w) void applyTo(w)
  }, [prefs, applyTo, webviewRefs])

  const update = useCallback((patch: Partial<ReadingPrefs>) => {
    const next = clampReading({ ...prefsRef.current, ...patch })
    setPrefsState(next)
    void window.cclearBrowser.prefs.set({ reading: next }).catch(() => {})
  }, [])

  const closeReader = useCallback(async () => {
    const w = webviewRefs.current[activeIdRef.current]
    if (w) await w.executeJavaScript(getHideReaderScript(), true).catch(() => {})
    setReaderOpen(false)
  }, [webviewRefs, activeIdRef])

  const openReader = useCallback(async () => {
    const w = webviewRefs.current[activeIdRef.current]
    if (!w) return
    setReaderError('')
    try {
      const raw = await w.executeJavaScript(getReaderExtractScript(), true)
      const content = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ReaderContent
      if (!content.blocks.length || content.blocks.reduce((n, b) => n + b.text.length, 0) < 300) {
        setReaderError('This page does not look like an article, so there is nothing to simplify.')
        return
      }
      await w.executeJavaScript(getShowReaderScript(content, prefsRef.current), true)
      setReaderOpen(true)
      const summary = await window.cclearBrowser.reading.summarize({ url: content.url, title: content.title, text: readerText(content) })
      await w.executeJavaScript(getReaderSummaryScript(summary), true).catch(() => {})
    } catch {
      setReaderError('Could not open reader view on this page.')
    }
  }, [webviewRefs, activeIdRef])

  const toggleOriginal = useCallback(async () => {
    const next = !showingOriginal
    setShowingOriginal(next)
    const w = webviewRefs.current[activeIdRef.current]
    if (w) await w.executeJavaScript(buildToggleOriginalScript(next), true).catch(() => {})
  }, [showingOriginal, webviewRefs, activeIdRef])

  return { prefs, update, applyTo, readerOpen, readerError, openReader, closeReader, showingOriginal, toggleOriginal, setShowingOriginal }
}
