export const CHROME_PAGES = {
  bookmarks: 'cclear://bookmarks',
  history: 'cclear://history',
  downloads: 'cclear://downloads',
  settings: 'cclear://settings'
} as const

export type ChromePageKind = keyof typeof CHROME_PAGES

export function isChromePageUrl(url: string): boolean {
  return /^cclear:\/\//i.test(url.trim())
}

export function isInternalUrl(url: string): boolean {
  const t = url.trim()
  return !t || /^about:/i.test(t) || isChromePageUrl(t)
}

export function chromePageKind(url: string): ChromePageKind | null {
  const t = url.trim().toLowerCase().replace(/\/$/, '')
  if (t === CHROME_PAGES.bookmarks) return 'bookmarks'
  if (t === CHROME_PAGES.history) return 'history'
  if (t === CHROME_PAGES.downloads) return 'downloads'
  if (t === CHROME_PAGES.settings) return 'settings'
  return null
}

export function chromePageTitle(url: string): string {
  const kind = chromePageKind(url)
  if (kind === 'bookmarks') return 'Bookmarks'
  if (kind === 'history') return 'History'
  if (kind === 'downloads') return 'Downloads'
  if (kind === 'settings') return 'Settings'
  return 'CCLEAR'
}
