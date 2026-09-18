/**
 * Order blocks for simplification so what the reader can see gets rewritten first:
 * on-screen blocks (top to bottom), then below the fold (nearest first), then above it.
 * Blocks without a position keep their relative order after the visible ones.
 */
export function viewportFirst<T extends { y?: number }>(blocks: T[], scrollY: number, viewportH: number): T[] {
  const margin = 60
  const top = scrollY - margin
  const bottom = scrollY + viewportH + margin
  const visible: T[] = []
  const below: T[] = []
  const above: T[] = []
  const unknown: T[] = []
  for (const b of blocks) {
    if (typeof b.y !== 'number') unknown.push(b)
    else if (b.y >= top && b.y <= bottom) visible.push(b)
    else if (b.y > bottom) below.push(b)
    else above.push(b)
  }
  const byY = (a: T, b: T) => (a.y as number) - (b.y as number)
  return [...visible.sort(byY), ...below.sort(byY), ...above.sort((a, b) => byY(b, a)), ...unknown]
}
