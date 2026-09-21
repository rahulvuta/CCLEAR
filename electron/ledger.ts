import { ipcMain } from 'electron'
import { summarize, type LedgerEntry } from '../src/shared/ledger'

const entries: LedgerEntry[] = []
const since = Date.now()

/**
 * Records every request CCLEAR's own main process makes (model calls, optional lookups).
 * It deliberately does not include the pages you browse: those are the websites' requests, not CCLEAR's.
 * Only host and path are kept, never query strings or bodies.
 */
export function installLedger() {
  const original = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let host = 'unknown'
    let path = ''
    try {
      const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
      host = u.host
      path = u.pathname
    } catch {
      /* leave unknown */
    }
    try {
      const res = await original(input, init)
      entries.push({ at: Date.now(), host, path, ok: res.ok })
      return res
    } catch (e) {
      entries.push({ at: Date.now(), host, path, ok: false })
      throw e
    } finally {
      if (entries.length > 2000) entries.splice(0, 500)
    }
  }) as typeof fetch

  ipcMain.handle('ledger:get', () => summarize(entries, since))
}
