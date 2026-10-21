import { MARK_COLORS, MARK_COLOR_NAMES, type MarkColor } from '../shared/markColors'

export function getManualMarkScript(mode: 'highlight' | 'underline' | 'remove', color: MarkColor = 'yellow'): string {
  return `(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !String(selection).trim() || !selection.rangeCount) return { count: 0, reason: 'selection' };
    if (!CSS.highlights || typeof Highlight !== 'function') return { count: 0, reason: 'unsupported' };
    const range = selection.getRangeAt(0).cloneRange();
    const ancestor = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (!ancestor || ancestor.closest('input, textarea, select, button, [contenteditable="true"]')) return { count: 0, reason: 'editable' };
    const names = ${JSON.stringify(MARK_COLOR_NAMES)};
    const colors = ${JSON.stringify(MARK_COLORS)};
    const mode = ${JSON.stringify(mode)};
    const color = ${JSON.stringify(color)};
    const state = window.__cclearManualMarks || (window.__cclearManualMarks = []);
    const intersects = (a, b) => {
      try { return a.comparePoint(b.startContainer, b.startOffset) <= 0 && a.comparePoint(b.endContainer, b.endOffset) >= 0; }
      catch { return false; }
    };
    let removed = 0;
    for (let i = state.length - 1; i >= 0; i--) {
      if (!state[i].range.startContainer.isConnected || intersects(state[i].range, range)) { state.splice(i, 1); removed++; }
    }
    if (mode === 'remove') {
      for (const span of [...document.querySelectorAll('span.cclear-page-sent')]) {
        if (!range.intersectsNode(span)) continue;
        span.replaceWith(...span.childNodes);
        removed++;
      }
    } else {
      state.push({ range, mode, color });
    }
    for (const name of names) CSS.highlights.delete('cclear-user-' + name);
    CSS.highlights.delete('cclear-user-underline');
    for (const name of names) {
      const ranges = state.filter((entry) => entry.mode === 'highlight' && entry.color === name).map((entry) => entry.range);
      if (ranges.length) CSS.highlights.set('cclear-user-' + name, new Highlight(...ranges));
    }
    const underlines = state.filter((entry) => entry.mode === 'underline').map((entry) => entry.range);
    if (underlines.length) CSS.highlights.set('cclear-user-underline', new Highlight(...underlines));
    if (mode !== 'remove' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const rect of [...range.getClientRects()].slice(0, 12)) {
        if (!rect.width || !rect.height) continue;
        const flash = document.createElement('span');
        flash.className = 'cclear-mark-flash';
        flash.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;background:' + (mode === 'underline' ? 'rgba(56,189,248,.28)' : colors[color]) + ';';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 650);
      }
    }
    selection.removeAllRanges();
    return { count: mode === 'remove' ? removed : 1 };
  })()`
}
