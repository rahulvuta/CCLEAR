import { app, BrowserWindow, clipboard, dialog, Menu, session, shell } from 'electron'
import { trackNavigations } from './blocker'
import { getSelectionProbeScript } from '../src/focus/selection'
import { isAllowedNavigationUrl, parseWebUrl, PROMPTED_PERMISSIONS, SILENT_PERMISSIONS } from '../src/shared/urlPolicy'

export const WEBVIEW_PARTITION = 'persist:adhd-browser'
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** origin|permission -> decision, so each site is asked at most once per run */
const permissionDecisions = new Map<string, boolean>()

/** Webviews use their own partition, so the handlers must live on it (not on the window session). */
export function configureBrowsingSession(parent: BrowserWindow) {
  const ses = session.fromPartition(WEBVIEW_PARTITION)
  ses.setUserAgent(DESKTOP_UA)

  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (SILENT_PERMISSIONS.has(permission)) return callback(true)
    if (!PROMPTED_PERMISSIONS.has(permission)) return callback(false)
    const origin = (() => {
      const u = parseWebUrl(details.requestingUrl)
      return u ? u.origin : ''
    })()
    if (!origin) return callback(false)
    const key = `${origin}|${permission}`
    const known = permissionDecisions.get(key)
    if (known !== undefined) return callback(known)
    void dialog
      .showMessageBox(parent, {
        type: 'question',
        buttons: ['Block', 'Allow'],
        defaultId: 0,
        cancelId: 0,
        message: `${new URL(origin).host} wants to use your ${permission === 'media' ? 'camera or microphone' : permission}.`,
        detail: 'You can change this by restarting CCLEAR.'
      })
      .then((r) => {
        const allow = r.response === 1
        permissionDecisions.set(key, allow)
        callback(allow)
      })
  })
  ses.setPermissionCheckHandler((_wc, permission) => SILENT_PERMISSIONS.has(permission))
  return ses
}

/** Lock down every <webview> the renderer attaches and every navigation it makes. */
export function hardenWebContents(win: BrowserWindow) {
  win.webContents.on('will-attach-webview', (_e, webPreferences, params) => {
    delete (webPreferences as Record<string, unknown>).preload
    delete (webPreferences as Record<string, unknown>).preloadURL
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false
    params.partition = WEBVIEW_PARTITION
  })

  // The CCLEAR shell itself must never navigate away from the app.
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (parseWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('did-attach-webview', (_event, wc) => {
    trackNavigations(wc)
    wc.on('context-menu', (_e, p) => {
      // Ask the page what is selected (and whether it is already simplified) before building the menu.
      const probe = p.selectionText.trim() ? wc.executeJavaScript(getSelectionProbeScript(), true).then((r) => JSON.parse(String(r)) as { has: boolean; simplified: boolean }).catch(() => ({ has: true, simplified: false })) : Promise.resolve({ has: false, simplified: false })
      void probe.then((sel0) => {
      const send = (action: string, payload?: string) => win.webContents.send('shortcut', action, payload)
      const sel = p.selectionText.trim().slice(0, 600)
      const template: Electron.MenuItemConstructorOptions[] = []
      if (sel) {
        const short = sel.length > 28 ? `${sel.slice(0, 28)}…` : sel
        template.push(
          ...(!sel0.simplified ? [{ label: 'Simplify selected text', click: () => send('selection-simplify') }] : []),
          ...(sel0.simplified ? [{ label: 'Show original of selected text', click: () => send('selection-restore') }] : []),
          { label: 'Highlight selection', submenu: [
            { label: 'Default color', click: () => send('selection-highlight') },
            ...(['yellow', 'mint', 'blue', 'pink', 'violet'] as const).map((color) => ({ label: color[0].toUpperCase() + color.slice(1), click: () => send('selection-highlight', color) }))
          ] },
          { label: 'Underline selection', click: () => send('selection-underline') },
          { label: 'Remove highlight or underline', click: () => send('selection-unmark') },
          { type: 'separator' as const },
          { label: 'Explain this simply', click: () => send('selection-explain', sel) },
          { label: 'Define', click: () => send('selection-define', sel) },
          { label: 'Park as a thought', click: () => send('selection-park', sel) },
          { label: `Search the web for “${short}”`, click: () => send('open-url-new-tab', `https://www.google.com/search?q=${encodeURIComponent(sel)}`) },
          { type: 'separator' },
          { role: 'copy' }
        )
      }
      if (p.linkURL && parseWebUrl(p.linkURL)) {
        if (template.length) template.push({ type: 'separator' })
        template.push(
          { label: 'Open link in new tab', click: () => send('open-url-new-tab', p.linkURL) },
          { label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) }
        )
      }
      if (p.isEditable) {
        if (template.length) template.push({ type: 'separator' })
        template.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' })
      }
      if (!template.length) {
        template.push(
          { label: 'Back', enabled: wc.canGoBack(), click: () => wc.goBack() },
          { label: 'Forward', enabled: wc.canGoForward(), click: () => wc.goForward() },
          { label: 'Reload', click: () => wc.reload() },
          { type: 'separator' },
          { label: 'Park this tab', click: () => send('park-tab') },
          { label: 'Open reader view', click: () => send('reader') }
        )
      }
      Menu.buildFromTemplate(template).popup({ window: win })
      })
    })
    wc.on('will-navigate', (e, url) => {
      if (!isAllowedNavigationUrl(url)) e.preventDefault()
    })
    wc.on('will-redirect', (e, url) => {
      if (!isAllowedNavigationUrl(url)) e.preventDefault()
    })
    wc.setWindowOpenHandler(({ url }) => {
      if (isAllowedNavigationUrl(url) && url !== 'about:blank') {
        // keep popups inside the same tab rather than spawning OS windows
        void wc.loadURL(url)
      }
      return { action: 'deny' }
    })
  })
}

export function disableRemoteContent() {
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (e, url) => {
      if (contents.getType() === 'webview' && !isAllowedNavigationUrl(url)) e.preventDefault()
    })
  })
}
