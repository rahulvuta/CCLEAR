import { useEffect } from 'react'
import type { WebviewTag } from 'electron'
import type { BookmarkItem, Prefs } from '../../shared/types'
import { chromePageKind, isChromePageUrl } from '../../shared/chromeUrls'
import type { UITab } from './TabStrip'
import { NewTabPage } from './NewTabPage'
import { ChromePage } from './ChromePage'
import { FindBar } from './FindBar'

type Props = {
  tabs: UITab[]
  activeId: string
  setWebviewRef: (id: string, el: WebviewTag | null) => void
  onNavigate: (url: string) => void
  onOpen: (url: string, newTab?: boolean) => void
  recentHistory: string[]
  bookmarks: BookmarkItem[]
  onBookmarksChange: () => void
  prefs: Prefs
  onPrefsChange: (patch: Partial<Prefs>) => void
  findOpen: boolean
  findQuery: string
  setFindQuery: (q: string) => void
  findActive: number
  findCount: number
  onFind: (forward: boolean) => void
  onFindClose: () => void
}

export function WebviewHost({
  tabs,
  activeId,
  setWebviewRef,
  onNavigate,
  onOpen,
  recentHistory,
  bookmarks,
  onBookmarksChange,
  prefs,
  onPrefsChange,
  findOpen,
  findQuery,
  setFindQuery,
  findActive,
  findCount,
  onFind,
  onFindClose
}: Props) {
  useEffect(() => {
    const w = document.querySelector(`webview[data-tab="${CSS.escape(activeId)}"]`) as WebviewTag | null
    if (!w) return
    try {
      w.focus()
    } catch {
      //
    }
  }, [activeId, tabs])

  const activeTab = tabs.find((t) => t.id === activeId)
  const showNewTab = activeTab && (!activeTab.url || activeTab.url === 'about:blank')
  const chromeKind = activeTab ? chromePageKind(activeTab.url) : null

  return (
    <main className="viewport">
      {tabs.map((t) => {
        const visible = t.id === activeId
        const isBlank = !t.url || t.url === 'about:blank'
        const isChrome = isChromePageUrl(t.url)
        return (
          <webview
            key={t.id}
            ref={(el) => {
              const wv = el as WebviewTag | null
              setWebviewRef(t.id, wv)
              if (wv) {
                const onReady = () => {
                  wv.removeEventListener('dom-ready', onReady)
                  try {
                    wv.setZoomFactor(1.0)
                    if (t.muted) wv.setAudioMuted(true)
                  } catch {
                    /* */
                  }
                }
                wv.addEventListener('dom-ready', onReady)
              }
            }}
            data-tab={t.id}
            src={isBlank || isChrome ? 'about:blank' : t.url}
            className={visible && !isBlank && !isChrome ? 'webviewShown' : 'webviewHidden'}
            partition="persist:adhd-browser"
            webpreferences="contextIsolation=yes, javascript=yes, images=yes, webgl=yes"
            // @ts-expect-error – Electron webview attrs
            allowpopups="true"
            useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          />
        )
      })}
      {showNewTab && <NewTabPage onNavigate={onNavigate} recentHistory={recentHistory} />}
      {chromeKind && (
        <ChromePage
          kind={chromeKind}
          bookmarks={bookmarks}
          onBookmarksChange={onBookmarksChange}
          prefs={prefs}
          onPrefsChange={onPrefsChange}
          onOpen={onOpen}
        />
      )}
      <FindBar
        open={findOpen}
        query={findQuery}
        setQuery={setFindQuery}
        activeMatch={findActive}
        matchCount={findCount}
        onFind={onFind}
        onClose={onFindClose}
      />
    </main>
  )
}
