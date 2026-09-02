/**
 * Conservative ad/tracker hosts. Deliberately short and boring: block known third-party ad and
 * tracking services only. Anything that sites commonly need to function (CDNs, login, payments,
 * tag managers, social SDKs) stays unblocked so pages keep working.
 */
export const BLOCKED_HOSTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'google-analytics.com',
  'adnxs.com', 'adsrvr.org', 'advertising.com', 'amazon-adsystem.com', 'criteo.com', 'criteo.net',
  'taboola.com', 'outbrain.com', 'revcontent.com', 'mgid.com', 'zemanta.com',
  'pubmatic.com', 'rubiconproject.com', 'openx.net', 'casalemedia.com', 'indexww.com', 'smartadserver.com',
  'moatads.com', 'adsafeprotected.com', 'doubleverify.com', 'scorecardresearch.com', 'quantserve.com', 'quantcount.com',
  'hotjar.com', 'fullstory.com', 'mouseflow.com', 'crazyegg.com', 'segment.io',
  'ads.yahoo.com', 'adtechus.com', 'yieldmo.com', 'sharethrough.com', 'media.net', 'bidswitch.net', 'contextweb.com',
  'serving-sys.com', 'turn.com', 'bluekai.com', 'demdex.net', 'krxd.net', 'rlcdn.com', 'tapad.com', 'adform.net',
  'ad.gt', 'adcolony.com', 'applovin.com', 'inmobi.com', 'ads-twitter.com', 'analytics.tiktok.com'
]

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function hostMatches(host: string, list: readonly string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`))
}

/** Registrable-ish domain (last two labels, last three for common second-level ccTLDs). */
export function siteOf(host: string): string {
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const sl = new Set(['co', 'com', 'org', 'net', 'ac', 'gov'])
  return sl.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? parts.slice(-3).join('.') : parts.slice(-2).join('.')
}

export type BlockRequest = { url: string; pageUrl: string; resourceType: string }

export function shouldBlock(req: BlockRequest, allowSites: readonly string[] = []): boolean {
  if (req.resourceType === 'mainFrame') return false
  const host = hostOf(req.url)
  if (!host || !hostMatches(host, BLOCKED_HOSTS)) return false
  const pageHost = hostOf(req.pageUrl)
  if (pageHost) {
    // First-party use (you are visiting the ad company's own site) is never blocked.
    if (siteOf(pageHost) === siteOf(host)) return false
    if (hostMatches(pageHost, allowSites)) return false
  }
  return true
}
