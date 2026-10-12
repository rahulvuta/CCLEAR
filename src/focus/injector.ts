import { SELECTION_CSS } from './selection'

export const READING_ASSIST_CLASS = 'cclear-reading-assist'
export const FOCUS_MODE_CLASS = 'cclear-focus-visual'

/** Injects readability CSS + baseline class on <html>. Hides ads automatically. */
export function getInjectReadingAssistScript(): string {
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
      line-height: 1.7 !important;
      font-size: 1.06em;
      letter-spacing: 0.01em;
    }
    [data-cclear-simplified] .cclear-summary-text {
      display: inline;
    }
    [data-cclear-simplified] .cclear-summary-text.cclear-lines { display: block; }
    [data-cclear-simplified] .cclear-sent { display: block; margin: 0 0 0.35em; }
    [data-cclear-simplified] .cclear-sent:last-child { margin-bottom: 0; }

    mark.cclear-highlight {
      background: rgba(250, 204, 21, 0.35) !important;
      color: inherit !important;
      padding: 1px 3px;
      border-radius: 3px;
      font-weight: inherit;
      box-decoration-break: clone;
    }
    strong.cclear-term {
      font-weight: 700;
      background: none;
    }
    [data-cclear-page-mark="highlight"] {
      background: rgba(186, 230, 253, 0.72) !important;
      border-radius: 4px;
      box-decoration-break: clone;
    }
    span.cclear-page-sent[data-cclear-page-mark="highlight"] {
      padding: 0 2px;
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
