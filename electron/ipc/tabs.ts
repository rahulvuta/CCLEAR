import { ipcMain } from 'electron'

/**
 * Tabs are managed in renderer; this module exists so we can attach more
 * privileged tab handling later without restructuring.
 */
export function registerTabsIpc() {
  ipcMain.handle('tabs:noop', async () => {
    return { ok: true }
  })
}
