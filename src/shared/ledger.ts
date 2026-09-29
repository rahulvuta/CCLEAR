export type LedgerEntry = { at: number; host: string; path: string; ok: boolean }
export type LedgerSummary = {
  since: number
  total: number
  hosts: Array<{ host: string; count: number; local: boolean }>
  recent: LedgerEntry[]
}

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/

export function isLocalHost(host: string): boolean {
  return LOCAL.test(host)
}

export function summarize(entries: LedgerEntry[], since: number, recent = 12): LedgerSummary {
  const counts = new Map<string, number>()
  for (const e of entries) counts.set(e.host, (counts.get(e.host) ?? 0) + 1)
  return {
    since,
    total: entries.length,
    hosts: [...counts.entries()].map(([host, count]) => ({ host, count, local: isLocalHost(host) })).sort((a, b) => b.count - a.count),
    recent: entries.slice(-recent).reverse()
  }
}
