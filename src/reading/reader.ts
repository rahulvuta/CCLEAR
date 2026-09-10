import type { ReaderContent, ReaderSummary, ReadingPrefs } from '../shared/reading'
import { FONT_STACKS, TINTS } from './styles'

/** Runs in the page. Reads the DOM only; never modifies it. */
export function getReaderExtractScript(): string {
  return `(() => {
    const AVOID = 'nav, aside, footer, header nav, form, [role="navigation"], [role="complementary"], [aria-hidden="true"], .reflist, .navbox, .mw-editsection, .hatnote, .ambox, .toc, #toc, .sidebar, .advert, .ad, [class*="cookie"], [class*="newsletter"], [class*="share"], figure figcaption + *';
    const pick = () => {
      const direct = document.querySelector('article') || document.querySelector('[role="main"]') || document.querySelector('main') || document.querySelector('#mw-content-text');
      if (direct && (direct.innerText || '').length > 400) return direct;
      let best = null, bestScore = 0;
      for (const el of document.querySelectorAll('div, section')) {
        let score = 0;
        for (const p of el.querySelectorAll(':scope > p, :scope > div > p')) {
          if (p.closest(AVOID)) continue;
          score += (p.innerText || '').length;
        }
        if (score > bestScore) { best = el; bestScore = score; }
      }
      return best || document.body;
    };
    const root = pick();
    const blocks = [];
    let total = 0, last = '';
    const clean = (t) => t.replace(/\\[\\s*(\\d+|[a-z]|citation needed|edit)\\s*\\]/gi, '').replace(/\\s+/g, ' ').trim();
    for (const el of root.querySelectorAll('h1, h2, h3, p, li, blockquote')) {
      if (el.closest(AVOID)) continue;
      if (el.tagName === 'LI' && el.querySelector('p')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const t = clean(el.innerText || '');
      const tag = el.tagName.toLowerCase();
      const isHead = tag === 'h1' || tag === 'h2' || tag === 'h3';
      if (isHead ? t.length < 3 : t.length < 25) continue;
      if (t === last) continue;
      last = t;
      blocks.push({ tag, text: t.slice(0, 2500) });
      total += t.length;
      if (blocks.length >= 400 || total > 60000) break;
    }
    return JSON.stringify({ title: document.title || '', url: location.href, blocks });
  })()`
}

export const READER_ID = 'cclear-reader'

export function getHideReaderScript(): string {
  return `(() => {
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    const el = document.getElementById(${JSON.stringify(READER_ID)});
    if (el) el.remove();
    document.documentElement.style.overflow = '';
    return true;
  })()`
}

/** Fills the reader's summary box once the local model answers. Text only, via textContent. */
export function getReaderSummaryScript(summary: ReaderSummary): string {
  return `(() => {
    const host = document.getElementById(${JSON.stringify(READER_ID)});
    if (!host || !host.shadowRoot) return false;
    const box = host.shadowRoot.getElementById('tldr');
    if (!box) return false;
    const s = ${JSON.stringify(summary)};
    box.textContent = '';
    box.classList.remove('pending');
    const h = document.createElement('div'); h.className = 'label'; h.textContent = s.fromModel ? 'Quick summary · written on your Mac' : 'Quick summary';
    const p = document.createElement('p'); p.className = 'tldr'; p.textContent = s.tldr;
    box.append(h, p);
    if (s.points.length) {
      const ul = document.createElement('ul');
      for (const t of s.points) { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }
      box.appendChild(ul);
    }
    return true;
  })()`
}

