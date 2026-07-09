export const READING_ASSIST_CLASS = 'adhd-reading-assist'
export const FOCUS_MODE_CLASS = 'adhd-focus-visual'

/** Injects readability CSS + baseline class on <html>. Hides ads automatically. */
export function getInjectReadingAssistScript(): string {
  const RA = READING_ASSIST_CLASS
  const css = `
    /* ── Ad & distraction hiding ── */
    [class*="ad-"], [class*="ad_"], [class*="ads-"], [class*="ads_"],
    [class*="advert"], [class*="Advert"], [class*="Ad-container"],
    [id*="ad-"], [id*="ad_"], [id*="ads-"], [id*="ads_"],
    [id*="advert"], [id*="google_ads"], [id*="GoogleAd"],
    [class*="sponsor"], [class*="Sponsor"],
    [class*="promoted"], [class*="Promoted"],
    [data-ad], [data-ad-slot], [data-google-query-id],
    iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
    iframe[src*="amazon-adsystem"], iframe[src*="adservice"],
    ins.adsbygoogle, [class*="adsbygoogle"],
    [class*="dfp-"], [id*="dfp-"],
    [class*="outbrain"], [class*="taboola"],
    [id*="outbrain"], [id*="taboola"],
    [class*="cookie-banner"], [class*="cookie-consent"],
    [class*="cookieBanner"], [class*="CookieConsent"],
    [class*="cookie-notice"], [id*="cookie"],
    [class*="gdpr"], [id*="gdpr"],
    [class*="consent-banner"], [class*="privacy-banner"],
    [class*="newsletter-popup"], [class*="newsletter-modal"],
    [class*="popup-overlay"], [class*="modal-overlay"],
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

    /* ── Reading assist baseline ── */
    html.${RA} main, html.${RA} article, html.${RA} [role="main"] {
      max-width: 72ch;
      margin-left: auto;
      margin-right: auto;
    }

    /* ── Simplified text — stays inline, keeps site theme ── */
    [data-adhd-simplified="true"] {
      border-left: 3px solid currentColor !important;
      padding-left: 10px !important;
      opacity: 0.95;
      position: relative;
    }
    [data-adhd-simplified="true"]::before {
      content: 'Simplified';
      display: block;
      font-size: 0.7em;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.5;
      margin-bottom: 4px;
      font-weight: 600;
    }

    .adhd-look-for {
      margin: 10px 0 4px 0;
      padding: 0;
      font-size: 0.68em;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      opacity: 0.75;
      color: inherit;
    }

    /* ── Key points list — subtle, matches page theme ── */
    .adhd-keypoints-inline {
      margin: 6px 0 2px 0;
      padding: 0 0 0 18px;
      font-size: 0.92em;
      opacity: 0.88;
    }
    .adhd-keypoints-inline li {
      margin: 3px 0;
    }
    .adhd-keypoints-inline li::marker {
      content: '→ ';
    }

    /* ── Toggle button — subtle, blends with site ── */
    .adhd-toggle-inline {
      display: inline-block;
      margin-top: 4px;
      padding: 2px 8px;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid currentColor;
      background: transparent;
      color: inherit;
      font-size: 0.75em;
      opacity: 0.6;
      transition: opacity 0.2s;
    }
    .adhd-toggle-inline:hover {
      opacity: 1;
    }

    /* ── Original text block (hidden by default) ── */
    .adhd-original-inline {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed currentColor;
      opacity: 0.6;
      font-size: 0.92em;
      white-space: pre-wrap;
    }

    /* ── Highlighted key info ── */
    mark.adhd-highlight {
      background: rgba(250, 204, 21, 0.5) !important;
      color: inherit !important;
      padding: 1px 3px;
      border-radius: 3px;
      font-weight: 600;
      box-decoration-break: clone;
    }
    @media (prefers-color-scheme: dark) {
      mark.adhd-highlight {
        background: rgba(250, 204, 21, 0.25) !important;
      }
    }
  `.replace(/\s+/g, ' ')
  return `(() => {
    const id = 'adhd-reading-style';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = ${JSON.stringify(css)};
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
