import type { HTMLAttributes } from 'react'

/**
 * Narrow typing for Electron's `<webview>` element.
 */
export type ADHDWebViewProps = Omit<HTMLAttributes<HTMLElement>, 'dangerouslySetInnerHTML'> & {
  src?: string
  preload?: string
  partition?: string
  /** Comma-separated list of chromium webpreferences */
  webpreferences?: string
  /** Enable popups navigation */
  allowpopups?: string
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: ADHDWebViewProps
    }
  }
}
