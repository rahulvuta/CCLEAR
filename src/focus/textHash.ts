/** Normalize block text for stable cache keys (renderer + main). */
export function normalizeBlockText(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

/** Fast deterministic hash — works in renderer and main without node:crypto. */
export function blockTextHash(text: string): string {
  const norm = normalizeBlockText(text)
  let h1 = 0x811c9dc5
  let h2 = 0
  for (let i = 0; i < norm.length; i++) {
    const c = norm.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = ((h2 << 5) - h2 + c) | 0
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}
