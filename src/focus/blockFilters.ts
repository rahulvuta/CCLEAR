/** Chrome / SERP noise that must never be rewritten as a “simplification.” */

const URL_RE = /https?:\/\/\S+/i
const WWW_RE = /\bwww\.[\w.-]+\.[a-z]{2,}\b/i
const BREADCRUMB_RE = /›|»|→|\s\/\s.+\s\/\s/
const PUBLISHER_RE = /\(\.gov\)|\.gov\b|\bhttps?:\/\/|\bsource:\s|\bvia\s+[A-Z]/i
const DATE_ONLY_RE =
  /^(published|updated|posted)?\s*(on\s*)?((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{4}-\d{2}-\d{2})\s*$/i

export function looksLikeUrl(text: string): boolean {
  return URL_RE.test(text) || WWW_RE.test(text)
}

export function looksLikeBreadcrumb(text: string): boolean {
  return BREADCRUMB_RE.test(text) || (text.split('›').length >= 2 && text.length < 220)
}

export function looksLikePublisherChrome(text: string): boolean {
  const t = text.trim()
  if (/\(\.(gov|edu|org|mil)\)/i.test(t)) return true
  if (PUBLISHER_RE.test(t) && looksLikeUrl(t)) return true
  return false
}

export function looksLikeDateOnlyByline(text: string): boolean {
  const t = text.trim()
  if (t.length > 48) return false
  return DATE_ONLY_RE.test(t)
}

export function shouldSkipChromeText(text: string): boolean {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return true
  if (looksLikeUrl(t)) return true
  if (looksLikeBreadcrumb(t)) return true
  if (looksLikePublisherChrome(t)) return true
  if (looksLikeDateOnlyByline(t)) return true
  return false
}

/** Real sentences / snippets, not cite lines or nav crumbs. */
export function isProseBlock(text: string): boolean {
  if (shouldSkipChromeText(text)) return false
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w))
  return words.length >= 6
}

export function blockRankScore(block: { text: string; tagName: string }): number {
  const t = block.text.trim()
  let score = 0
  if (/[.?!]/.test(t)) score += 40
  const tag = block.tagName.toLowerCase()
  if (tag === 'p') score += 28
  if (tag === 'li' || tag === 'blockquote') score += 18
  if (/^h[1-6]$/.test(tag)) score += 8
  score += Math.min(t.length, 360) / 40
  if (looksLikeUrl(t) || looksLikeBreadcrumb(t)) score -= 80
  return score
}

export function selectBlocksForSimplify<T extends { text: string; tagName: string }>(
  blocks: T[],
  max: number
): T[] {
  return blocks
    .filter((b) => isProseBlock(b.text))
    .sort((a, b) => blockRankScore(b) - blockRankScore(a))
    .slice(0, max)
}

/**
 * Same predicates as above, inlined for webview executeJavaScript.
 * Keep behavior aligned with the TypeScript exports.
 */
export const EXTRACT_FILTER_JS = `
function looksLikeUrl(t) {
  return /https?:\\/\\/\\S+/i.test(t) || /\\bwww\\.[\\w.-]+\\.[a-z]{2,}\\b/i.test(t);
}
function looksLikeBreadcrumb(t) {
  return /›|»|→|\\s\\/\\s.+\\s\\/\\s/.test(t) || (t.split('›').length >= 2 && t.length < 220);
}
function looksLikePublisherChrome(t) {
  return /\\(\\.(gov|edu|org|mil)\\)/i.test(t);
}
function looksLikeDateOnlyByline(t) {
  if (t.length > 48) return false;
  return /^(published|updated|posted)?\\s*(on\\s*)?((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})\\s*$/i.test(t);
}
function shouldSkipChromeText(t) {
  t = String(t || '').trim().replace(/\\s+/g, ' ');
  if (!t) return true;
  if (looksLikeUrl(t)) return true;
  if (looksLikeBreadcrumb(t)) return true;
  if (looksLikePublisherChrome(t)) return true;
  if (looksLikeDateOnlyByline(t)) return true;
  return false;
}
function isProseBlock(t) {
  if (shouldSkipChromeText(t)) return false;
  var words = t.trim().split(/\\s+/).filter(function(w) { return /[A-Za-z]/.test(w); });
  return words.length >= 6;
}
`
