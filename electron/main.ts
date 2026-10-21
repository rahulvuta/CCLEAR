import { app, BrowserWindow, Menu } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAllIpc } from './ipc/register'
import { installBlocker } from './blocker'
import { installLedger } from './ledger'
import { configureBrowsingSession, hardenWebContents, disableRemoteContent } from './security'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

installLedger()
registerAllIpc()

/** Send an IPC action to the focused renderer window */
function sendToRenderer(channel: string, ...args: unknown[]) {
  const win = BrowserWindow.getFocusedWindow()
  if (win) win.webContents.send(channel, ...args)
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: 'CCLEAR',
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),

    // File
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => { void createWindow(true) }
        },
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => sendToRenderer('shortcut', 'new-tab')
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendToRenderer('shortcut', 'close-tab')
        },
        {
          label: 'Park This Tab',
          accelerator: 'CmdOrCtrl+Alt+P',
          click: () => sendToRenderer('shortcut', 'park-tab')
        },
        {
          label: 'Reopen Closed Tab',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => sendToRenderer('shortcut', 'reopen-tab')
        },
        { type: 'separator' },
        {
          label: 'Print Page',
          accelerator: 'CmdOrCtrl+P',
          click: () => sendToRenderer('shortcut', 'print')
        },
        { type: 'separator' },
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => sendToRenderer('shortcut', 'palette')
        },
        {
          label: 'Open Location',
          accelerator: 'CmdOrCtrl+L',
          click: () => sendToRenderer('shortcut', 'focus-address')
        },
        {
          label: 'Search from Address Bar',
          accelerator: 'CmdOrCtrl+K',
          click: () => sendToRenderer('shortcut', 'focus-address')
        },
        ...(isMac ? [{
          label: 'Search from Address Bar (alternate)',
          accelerator: 'Command+Alt+F',
          click: () => sendToRenderer('shortcut', 'focus-address')
        }] : []),
        ...(!isMac ? [{
          label: 'Open Location (alternate)',
          accelerator: 'Alt+D',
          click: () => sendToRenderer('shortcut', 'focus-address')
        }] : []),
        {
          label: 'Search Tabs',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => sendToRenderer('shortcut', 'tab-search')
        },
        { type: 'separator' },
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+Shift+W',
          role: 'close'
        },
        ...(isMac ? [] : [{ role: 'quit' as const }])
      ]
    },

    // Edit
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => sendToRenderer('shortcut', 'find')
        },
        {
          label: 'Find Next',
          accelerator: 'CmdOrCtrl+G',
          click: () => sendToRenderer('shortcut', 'find-next')
        },
        {
          label: 'Find Previous',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => sendToRenderer('shortcut', 'find-prev')
        },
        ...(!isMac ? [{
          label: 'Find (F3)',
          accelerator: 'F3',
          click: () => sendToRenderer('shortcut', 'find')
        }] : [])
      ] as Electron.MenuItemConstructorOptions[]
    },

    // View
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload Page',
          accelerator: 'CmdOrCtrl+R',
          click: () => sendToRenderer('shortcut', 'reload')
        },
        ...(!isMac ? [{
          label: 'Reload Page (F5)',
          accelerator: 'F5',
          click: () => sendToRenderer('shortcut', 'reload')
        }] : []),
        {
          label: 'Hard Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => sendToRenderer('shortcut', 'hard-reload')
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => sendToRenderer('shortcut', 'zoom-in')
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => sendToRenderer('shortcut', 'zoom-out')
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => sendToRenderer('shortcut', 'zoom-reset')
        },
        {
          label: 'Developer Tools',
          accelerator: isMac ? 'Command+Alt+I' : 'Control+Shift+J',
          click: () => sendToRenderer('shortcut', 'devtools')
        },
        { type: 'separator' },
        {
          label: 'Toggle Simplify Mode',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => sendToRenderer('shortcut', 'toggle-focus')
        },
        {
          label: 'Calm View (I feel overwhelmed)',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => sendToRenderer('shortcut', 'calm')
        },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendToRenderer('shortcut', 'toggle-sidebar')
        },
        { type: 'separator' },
        { role: 'togglefullscreen', accelerator: isMac ? 'Control+Command+F' : 'F11' }
      ]
    },

    // Navigation
    {
      label: 'Navigation',
      submenu: [
        {
          label: 'Back',
          accelerator: 'CmdOrCtrl+[',
          click: () => sendToRenderer('shortcut', 'go-back')
        },
        {
          label: 'Forward',
          accelerator: 'CmdOrCtrl+]',
          click: () => sendToRenderer('shortcut', 'go-forward')
        },
        {
          label: 'Back (arrow)',
          accelerator: isMac ? 'Command+Left' : 'Alt+Left',
          click: () => sendToRenderer('shortcut', 'go-back')
        },
        {
          label: 'Forward (arrow)',
          accelerator: isMac ? 'Command+Right' : 'Alt+Right',
          click: () => sendToRenderer('shortcut', 'go-forward')
        },
        {
          label: 'Home',
          accelerator: isMac ? 'Command+Shift+H' : 'Alt+Home',
          click: () => sendToRenderer('shortcut', 'home')
        },
        { type: 'separator' },
        {
          label: 'Next Tab',
          accelerator: 'Control+Tab',
          click: () => sendToRenderer('shortcut', 'next-tab')
        },
        {
          label: 'Previous Tab',
          accelerator: 'Control+Shift+Tab',
          click: () => sendToRenderer('shortcut', 'prev-tab')
        },
        ...(isMac ? [
          {
            label: 'Next Tab (arrow)',
            accelerator: 'Command+Alt+Right',
            click: () => sendToRenderer('shortcut', 'next-tab')
          },
          {
            label: 'Previous Tab (arrow)',
            accelerator: 'Command+Alt+Left',
            click: () => sendToRenderer('shortcut', 'prev-tab')
          }
        ] : []),
        {
          label: 'Move Tab Left',
          accelerator: 'Control+Shift+PageUp',
          click: () => sendToRenderer('shortcut', 'move-tab-left')
        },
        {
          label: 'Move Tab Right',
          accelerator: 'Control+Shift+PageDown',
          click: () => sendToRenderer('shortcut', 'move-tab-right')
        },
        { type: 'separator' },
        {
          label: 'Tab 1',
          accelerator: 'CmdOrCtrl+1',
          click: () => sendToRenderer('shortcut', 'go-tab', 0)
        },
        {
          label: 'Tab 2',
          accelerator: 'CmdOrCtrl+2',
          click: () => sendToRenderer('shortcut', 'go-tab', 1)
        },
        {
          label: 'Tab 3',
          accelerator: 'CmdOrCtrl+3',
          click: () => sendToRenderer('shortcut', 'go-tab', 2)
        },
        {
          label: 'Tab 4',
          accelerator: 'CmdOrCtrl+4',
          click: () => sendToRenderer('shortcut', 'go-tab', 3)
        },
        {
          label: 'Tab 5',
          accelerator: 'CmdOrCtrl+5',
          click: () => sendToRenderer('shortcut', 'go-tab', 4)
        },
        {
          label: 'Tab 6',
          accelerator: 'CmdOrCtrl+6',
          click: () => sendToRenderer('shortcut', 'go-tab', 5)
        },
        {
          label: 'Tab 7',
          accelerator: 'CmdOrCtrl+7',
          click: () => sendToRenderer('shortcut', 'go-tab', 6)
        },
        {
          label: 'Tab 8',
          accelerator: 'CmdOrCtrl+8',
          click: () => sendToRenderer('shortcut', 'go-tab', 7)
        },
        {
          label: 'Last Tab',
          accelerator: 'CmdOrCtrl+9',
          click: () => sendToRenderer('shortcut', 'go-tab', -1)
        }
      ]
    },

    // Window
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }])
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

buildAppMenu()

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

async function createWindow(fresh = false) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    title: 'CCLEAR',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#f6f5f1',
    icon: path.join(app.getAppPath(), 'assets/icon.png'),
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true,
      zoomFactor: 1.0,
      /* Throttle timers and rendering when the window is hidden or minimized, to save CPU/GPU */
      // CCLEAR_E2E=1 (set only by the automated tests, whose window sits behind other windows) opts out
      backgroundThrottling: process.env.CCLEAR_E2E !== '1'
    }
  })

  // Must run before the renderer loads so the first <webview> is already covered.
  configureBrowsingSession(win)
  hardenWebContents(win)

  const urlOrFile = resolveRendererUrl()
  if (urlOrFile.startsWith('http')) {
    const url = new URL(urlOrFile)
    if (fresh) url.searchParams.set('newWindow', '1')
    await win.loadURL(url.toString())
  } else {
    await win.loadFile(urlOrFile, fresh ? { query: { newWindow: '1' } } : undefined)
  }
}

disableRemoteContent()

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    try { app.dock?.setIcon(path.join(app.getAppPath(), 'assets/icon.png')) } catch { /* packaged icon remains available */ }
  }
  installBlocker()
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
