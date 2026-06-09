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
    title: 'ADHD Browser',
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
