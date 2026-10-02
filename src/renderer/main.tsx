import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/theme.css'

/** Demo mode (npm run demo): shorter nudge timing and links to the bundled demo pages. */
async function applyDemoMode() {
  try {
    const info = await window.cclearBrowser.app.info()
    if (info.demo) {
      localStorage.setItem('cclear.demo', '1')
      localStorage.setItem('cclear.demoUrl', info.demoUrl)
    }
  } catch {
    // not fatal: the app runs normally without it
  }
}

void applyDemoMode().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
