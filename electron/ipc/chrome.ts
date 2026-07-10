import { app, ipcMain, session, shell, BrowserWindow } from 'electron'
import path from 'node:path'
import type { BookmarkWrite, DownloadRecord, SessionTab } from '../../src/shared/types'
import {
  addBookmark,
  addHistory,
  clearHistory,
  getSession,
  listBookmarks,
  listDownloads,
  listHistory,
  moveBookmark,
  popClosed,
  pushClosed,
  removeBookmark,
  saveSession,
  searchHistory,
  updateBookmark,
  upsertDownload
} from './browserStore'

const activeDownloads = new Map<string, Electron.DownloadItem>()
let downloadsHooked = false

function broadcast(channel: string, payload?: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function hookDownloads() {
  if (downloadsHooked) return
  downloadsHooked = true
  const ses = session.fromPartition('persist:adhd-browser')
  ses.on('will-download', (_event, item) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const filename = item.getFilename()
    const savePath = path.join(app.getPath('downloads'), filename)
    item.setSavePath(savePath)
    activeDownloads.set(id, item)
    const startedAt = Date.now()

    const snapshot = (state: DownloadRecord['state']): DownloadRecord => ({
      id,
      filename,
      url: item.getURL(),
      state,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      savePath: item.getSavePath() || savePath,
      startedAt
    })

    upsertDownload(snapshot('progressing'))
    broadcast('downloads:changed', listDownloads())

    item.on('updated', (_e, state) => {
      upsertDownload(snapshot(state === 'interrupted' ? 'interrupted' : 'progressing'))
      broadcast('downloads:changed', listDownloads())
    })
    item.on('done', (_e, state) => {
      upsertDownload(
        snapshot(state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted')
      )
      activeDownloads.delete(id)
      broadcast('downloads:changed', listDownloads())
    })
  })
}

export function registerChromeIpc() {
  hookDownloads()

  ipcMain.handle('bookmarks:list', () => listBookmarks())
  ipcMain.handle('bookmarks:add', (_e, input: BookmarkWrite) => addBookmark(input))
  ipcMain.handle(
    'bookmarks:update',
    (_e, id: string, patch: { title?: string; url?: string; parentId?: string | null; order?: number }) =>
      updateBookmark(id, patch)
  )
  ipcMain.handle('bookmarks:remove', (_e, id: string) => removeBookmark(id))
  ipcMain.handle('bookmarks:move', (_e, id: string, parentId: string | null, order: number) =>
    moveBookmark(id, parentId, order)
  )

  ipcMain.handle('history:list', () => listHistory())
  ipcMain.handle('history:search', (_e, query: string) => searchHistory(query ?? ''))
  ipcMain.handle('history:clear', () => {
    clearHistory()
    return listHistory()
  })
  ipcMain.handle('history:add', (_e, entry: { url: string; title: string; favicon?: string }) =>
    addHistory(entry)
  )

  ipcMain.handle('downloads:list', () => listDownloads())
  ipcMain.handle('downloads:cancel', (_e, id: string) => {
    activeDownloads.get(id)?.cancel()
    return listDownloads()
  })
  ipcMain.handle('downloads:showInFolder', async (_e, id: string) => {
    const rec = listDownloads().find((d) => d.id === id)
    if (!rec?.savePath) return false
    shell.showItemInFolder(rec.savePath)
    return true
  })
  ipcMain.handle('downloads:open', async (_e, id: string) => {
    const rec = listDownloads().find((d) => d.id === id)
    if (!rec?.savePath) return false
    const err = await shell.openPath(rec.savePath)
    return !err
  })

  ipcMain.handle('session:get', () => getSession())
  ipcMain.handle('session:save', (_e, payload: { tabs: SessionTab[]; activeId: string }) =>
    saveSession(payload)
  )
  ipcMain.handle('session:pushClosed', (_e, tab: SessionTab) => pushClosed(tab))
  ipcMain.handle('session:popClosed', () => popClosed())
}
