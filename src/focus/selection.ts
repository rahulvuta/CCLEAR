/**
 * "Phrase simplification": simplify (and undo) just the text the user selected, one sentence at a time.
 * Everything here is plain strings that run inside the web page; nothing reaches the page's own scripts,
 * and the original text of every changed sentence is kept on the element so it can always be restored.
 */

export const SEL_CLASS = 'cclear-sel'

/** What is selected, and does it already include simplified text? Used to build the right-click menu. */
export function getSelectionProbeScript(): string {
  return `(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !String(sel).trim()) return JSON.stringify({ has: false, simplified: false });
    const range = sel.getRangeAt(0);
    let simplified = false;
    for (const el of document.querySelectorAll('span.${SEL_CLASS}, [data-cclear-simplified]')) {
      if (range.intersectsNode(el)) { simplified = true; break; }
    }
    return JSON.stringify({ has: true, simplified });
  })()`
}

/**
 * Split the selection into sentences and remember exactly where each one is (window.__cclearSel).
 * Text that is already simplified, hidden, or inside a form control is skipped.
 */
export function getCaptureSelectionScript(): string {
  return `(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const BLOCK = 'p, li, blockquote, dd, dt, td, th, h1, h2, h3, h4, h5, h6, figcaption, div';
    const SKIP = 'script, style, noscript, textarea, input, select, button, nav, [contenteditable="true"], .${SEL_CLASS}, [data-cclear-simplified], #cclear-reader';
    const root = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const groups = new Map();
    let n;
    while ((n = walker.nextNode())) {
      if (!range.intersectsNode(n)) continue;
      let s = 0, e = n.nodeValue.length;
      if (n === range.startContainer) s = range.startOffset;
      if (n === range.endContainer) e = range.endOffset;
      if (e <= s) continue;
      const par = n.parentElement;
      if (!par || par.closest(SKIP) || !par.getClientRects().length) continue;
      const block = par.closest(BLOCK) || par;
      if (!groups.has(block)) groups.set(block, []);
      groups.get(block).push({ node: n, start: s, end: e });
    }
    const seg = new Intl.Segmenter(document.documentElement.lang || 'en', { granularity: 'sentence' });
    const registry = {};
    const out = [];
    let idx = 0;
    const stamp = Date.now().toString(36);
    for (const parts of groups.values()) {
      let text = '';
      const spans = [];
      for (const p of parts) { spans.push({ p, from: text.length }); text += p.node.nodeValue.slice(p.start, p.end); }
      for (const sg of seg.segment(text)) {
        const raw = sg.segment;
        const a = sg.index + (raw.length - raw.trimStart().length);
        const b = sg.index + raw.trimEnd().length;
        if (b <= a) continue;
        const pieces = [];
        for (const sp of spans) {
          const from = sp.from, to = sp.from + (sp.p.end - sp.p.start);
          const lo = Math.max(a, from), hi = Math.min(b, to);
          if (hi > lo) pieces.push({ node: sp.p.node, start: sp.p.start + (lo - from), end: sp.p.start + (hi - from) });
        }
        if (!pieces.length) continue;
        const id = '${SEL_CLASS}-' + stamp + '-' + (idx++);
        registry[id] = pieces;
        out.push({ id, text: text.slice(a, b).replace(/\\s+/g, ' ') });
      }
    }
    window.__cclearSel = registry;
    return JSON.stringify({ sentences: out });
  })()`
}

/** Swap each captured sentence for its simplified text. Later text is wrapped first so earlier offsets stay valid. */
export function getApplySelectionScript(results: Array<{ id: string; text: string }>): string {
  return `(() => {
    const reg = window.__cclearSel || {};
    const results = ${JSON.stringify(results)};
    const items = [];
    for (const r of results) {
      const pieces = reg[r.id];
      if (!pieces) continue;
      pieces.forEach((p, i) => items.push({ id: r.id, p, first: i === 0, text: r.text }));
    }
    items.sort((a, b) => {
      if (a.p.node === b.p.node) return b.p.start - a.p.start;
      return (a.p.node.compareDocumentPosition(b.p.node) & Node.DOCUMENT_POSITION_FOLLOWING) ? 1 : -1;
    });
    const done = new Set();
    for (const it of items) {
      const { node, start, end } = it.p;
      if (!node.isConnected || end > node.nodeValue.length) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const orig = range.toString();
      const span = document.createElement('span');
      span.className = '${SEL_CLASS}' + (it.first ? '' : ' ${SEL_CLASS}-empty');
      span.setAttribute('data-cclear-sel-id', it.id);
      span.setAttribute('data-cclear-orig', orig);
      try { range.surroundContents(span); } catch (e) { continue; }
      span.textContent = it.first ? it.text : '';
      done.add(it.id);
    }
    delete window.__cclearSel;
    return done.size;
  })()`
}

/**
 * Undo, sentence by sentence, for whatever the user has selected. Sentences changed by selection are put back
 * exactly; paragraphs changed by Focus mode (which are not stored per sentence) go back whole.
 */
export function getRestoreSelectionScript(): string {
  return `(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !String(sel).trim()) return 0;
    const range = sel.getRangeAt(0);
    const ids = new Set();
    for (const sp of document.querySelectorAll('span.${SEL_CLASS}')) {
      if (range.intersectsNode(sp)) ids.add(sp.getAttribute('data-cclear-sel-id'));
    }
    let n = 0;
    const parents = new Set();
    for (const id of ids) {
      for (const sp of document.querySelectorAll('span.${SEL_CLASS}[data-cclear-sel-id="' + id + '"]')) {
        const t = document.createTextNode(sp.getAttribute('data-cclear-orig') || '');
        parents.add(sp.parentNode);
        sp.replaceWith(t);
      }
      n++;
    }
    for (const p of parents) { try { p.normalize(); } catch (e) {} }
    for (const el of document.querySelectorAll('[data-cclear-simplified]')) {
      if (!range.intersectsNode(el)) continue;
      const orig = el.getAttribute('data-cclear-original-html');
      if (orig == null) continue;
      el.innerHTML = orig;
      for (const a of ['data-cclear-simplified', 'data-cclear-original-html', 'data-cclear-simplified-html', 'data-cclear-view']) el.removeAttribute(a);
      el.setAttribute('data-cclear-user-restored', '');
      n++;
    }
    return n;
  })()`
}

export const SELECTION_CSS = `
  span.${SEL_CLASS}:not(.${SEL_CLASS}-empty) { background: rgba(90, 130, 160, 0.14); border-radius: 3px; box-decoration-break: clone; }
  span.${SEL_CLASS}-empty { display: none !important; }
`
