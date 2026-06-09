import type { PageBlockForSimplify, SimplifyChunk } from '../shared/types'
import { buildReplacementInnerHtml } from './simplifyApplyHtml'

/** minChars ↑ = fewer/smaller prompts; slices cap how many chunks go to the model at once */
export function getExtractChunksScript(minChars = 140): string {
  return `(() => {
    for (const n of Array.from(document.querySelectorAll('[data-adhd-src-id]'))) {
      n.removeAttribute('data-adhd-src-id');
    }
    const MIN = ${minChars};
    const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','PRE','TEXTAREA','SVG']);
    const avoidSel = 'nav, footer, aside, header, [role="navigation"], [aria-hidden="true"]';
    const contentShell = 'main, article, section, [role="main"], [role="article"], body';
    let idx = 0;
    const blocks = [];
    function pushBlock(el, minLen) {
      if (SKIP.has(el.tagName)) return;
      if (!el.closest(contentShell)) return;
      if (el.closest(avoidSel)) return;
      const t = (el.textContent || '').trim().replace(/\\s+/g, ' ');
      if (t.length < minLen) return;
      const id = 'adhd-b-' + idx++;
      el.setAttribute('data-adhd-src-id', id);
      blocks.push({
        id: id,
        text: t,
        outerHtmlLength: el.outerHTML.length,
        tagName: el.tagName.toLowerCase()
      });
    }
    const candidates = document.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, figcaption');
    for (const el of Array.from(candidates)) {
      pushBlock(el, MIN);
    }
    if (blocks.length === 0) {
      const min2 = Math.max(72, MIN - 35);
      for (const el of Array.from(document.querySelectorAll('p, li, h1, h2, h3, blockquote'))) {
        pushBlock(el, min2);
      }
    }
    if (blocks.length === 0 && document.body) {
      var min3 = 52;
      var seen = 0;
      for (var el of Array.from(document.body.querySelectorAll('p'))) {
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
  keyPoints?: string[]
  /** Original passage text preserved for expand toggle */
  original?: string
  /** e.g. p, li — used when restoring wrappers to native elements */
  tagName?: string
}

export function buildApplySummariesScript(items: ApplySummaryItem[]): string {
  const payload = items.map((item) => ({
    id: item.id,
    __html: buildReplacementInnerHtml(item, ''),
  }))
  const json = JSON.stringify(payload)
  return `(() => {
    const payload = ${json};
    for (const item of payload) {
      const el = document.querySelector('[data-adhd-src-id="' + item.id + '"]');
      if (!el) continue;
      if (el.getAttribute('data-adhd-simplified') === 'true') continue;

      const origHtml = el.innerHTML;
      el.setAttribute('data-adhd-original-html', origHtml);
      el.setAttribute('data-adhd-simplified', 'true');
      el.innerHTML = item.__html;
    }
  })();`
}

export function buildRestoreSummariesScript(): string {
  return `(() => {
    const els = Array.from(document.querySelectorAll('[data-adhd-simplified="true"]'));
    for (const el of els) {
      const origHtml = el.getAttribute('data-adhd-original-html');
      if (origHtml != null) {
        el.innerHTML = origHtml;
      }
      el.removeAttribute('data-adhd-simplified');
      el.removeAttribute('data-adhd-original-html');
    }
  })();`
}
