import type { ReadingProgress } from '../shared/session'

/** Script run in the page: how far through it the user is and which heading they are under. */
export function getProgressProbeScript(): string {
  return `(() => {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const ratio = Math.min(1, Math.max(0, window.scrollY / max));
    let heading = '';
    const hs = document.querySelectorAll('h1,h2,h3');
    for (const h of hs) {
      const r = h.getBoundingClientRect();
      if (r.top <= 80) heading = (h.innerText || '').trim().slice(0, 90); else break;
    }
    return JSON.stringify({ ratio, heading, tall: doc.scrollHeight > window.innerHeight * 1.6 });
  })()`
}

export function getScrollToRatioScript(ratio: number): string {
  return `(() => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: max * ${Math.min(1, Math.max(0, ratio)).toFixed(4)}, behavior: 'smooth' });
  })()`
}

/** Only offer to resume where there is something worth resuming. */
export function worthResuming(p: ReadingProgress | undefined, now: number): boolean {
  if (!p) return false
  return p.ratio >= 0.08 && p.ratio <= 0.95 && now - p.at > 60_000
}

export function describeProgress(p: ReadingProgress): string {
  const pct = Math.round(p.ratio * 100)
  return p.heading ? `You were in “${p.heading}” (${pct}% through).` : `You were ${pct}% through this page.`
}
