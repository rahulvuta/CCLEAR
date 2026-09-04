import { ipcMain, session, type WebContents } from 'electron'
import { getBlockerAllow } from './ipc/session'
import { hostOf, shouldBlock, siteOf } from '../src/blocker/match'
import { WEBVIEW_PARTITION } from './security'

/** Per-tab counters, reset on each main-frame navigation. */
const counts = new Map<number, number>()

export function installBlocker() {
  const ses = session.fromPartition(WEBVIEW_PARTITION)
  let enabled = true
  ipcMain.handle('blocker:set-enabled', (_e, on: boolean) => {
    enabled = Boolean(on)
  })

  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (!enabled) return callback({})
    const wc: WebContents | undefined = details.webContents ?? undefined
    const pageUrl = details.referrer || wc?.getURL() || ''
    const block = shouldBlock({ url: details.url, pageUrl, resourceType: details.resourceType }, getBlockerAllow())
    if (block && wc) counts.set(wc.id, (counts.get(wc.id) ?? 0) + 1)
    callback({ cancel: block })
  })

  ipcMain.handle('blocker:count', (_e, wcId: number) => counts.get(wcId) ?? 0)
  ipcMain.handle('blocker:site', (_e, url: string) => siteOf(hostOf(url)))
}

/** Reset the counter when a tab starts a new page. */
export function trackNavigations(wc: WebContents) {
  wc.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) counts.set(wc.id, 0)
  })
}
