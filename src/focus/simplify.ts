import type { PageBlockForSimplify, SimplifyChunk } from '../shared/types'
import { buildReplacementInnerHtml } from './simplifyApplyHtml'

/** minChars ↑ = fewer/smaller prompts; slices cap how many chunks go to the model at once */
export function getExtractChunksScript(minChars = 140, isSearch = false): string {
  return `(() => {
    const isSearch = ${isSearch};
    for (const n of Array.from(document.querySelectorAll('[data-cclear-src-id]'))) {
      n.removeAttribute('data-cclear-src-id');
    }
    const MIN = ${minChars};
    const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','PRE','TEXTAREA','SVG']);
    const avoidSel = 'nav, footer, aside, header, [role="navigation"], [aria-hidden="true"]';
    const widgetSel = '[class*="widget"], [class*="toolbar"], [class*="modal"], [class*="popup"]';
    const contentShell = 'main, article, section, [role="main"], [role="article"], body';
    const SAFE_TAGS = new Set(['P', 'LI', 'BLOCKQUOTE']);
    const SEARCH_TAGS = new Set(['P', 'SPAN', 'DIV']);

    function isLinkHeavy(el) {
      const links = el.querySelectorAll('a[href]');
      if (links.length > 6) return true;
      const total = (el.innerText || '').length;
      if (total === 0) return false;
      let linkTextLen = 0;
      for (const a of links) linkTextLen += (a.innerText || '').length;
      return linkTextLen / total > 0.35;
    }

    function shouldSkipBlock(text, tagName) {
      const t = text.trim();
      if (!t) return true;
      if (/https?:\\/\\//i.test(t)) return true;
      if ((t.match(/www\\./gi) || []).length >= 2) return true;
      const urlish = (t.match(/[a-z0-9-]+\\.(com|org|net|edu|gov|io)\\b/gi) || []).length;
      if (urlish >= 2) return true;
      if (/^\\d{4}\\s*[—–-]/.test(t)) return true;
      if (/^\\d{1,2}\\s+\\w{3,9}\\s+\\d{4}\\s*[—–-]/i.test(t)) return true;
      if (/^did you know\\b/i.test(t)) return true;
      const pipes = (t.match(/[|›]/g) || []).length;
      if (pipes >= 2 && pipes / t.length > 0.02) return true;
      return false;
    }

    function hasInteractiveUI(el) {
      if (el.querySelector('button, input, select, textarea, video, iframe, details, summary, [role="button"]')) return true;
      return isLinkHeavy(el);
    }

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
    const rawBlocks = [];

    function collectFrom(candidates, minLen) {
      for (const el of Array.from(candidates)) {
        if (SKIP.has(el.tagName)) continue;
        if (!isSearch && !SAFE_TAGS.has(el.tagName)) continue;
        if (isSearch && !SEARCH_TAGS.has(el.tagName)) continue;
        if (!el.closest(contentShell)) continue;
        if (el.closest(avoidSel)) continue;
        if (el.closest(widgetSel)) continue;
        if (isSearch && (el.tagName === 'A' || el.querySelector('a'))) continue;
        if (!isSearch && hasInteractiveUI(el)) continue;
        if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
        if (el.querySelector('noscript')) continue;
        const t = (el.innerText || '').trim().replace(/\\s+/g, ' ');
        if (t.length < minLen) continue;
        if (shouldSkipBlock(t, el.tagName.toLowerCase())) continue;
        rawBlocks.push({ el, text: t, tagName: el.tagName.toLowerCase() });
      }
    }

    function queryCandidates() {
      if (isSearch) return document.querySelectorAll('p, span');
      const primary = document.querySelectorAll('article p, [role="main"] p, main p, article li, [role="main"] li, blockquote');
      if (primary.length >= 2) return primary;
      return document.querySelectorAll('p, li, blockquote');
    }

    let candidates = queryCandidates();
    collectFrom(candidates, MIN);

    if (rawBlocks.length === 0) {
      const min2 = Math.max(isSearch ? 40 : 72, MIN - (isSearch ? 50 : 35));
      candidates = isSearch ? document.querySelectorAll('p, span') : document.querySelectorAll('p, li, blockquote');
      collectFrom(candidates, min2);
    }

    if (rawBlocks.length === 0 && document.body) {
      const min3 = isSearch ? 30 : 52;
      const c = isSearch ? document.body.querySelectorAll('p, span') : document.body.querySelectorAll('p, li, blockquote');
      let seen = 0;
      for (const el of Array.from(c)) {
        collectFrom([el], min3);
        if (++seen > 40) break;
      }
    }

    const kept = [];
    for (let i = 0; i < rawBlocks.length; i++) {
      const a = rawBlocks[i];
      let dominated = false;
      for (let j = 0; j < rawBlocks.length; j++) {
        if (i === j) continue;
        const b = rawBlocks[j];
        if (a.el !== b.el && a.el.contains(b.el) && b.text.length >= a.text.length * 0.85) {
          dominated = true;
          break;
        }
        if (a.text === b.text && a.el.contains(b.el)) {
          dominated = true;
          break;
        }
      }
      if (!dominated) kept.push(a);
    }

    const blocks = [];
    for (const item of kept) {
      const id = 'cclear-b-' + idx++;
      item.el.setAttribute('data-cclear-src-id', id);
      const tc = getTextColor(item.el);
      if (tc) item.el.style.setProperty('--cclear-text-color', tc);
      blocks.push({
        id: id,
        text: item.text,
        outerHtmlLength: item.el.outerHTML.length,
        tagName: item.tagName
      });
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
  keyPhrases?: string[]
  boldTerms?: string[]
  /** @deprecated legacy — normalized to keyPhrases/boldTerms at apply time */
  keyPoints?: string[]
  /** Original passage text preserved for expand toggle */
  original?: string
  /** e.g. p, li — used when restoring wrappers to native elements */
  tagName?: string
}

export function buildApplySummariesScript(items: ApplySummaryItem[], isSearch = false): string {
  const payload = items.map((item) => ({
    id: item.id,
    tagName: item.tagName ?? '',
    __html: buildReplacementInnerHtml(item, '', isSearch),
  }))
  const json = JSON.stringify(payload)
  return `(() => {
    const payload = ${json};
    const ARTICLE_TAGS = new Set(['P', 'LI', 'BLOCKQUOTE']);
    const SEARCH_TAGS = new Set(['P', 'SPAN', 'DIV']);
    const ALLOWED = ${isSearch ? 'SEARCH_TAGS' : 'ARTICLE_TAGS'};

    function isLinkHeavy(el) {
      const links = el.querySelectorAll('a[href]');
      if (links.length > 6) return true;
      const total = (el.innerText || '').length;
      if (total === 0) return false;
      let linkTextLen = 0;
      for (const a of links) linkTextLen += (a.innerText || '').length;
      return linkTextLen / total > 0.35;
    }

    let count = 0;
    for (const item of payload) {
      const el = document.querySelector('[data-cclear-src-id="' + item.id + '"]');
      if (!el) continue;
      if (el.getAttribute('data-cclear-simplified')) {
        count++;
        continue;
      }
      const tag = el.tagName;
      if (!ALLOWED.has(tag)) continue;
      if (item.tagName && item.tagName.toUpperCase() !== tag) continue;
      if (el.querySelector('button, input, select, textarea, video, iframe, details, summary, [role="button"]')) continue;
      if (isLinkHeavy(el)) continue;

      const origHtml = el.innerHTML;
      el.setAttribute('data-cclear-original-html', origHtml);
      el.setAttribute('data-cclear-simplified', ${isSearch ? "'inline'" : "'true'"});
      el.innerHTML = item.__html;
      count++;
    }
    return count;
  })();`
}

export function buildRestoreSummariesScript(): string {
  return `(() => {
    const els = Array.from(document.querySelectorAll('[data-cclear-simplified]'));
    for (const el of els) {
      const origHtml = el.getAttribute('data-cclear-original-html');
      if (origHtml != null) {
        el.innerHTML = origHtml;
      }
      el.removeAttribute('data-cclear-simplified');
      el.removeAttribute('data-cclear-original-html');
      el.removeAttribute('data-cclear-src-id');
    }
    for (const el of Array.from(document.querySelectorAll('[data-cclear-src-id]'))) {
      el.removeAttribute('data-cclear-src-id');
    }
  })();`
}
