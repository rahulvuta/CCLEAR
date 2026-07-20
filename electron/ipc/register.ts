import { ipcMain } from 'electron'
import { getPrefs, setPrefs } from './prefs'
import { registerAiIpc } from './ai'
import { registerTabsIpc } from './tabs'
import { registerChromeIpc } from './chrome'

export function registerAllIpc() {
  registerAiIpc()
  registerTabsIpc()
  registerChromeIpc()

  ipcMain.handle('prefs:get', () => getPrefs())
  ipcMain.handle('prefs:set', (_evt, patch: Partial<ReturnType<typeof getPrefs>>) => setPrefs(patch))
}
