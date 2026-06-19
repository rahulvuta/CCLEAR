import { app, BrowserWindow, Menu } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAllIpc } from './ipc/register'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
          label: 'Reopen Closed Tab',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => sendToRenderer('shortcut', 'reopen-tab')
        },
        { type: 'separator' },
        {
          label: 'Open Location',
          accelerator: 'CmdOrCtrl+L',
          click: () => sendToRenderer('shortcut', 'focus-address')
        },
        { type: 'separator' },
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
        }
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
        { type: 'separator' },
        {
          label: 'Toggle Focus Mode',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => sendToRenderer('shortcut', 'toggle-focus')
        },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendToRenderer('shortcut', 'toggle-sidebar')
        },
        { type: 'separator' },
        { role: 'togglefullscreen' }
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
        { type: 'separator' },
        {
          label: 'Next Tab',
          accelerator: 'CmdOrCtrl+Shift+]',
          click: () => sendToRenderer('shortcut', 'next-tab')
        },
        {
          label: 'Previous Tab',
          accelerator: 'CmdOrCtrl+Shift+[',
          click: () => sendToRenderer('shortcut', 'prev-tab')
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
