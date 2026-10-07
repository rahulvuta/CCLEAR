/** Schemes a tab may navigate to. Everything else (file:, javascript:, data:, custom) is refused. */
const WEB_PROTOCOLS = new Set(['http:', 'https:'])

export function parseWebUrl(raw: string): URL | null {
  try {
    const u = new URL(raw)
    return WEB_PROTOCOLS.has(u.protocol) ? u : null
  } catch {
    return null
  }
}

/** http(s) pages and the blank tab. */
export function isAllowedNavigationUrl(raw: string): boolean {
  if (raw === 'about:blank') return true
  return parseWebUrl(raw) !== null
}

/** Permissions a web page may use without asking the user. */
export const SILENT_PERMISSIONS = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write'])

/** Permissions we ask about once per origin. */
export const PROMPTED_PERMISSIONS = new Set(['media', 'geolocation', 'notifications'])
