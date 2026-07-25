type IconKind = 'lock' | 'info' | 'search' | 'globe'

export function getOmniboxIconKind(url: string): IconKind {
  const t = url.trim()
  if (!t || t === 'about:blank') return 'globe'
  if (/^https:\/\//i.test(t)) return 'lock'
  if (/^http:\/\//i.test(t)) return 'info'
  if (/google\.com\/search|duckduckgo\.com\/\?|bing\.com\/search/i.test(t)) return 'search'
  if (!t.includes(' ') && (t.includes('.') || /^localhost/i.test(t))) return 'globe'
  return 'search'
}

type Props = {
  url: string
  className?: string
}

export function OmniboxIcon({ url, className = 'omniboxIcon' }: Props) {
  const kind = getOmniboxIconKind(url)

  if (kind === 'lock') {
    return (
      <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    )
  }

  if (kind === 'info') {
    return (
      <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    )
  }

  if (kind === 'search') {
    return (
      <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    )
  }

  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
