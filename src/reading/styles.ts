import type { ReadingPrefs } from '../shared/reading'

export const FONT_STACKS: Record<Exclude<ReadingPrefs['font'], 'site'>, string> = {
  sans: '"Atkinson Hyperlegible", "Helvetica Neue", Verdana, Arial, sans-serif',
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  rounded: '"SF Pro Rounded", "Nunito", "Trebuchet MS", ui-rounded, sans-serif',
  mono: '"SF Mono", Menlo, Consolas, monospace'
}

export const TINTS: Record<Exclude<ReadingPrefs['tint'], 'none'>, { bg: string; fg: string }> = {
  sepia: { bg: '#f4ecd8', fg: '#433422' },
  cream: { bg: '#fbf7ee', fg: '#2d2a24' },
  night: { bg: '#15181b', fg: '#d5dade' }
}

const TEXT = 'p, li, blockquote, dd, figcaption, h1, h2, h3, h4, h5, h6'

export function buildReadingCss(prefs: ReadingPrefs): string {
  if (!prefs.enabled) return ''
  const parts: string[] = []
  const scope = 'main, article, [role="main"], #content, #mw-content-text, .post, .entry-content'
  const sel = (inner: string) => `html.cclear-read :is(${scope}) :is(${inner})`
  // Fall back to the whole body for pages without an obvious content container.
  const body = (inner: string) => `html.cclear-read-nocontent body :is(${inner})`
  const rules = (selector: (s: string) => string) => {
    const decl: string[] = [`line-height: ${prefs.lineHeight} !important`, `letter-spacing: ${prefs.letterSpacing}em !important`]
    if (prefs.font !== 'site') decl.push(`font-family: ${FONT_STACKS[prefs.font]} !important`)
    if (prefs.size !== 100) decl.push(`font-size: ${prefs.size}% !important`)
    parts.push(`${selector('p, li, blockquote, dd, figcaption')} { ${decl.join('; ')}; }`)
    if (prefs.font !== 'site') parts.push(`${selector('h1, h2, h3, h4, h5, h6')} { font-family: ${FONT_STACKS[prefs.font]} !important; letter-spacing: ${prefs.letterSpacing}em !important; }`)
    if (prefs.narrow) parts.push(`${selector('p, li, blockquote')} { max-width: 68ch !important; }`)
  }
  rules(sel)
  rules(body)
  if (prefs.tint !== 'none') {
    const t = TINTS[prefs.tint]
    parts.push(`html.cclear-read, html.cclear-read body { background: ${t.bg} !important; color: ${t.fg} !important; }`)
    parts.push(`html.cclear-read :is(${TEXT}) { color: ${t.fg} !important; }`)
  }
  if (prefs.dim) {
    parts.push(`html.cclear-dim :is(p, li, blockquote):not([data-cclear-current]) { opacity: 0.32 !important; transition: opacity .15s; }`)
    parts.push(`html.cclear-dim [data-cclear-current] { opacity: 1 !important; }`)
  }
  parts.push(`#cclear-ruler { position: fixed; left: 0; right: 0; height: 2.4em; top: -100px; pointer-events: none; z-index: 2147483646; box-shadow: 0 0 0 100vmax rgba(10, 12, 14, 0.34); border-top: 2px solid rgba(90,130,160,.7); border-bottom: 2px solid rgba(90,130,160,.7); display: none; }`)
  return parts.join('\n')
}

/** Idempotent: safe to run on every page load and every settings change. */
export function getApplyReadingScript(prefs: ReadingPrefs): string {
  const css = buildReadingCss(prefs)
  return `(() => {
    const d = document, root = d.documentElement;
    let style = d.getElementById('cclear-read-style');
    if (!style) { style = d.createElement('style'); style.id = 'cclear-read-style'; (d.head || root).appendChild(style); }
    style.textContent = ${JSON.stringify(css)};
    const on = ${JSON.stringify(prefs.enabled)};
    root.classList.toggle('cclear-read', on);
    root.classList.toggle('cclear-dim', on && ${JSON.stringify(prefs.dim)});
    root.classList.toggle('cclear-read-nocontent', on && !d.querySelector('main, article, [role="main"], #content, #mw-content-text, .post, .entry-content'));

    let ruler = d.getElementById('cclear-ruler');
    const wantRuler = on && ${JSON.stringify(prefs.ruler)};
    if (wantRuler && !ruler) { ruler = d.createElement('div'); ruler.id = 'cclear-ruler'; (d.body || root).appendChild(ruler); }
    if (ruler) ruler.style.display = wantRuler ? 'block' : 'none';

    if (!window.__cclearReadHandlers) {
      window.__cclearReadHandlers = true;
      d.addEventListener('mousemove', (e) => {
        const r = d.getElementById('cclear-ruler');
        if (r && r.style.display !== 'none') r.style.top = Math.max(0, e.clientY - r.offsetHeight / 2) + 'px';
        if (root.classList.contains('cclear-dim')) {
          const el = e.target && e.target.closest ? e.target.closest('p, li, blockquote') : null;
          if (el && !el.hasAttribute('data-cclear-current')) {
            d.querySelectorAll('[data-cclear-current]').forEach((n) => n.removeAttribute('data-cclear-current'));
            el.setAttribute('data-cclear-current', '');
          }
        }
      }, { passive: true });
    }
    return true;
  })()`
}
