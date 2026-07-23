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

    html.${RA} noscript,
    html.${RA} .msg--noscript {
      display: none !important;
    }

    [data-cclear-simplified="true"],
    [data-cclear-simplified="inline"] {
      color: var(--cclear-text-color, inherit) !important;
    }

    .cclear-summary-text {
      font-size: inherit;
      line-height: inherit;
    }

    mark.cclear-phrase {
      background-color: rgba(250, 204, 21, 0.28) !important;
      color: inherit !important;
      padding: 0 1px !important;
      border-radius: 2px !important;
      box-decoration-break: clone !important;
      -webkit-box-decoration-break: clone !important;
      font-weight: inherit !important;
    }
    strong.cclear-term {
      font-weight: 700 !important;
      color: inherit !important;
      background: none !important;
    }
    mark.cclear-highlight {
      background-color: rgba(250, 204, 21, 0.28) !important;
      color: inherit !important;
      padding: 0 1px !important;
      border-radius: 2px !important;
      box-decoration-break: clone !important;
      -webkit-box-decoration-break: clone !important;
    }

    .cclear-toggle-inline {
      display: inline;
      margin-left: 6px;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      font-size: 0.75em;
      opacity: 0.5;
      cursor: pointer;
      text-decoration: underline;
      vertical-align: baseline;
    }
    .cclear-toggle-inline:hover {
      opacity: 0.85;
    }

    .cclear-original-inline {
      display: block;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed color-mix(in srgb, currentColor 30%, transparent);
      opacity: 0.6;
      font-size: 0.92em;
      line-height: 1.5;
      white-space: pre-wrap;
    }
  `.replace(/\s+/g, ' ')
  return `(() => {
    const id = 'cclear-reading-style';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = ${JSON.stringify(css)};
    const isSearch = /google\\.|duckduckgo\\.|bing\\.|yahoo\\.|brave\\.|kagi\\./i.test(location.hostname);
    document.documentElement.setAttribute('data-cclear-is-search', isSearch ? 'true' : 'false');
    document.documentElement.classList.add(${JSON.stringify(RA)});
    document.head.appendChild(style);
  })();`
}

export function getSetFocusVisualScript(enabled: boolean): string {
  const FM = FOCUS_MODE_CLASS
  const meth = enabled ? 'add' : 'remove'
  return `(() => {
    document.documentElement.classList.${meth}(${JSON.stringify(FM)});
  })();`
}
