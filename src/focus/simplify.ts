import type { PageBlockForSimplify, SimplifyChunk } from '../shared/types'
import { EXTRACT_FILTER_JS } from './blockFilters'
import { buildReplacementInnerHtml } from './simplifyApplyHtml'

/** minChars ↑ = fewer/smaller prompts; slices cap how many chunks go to the model at once */
export function getExtractChunksScript(minChars = 140, isSearch = false): string {
  return `(() => {
    ${EXTRACT_FILTER_JS}
    const isSearch = ${isSearch};
    for (const n of Array.from(document.querySelectorAll('[data-cclear-src-id]'))) {
      n.removeAttribute('data-cclear-src-id');
    }
    const MIN = ${minChars};
    const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','PRE','TEXTAREA','SVG']);
    const avoidSel = 'nav, footer, aside, header, [role="navigation"], [aria-hidden="true"], .ambox, .hatnote, .reflist, .mw-references-wrap, .mw-editsection, .navbox, .catlinks';
    const chromeSel = 'time, cite, [role="citation"]';
    const contentShell = 'main, article, section, [role="main"], [role="article"], body';
    function getTextColor(node) {
      if (node.nodeType === 3 && node.textContent.trim().length > 0) {
        return window.getComputedStyle(node.parentElement).color;
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        const c = getTextColor(node.childNodes[i]);
        if (c) return c;
      }
      return node.nodeType === 1 ? window.getComputedStyle(node).color : null;
    }

    let idx = 0;
    const blocks = [];
    function pushBlock(el, minLen) {
      if (SKIP.has(el.tagName)) return;
      if (el.closest('[data-cclear-simplified]')) return;
      if (!el.closest(contentShell)) return;
      if (el.closest(avoidSel)) return;
      if (el.closest(chromeSel)) return;
      if (el.tagName === 'TIME') return;
      var cls = String(el.className || '').toLowerCase();
      if (/byline|share-row|sharebar|social-share/.test(cls)) return;
      if (isSearch && (el.tagName === 'A' || el.querySelector('a'))) return;
      if (el.parentElement && el.parentElement.closest('[data-cclear-src-id]')) return;
      if (el.offsetWidth === 0 && el.offsetHeight === 0) return;
      if (el.querySelector('noscript')) return;
      const t = (el.innerText || '').trim().replace(/\\s+/g, ' ');
      if (t.length < minLen) return;
      if (shouldSkipChromeText(t)) return;
      if (!isProseBlock(t)) return;
      
      const id = 'cclear-b-' + idx++;
      el.setAttribute('data-cclear-src-id', id);
      
      const tc = getTextColor(el);
      if (tc) el.style.setProperty('--cclear-text-color', tc);

      blocks.push({
        id: id,
        text: t,
        outerHtmlLength: el.outerHTML.length,
        tagName: el.tagName.toLowerCase()
      });
    }
    let candidates;
    if (isSearch) {
      candidates = document.querySelectorAll('p, [data-sncf], .VwiC3b, .result__snippet, .b_caption p, .snippet');
    } else {
      candidates = document.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, figcaption');
    }
    for (const el of Array.from(candidates)) {
      pushBlock(el, MIN);
    }
    if (blocks.length === 0) {
      const min2 = Math.max(isSearch ? 40 : 72, MIN - (isSearch ? 50 : 35));
      for (const el of Array.from(candidates)) {
        pushBlock(el, min2);
      }
    }
    if (blocks.length === 0 && document.body) {
      var min3 = isSearch ? 30 : 52;
      var seen = 0;
      const c = document.body.querySelectorAll('p');
      for (var el of Array.from(c)) {
        pushBlock(el, min3);
        if (++seen > 40) break;
      }
    }
    return blocks;
  })();`
}

export function pageBlocksToSimplifyChunks(blocks: PageBlockForSimplify[]): SimplifyChunk[] {
  return blocks.map((b) => ({ id: b.id, text: b.text }))
}

export type ApplySummaryItem = {
  id: string
  summary: string
  highlightPhrases?: string[]
  termEmphasis?: string[]
  /** Original passage text preserved for expand toggle */
  original?: string
  /** e.g. p, li — used when restoring wrappers to native elements */
  tagName?: string
}

/** Same page for Focus cache: ignore hash so address-bar vs load URL still match. */
export function focusSimplifyPageUrl(url: string): string {
  const t = (url || '').trim() || 'about:blank'
  try {
    const u = new URL(t)
    u.hash = ''
    return u.href
  } catch {
    return t
  }
}

export function focusSimplifyCacheKey(tabId: string, url: string): string {
  return `${tabId}|v8|${focusSimplifyPageUrl(url)}`
}

export function sameFocusSimplifyPage(a: string, b: string): boolean {
  return focusSimplifyPageUrl(a) === focusSimplifyPageUrl(b)
}

export function buildApplySummariesScript(items: ApplySummaryItem[], isSearch = false): string {
  const payload = items.map((item) => ({
    id: item.id,
    original: item.original ?? '',
    tagName: item.tagName ?? '',
    __html: buildReplacementInnerHtml(item, '', isSearch),
  }))
  const json = JSON.stringify(payload)
  return `(() => {
    const payload = ${json};
    function normText(t) {
      return String(t || '').trim().replace(/\\s+/g, ' ');
    }
    function findByOriginal(item) {
      const want = normText(item.original);
      if (!want) return null;
      const tag = String(item.tagName || '').toLowerCase();
      const sel = /^[a-z][a-z0-9]*$/.test(tag)
        ? tag
        : 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, figcaption';
      const nodes = document.querySelectorAll(sel);
      for (const el of Array.from(nodes)) {
        if (el.getAttribute('data-cclear-simplified')) continue;
        if (normText(el.innerText) === want) return el;
      }
      return null;
    }
    let count = 0;
    for (const item of payload) {
      let el = item.id ? document.querySelector('[data-cclear-src-id="' + item.id + '"]') : null;
      if (!el) el = findByOriginal(item);
      if (!el) continue;
      if (item.id) el.setAttribute('data-cclear-src-id', item.id);
      if (el.getAttribute('data-cclear-simplified')) {
        count++;
        continue;
      }

      const origHtml = el.innerHTML;
      el.setAttribute('data-cclear-original-html', origHtml);
      el.setAttribute('data-cclear-simplified', 'inline');
      el.innerHTML = item.__html;
      count++;
    }
    return count;
  })();`
}

export function buildRestoreSummariesScript(): string {
  return `(() => {
    document.documentElement.removeAttribute('data-cclear-focus-complete');
    const els = Array.from(document.querySelectorAll('[data-cclear-simplified]'));
    for (const el of els) {
      const origHtml = el.getAttribute('data-cclear-original-html');
      if (origHtml != null) {
        el.innerHTML = origHtml;
      }
      el.removeAttribute('data-cclear-simplified');
      el.removeAttribute('data-cclear-original-html');
    }
  })();`
}
