export type Command = {
  id: string
  title: string
  /** Secondary text, e.g. a URL or the category. */
  hint?: string
  group: 'Tabs' | 'Parked' | 'Actions' | 'History' | 'Ask'
  /** Extra search terms. */
  keywords?: string
  run: () => void
}

/** Subsequence match with bonuses for word starts and contiguous runs. 0 = no match. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim()
  if (!q) return 1
  const t = text.toLowerCase()
  const direct = t.indexOf(q)
  if (direct >= 0) return 100 - Math.min(60, direct) + (direct === 0 || /\W/.test(t[direct - 1]) ? 30 : 0)
  let ti = 0
  let score = 0
  let run = 0
  for (const ch of q) {
    if (ch === ' ') continue
    const found = t.indexOf(ch, ti)
    if (found < 0) return 0
    run = found === ti ? run + 1 : 0
    score += 2 + run * 2 + (found === 0 || /\W/.test(t[found - 1]) ? 4 : 0)
    ti = found + 1
  }
  return score
}

export function filterCommands(query: string, items: Command[], limit = 12): Command[] {
  if (!query.trim()) return items.slice(0, limit)
  return items
    .map((c) => ({ c, s: Math.max(fuzzyScore(query, c.title), fuzzyScore(query, `${c.keywords ?? ''} ${c.hint ?? ''}`) * 0.6) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.c)
}
