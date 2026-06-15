import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAllIpc } from './ipc/register'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

registerAllIpc()

function resolvePreloadPath(): string {
  const dir = path.join(__dirname, '../preload')
  for (const name of ['preload.js', 'preload.mjs', 'preload.cjs']) {
    const candidate = path.join(dir, name)
    if (fs.existsSync(candidate)) return candidate
  }
  return path.join(dir, 'preload.js')
}

function resolveRendererUrl() {
  if (process.env.ELECTRON_RENDERER_URL) {
    return process.env.ELECTRON_RENDERER_URL
  }
  return path.join(__dirname, '../renderer/index.html')
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    title: 'CCLEAR',
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true,
      zoomFactor: 1.0,
      /* Keeps inactive webviews and timers more responsive while browsing */
      backgroundThrottling: false
    }
  })

  const urlOrFile = resolveRendererUrl()
  if (urlOrFile.startsWith('http')) {
    await win.loadURL(urlOrFile)
  } else {
    await win.loadFile(urlOrFile)
  }

  // Ensure webviews render with standard desktop user agent
  const ses = win.webContents.session
  ses.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')

  // Allow webviews to open new windows (popups) normally
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'geolocation', 'notifications', 'fullscreen', 'pointerLock']
    callback(allowed.includes(permission))
  })

  // Suppress noisy console errors from ad trackers and failed network requests
  ses.webRequest.onErrorOccurred((_details) => {
    // silently swallow — these are ad/tracker failures, not app bugs
  })

  // Handle new-window events from webviews (links with target="_blank")
  win.webContents.on('did-attach-webview', (_event, wc) => {
    wc.setWindowOpenHandler(({ url }) => {
      // Navigate the webview itself instead of opening a system window
      wc.loadURL(url)
      return { action: 'deny' }
    })
  })
}

app.whenReady().then(() => {
  void createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