export function getShowReaderScript(content: ReaderContent, prefs: ReadingPrefs): string {
  const font = prefs.font === 'site' ? FONT_STACKS.serif : FONT_STACKS[prefs.font]
  const tint = prefs.tint === 'none' ? { bg: '#fbf8f1', fg: '#262522' } : TINTS[prefs.tint]
  const dark = prefs.tint === 'night'
  const css = `
    :host { all: initial; }
    .wrap { position: fixed; inset: 0; z-index: 2147483647; overflow-y: auto; background: ${tint.bg}; color: ${tint.fg}; font-family: ${font}; }
    .bar { position: sticky; top: 0; display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 10px 16px; background: ${tint.bg}; border-bottom: 1px solid ${dark ? '#2b3035' : '#e4dfd2'}; font: 13px system-ui, sans-serif; }
    .bar button { font: inherit; padding: 6px 12px; border-radius: 16px; border: 1px solid ${dark ? '#3b4247' : '#d4cdb8'}; background: transparent; color: inherit; cursor: pointer; }
    .bar button:hover { background: ${dark ? '#242a2e' : '#efe9d6'}; }
    .bar button:focus-visible { outline: 2px solid #5a82a0; outline-offset: 2px; }
    .bar .primary { background: #5a82a0; border-color: #5a82a0; color: #fff; }
    article { max-width: ${prefs.narrow ? '68ch' : '86ch'}; margin: 0 auto; padding: 28px 20px 120px; font-size: ${prefs.size}%; line-height: ${prefs.lineHeight}; letter-spacing: ${prefs.letterSpacing}em; }
    h1 { font-size: 1.9em; line-height: 1.2; margin: 0 0 .6em; }
    h2 { font-size: 1.35em; margin: 1.6em 0 .4em; } h3 { font-size: 1.12em; margin: 1.3em 0 .3em; }
    p, li, blockquote { margin: 0 0 1em; } blockquote { padding-left: 14px; border-left: 3px solid #5a82a0; font-style: italic; }
    ul { padding-left: 1.2em; }
    #tldr { border-radius: 14px; padding: 14px 18px; margin: 0 0 1.8em; background: ${dark ? '#1f2428' : '#f0eadb'}; font-size: .95em; }
    #tldr .label { font: 600 11px system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; opacity: .7; margin-bottom: 6px; }
    #tldr .tldr { font-weight: 600; margin-bottom: .6em; } #tldr ul { margin: 0; } #tldr li { margin-bottom: .35em; }
    .speaking { background: ${dark ? '#2a3a47' : '#dcebf5'}; border-radius: 6px; }
    .pending { opacity: .6; font-style: italic; }
  `
  return `(() => {
    const ID = ${JSON.stringify(READER_ID)};
    const old = document.getElementById(ID); if (old) old.remove();
    const data = ${JSON.stringify(content)};
    const host = document.createElement('div'); host.id = ID;
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = ${JSON.stringify(css)};
    const wrap = document.createElement('div'); wrap.className = 'wrap'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'Reader view');
    const bar = document.createElement('div'); bar.className = 'bar';
    const left = document.createElement('div'); left.textContent = 'Reader view · your original page is untouched';
    const right = document.createElement('div'); right.style.display = 'flex'; right.style.gap = '8px';
    const listen = document.createElement('button'); listen.textContent = 'Listen';
    const close = document.createElement('button'); close.className = 'primary'; close.textContent = 'Original page (Esc)';
    right.append(listen, close); bar.append(left, right);
    const art = document.createElement('article');
    const h1 = document.createElement('h1'); h1.textContent = data.title || 'Untitled'; art.appendChild(h1);
    const tl = document.createElement('section'); tl.id = 'tldr'; tl.className = 'pending'; tl.setAttribute('aria-live', 'polite'); tl.textContent = 'Summarizing…'; art.appendChild(tl);
    const els = [];
    let list = null;
    for (const b of data.blocks) {
      if (b.tag === 'li') {
        if (!list) { list = document.createElement('ul'); art.appendChild(list); }
        const li = document.createElement('li'); li.textContent = b.text; list.appendChild(li); els.push(li); continue;
      }
      list = null;
      if (b.tag === 'h1' && b.text === data.title) continue;
      const el = document.createElement(b.tag); el.textContent = b.text; art.appendChild(el); els.push(el);
    }
    wrap.append(bar, art); root.append(style, wrap);
    document.documentElement.appendChild(host);
    document.documentElement.style.overflow = 'hidden';

    const synth = window.speechSynthesis; let idx = -1, speaking = false;
    const clear = () => els.forEach((e) => e.classList.remove('speaking'));
    const stop = () => { speaking = false; try { synth.cancel(); } catch (e) {} clear(); listen.textContent = 'Listen'; };
    const next = () => {
      if (!speaking || idx >= els.length) { stop(); return; }
      const el = els[idx]; clear(); el.classList.add('speaking'); el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const u = new SpeechSynthesisUtterance(el.textContent); u.rate = 0.95;
      u.onend = () => { idx++; next(); }; u.onerror = () => stop();
      synth.speak(u);
    };
    listen.addEventListener('click', () => {
      if (!synth) return;
      if (speaking) { stop(); return; }
      speaking = true; idx = Math.max(0, idx); listen.textContent = 'Stop'; next();
    });
    const closeIt = () => { stop(); host.remove(); document.documentElement.style.overflow = ''; document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') closeIt(); };
    close.addEventListener('click', closeIt);
    document.addEventListener('keydown', onKey, true);
    close.focus();
    return data.blocks.length;
  })()`
}

/** Plain-text view of the article used for summarising. */
export function readerText(content: ReaderContent, max = 6000): string {
  const out: string[] = []
  let n = 0
  for (const b of content.blocks) {
    if (n > max) break
    out.push(b.text)
    n += b.text.length
  }
  return out.join('\n').slice(0, max)
}
