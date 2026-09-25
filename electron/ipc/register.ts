import { app, ipcMain } from 'electron'
import { getPrefs, setPrefs } from './prefs'
import { registerAiIpc } from './ai'
import { registerTabsIpc } from './tabs'
import { registerSessionIpc } from './session'
import { registerReadingIpc } from './reading'
import { registerModelsIpc } from './models'

export function registerAllIpc() {
  registerAiIpc()
  registerTabsIpc()
  registerSessionIpc()
  registerReadingIpc()
  registerModelsIpc()

  ipcMain.handle('app:info', () => ({ version: app.getVersion(), demo: process.env.CCLEAR_DEMO === '1', demoUrl: process.env.CCLEAR_DEMO_URL ?? '' }))
  ipcMain.handle('prefs:get', () => getPrefs())
  ipcMain.handle('prefs:set', (_evt, patch: Partial<ReturnType<typeof getPrefs>>) => setPrefs(patch))
}
