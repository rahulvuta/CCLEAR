import { useEffect } from 'react'
import type { WebviewTag } from 'electron'
import type { UITab } from './TabStrip'

type Props = {
  tabs: UITab[]
  activeId: string
  setWebviewRef: (id: string, el: WebviewTag | null) => void
}

export function WebviewHost({ tabs, activeId, setWebviewRef }: Props) {
  useEffect(() => {
    const w = document.querySelector(`webview[data-tab="${CSS.escape(activeId)}"]`) as WebviewTag | null
    if (!w) return
    try {
      w.focus()
    } catch {
      //
    }
  }, [activeId, tabs])

  return (
    <main className="viewport">
      {tabs.map((t) => {
        const visible = t.id === activeId
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
                  } catch {
                    /* */
                  }
                }
                wv.addEventListener('dom-ready', onReady)
              }
            }}
            data-tab={t.id}
            src={t.url}
            className={visible ? 'webviewShown' : 'webviewHidden'}
            partition="persist:cclear-browser"
            webpreferences="contextIsolation=yes, javascript=yes, images=yes, webgl=yes"
            // @ts-expect-error – Electron webview attrs
            allowpopups="true"
            useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          />
        )
      })}
    </main>
  )
}
