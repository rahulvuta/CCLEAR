import { SELECTION_CSS } from './selection'
import { MARK_COLORS, MARK_COLOR_NAMES, type MarkColor } from '../shared/markColors'

export const READING_ASSIST_CLASS = 'cclear-reading-assist'
export const FOCUS_MODE_CLASS = 'cclear-focus-visual'

/** Injects readability CSS + baseline class on <html>. Hides ads automatically. */
export function getInjectReadingAssistScript(defaultColor: MarkColor = 'yellow'): string {
  const RA = READING_ASSIST_CLASS
  const css = `
    /* ── Ad & distraction hiding (precise selectors only) ── */
    [data-ad], [data-ad-slot], [data-google-query-id],
    ins.adsbygoogle, [class*="adsbygoogle"],
    iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
    iframe[src*="amazon-adsystem"], iframe[src*="adservice"],
    [class*="dfp-ad"], [id*="dfp-ad"],
    [class*="outbrain"], [class*="taboola"],
    [id*="outbrain"], [id*="taboola"],
    [class*="cookie-banner"], [class*="cookie-consent"],
    [class*="cookieBanner"], [class*="CookieConsent"],
    [class*="cookie-notice"],
    [class*="gdpr-banner"], [id*="gdpr-banner"],
    [class*="consent-banner"], [class*="privacy-banner"],
    [class*="newsletter-popup"], [class*="newsletter-modal"],
    [class*="subscribe-modal"], [class*="email-capture"],
    [class*="paywall"], [class*="Paywall"] {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      max-height: 0 !important;
      overflow: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* Hide noscript content only inside main content, not globally */
    html.${RA} noscript,
    html.${RA} .msg--noscript {
      display: none !important;
    }

    /* Keep the site's layout. Only loosen dense body copy. */
    html.${FOCUS_MODE_CLASS} .mw-parser-output .ambox,
    html.${FOCUS_MODE_CLASS} .mw-parser-output .hatnote,
    html.${FOCUS_MODE_CLASS} .mw-editsection {
      display: none !important;
    }

    ${SELECTION_CSS}
    [data-cclear-simplified] {
      line-height: 1.62 !important;
      font-size: 1em;
      letter-spacing: normal;
      text-wrap: pretty;
    }
    [data-cclear-simplified] .cclear-summary-text {
      display: inline;
    }

    mark.cclear-highlight {
      background: ${MARK_COLORS[defaultColor]} !important;
      color: inherit !important;
      padding: 0 1px;
      border-radius: 2px;
      font-weight: inherit;
      box-decoration-break: clone;
    }
    strong.cclear-term {
      font-weight: 700;
      background: none;
    }
    [data-cclear-page-mark="highlight"] {
      background: var(--cclear-mark-color, ${MARK_COLORS[defaultColor]}) !important;
      border-radius: 3px;
      box-decoration-break: clone;
    }
    span.cclear-page-sent[data-cclear-page-mark="highlight"] {
      padding: 0 1px;
    }
    [data-cclear-page-mark="underline"] {
      text-decoration: underline !important;
      text-decoration-color: #38bdf8 !important;
      text-decoration-thickness: 2px !important;
      text-underline-offset: 3px;
    }
    [data-cclear-page-mark="bold"] {
      font-weight: 700 !important;
    }
    [data-cclear-page-mark].cclear-page-scroll-target {
      outline: 2px solid rgba(56, 189, 248, 0.65);
      outline-offset: 3px;
    }
    ${MARK_COLOR_NAMES.map((name) => `::highlight(cclear-user-${name}) { background: ${MARK_COLORS[name]}; color: inherit; }`).join('\n')}
    ::highlight(cclear-user-underline) { text-decoration: underline; text-decoration-color: #38bdf8; text-decoration-thickness: 2px; text-underline-offset: 3px; }
    .cclear-mark-flash { border-radius: 3px; animation: cclear-mark-flash .6s ease-out both; }
    @keyframes cclear-mark-flash { from { opacity: .75; transform: scaleY(1.12); } to { opacity: 0; transform: scaleY(1); } }
    @media (prefers-reduced-motion: no-preference) {
      [data-cclear-simplified] .cclear-summary-text, span.cclear-sel:not(.cclear-sel-empty) {
        animation: cclear-simplify-in .34s cubic-bezier(.2,.8,.2,1) both;
      }
      span.cclear-page-sent[data-cclear-page-mark="highlight"] { animation: cclear-highlight-in .46s ease-out both; }
      span.cclear-page-sent[data-cclear-page-mark="underline"] { animation: cclear-underline-in .4s ease-out both; }
    }
    @keyframes cclear-simplify-in { from { opacity: .12; filter: blur(3px); } to { opacity: 1; filter: blur(0); } }
    @keyframes cclear-highlight-in { from { background-color: transparent; } to { background-color: var(--cclear-mark-color, ${MARK_COLORS[defaultColor]}); } }
    @keyframes cclear-underline-in { from { text-decoration-color: transparent; } to { text-decoration-color: #38bdf8; } }
  `.replace(/\s+/g, ' ')
  return `(() => {
    const id = 'cclear-reading-style';
    const css = ${JSON.stringify(css)};
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = css;
    const isSearch = /google\\.|duckduckgo\\.|bing\\.|yahoo\\.|brave\\.|kagi\\./i.test(location.hostname);
    document.documentElement.setAttribute('data-cclear-is-search', isSearch ? 'true' : 'false');
    document.documentElement.classList.add(${JSON.stringify(RA)});
  })();`
}

export function getSetFocusVisualScript(enabled: boolean): string {
  const FM = FOCUS_MODE_CLASS
  const meth = enabled ? 'add' : 'remove'
  return `(() => {
    document.documentElement.classList.${meth}(${JSON.stringify(FM)});
  })();`
}
