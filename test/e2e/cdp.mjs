// Minimal Chrome-DevTools-Protocol driver for the built Electron app (no extra dependencies).
import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function fixtureServer(port, pages) {
  const server = http.createServer((req, res) => {
    const page = pages[req.url.split('?')[0]]
    if (!page) {
      res.writeHead(404).end('nope')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page)
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}

function electronBinary(root) {
  const direct = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  return fs.existsSync(direct) ? direct : path.join(root, 'node_modules/.bin/electron')
}

async function portInUse(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(800) })
    return true
  } catch {
    return false
  }
}

/** Kill the whole process group so no helper or wrapper can outlive the test and hold the port. */
export async function stopApp(child, port) {
  try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ }
  for (let i = 0; i < 20 && (await portInUse(port)); i++) await sleep(250)
  if (await portInUse(port)) {
    try { process.kill(-child.pid, 'SIGKILL') } catch { /* */ }
    for (let i = 0; i < 20 && (await portInUse(port)); i++) await sleep(250)
  }
}

export async function launchApp({ root, userData, port = 9333, env = {} }) {
  if (await portInUse(port)) throw new Error(`Port ${port} is already in use: a previous app is still running. Close it and retry.`)
  const child = spawn(electronBinary(root), [root, `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
    env: { ...process.env, CCLEAR_E2E: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  })
  let log = ''
  child.stdout.on('data', (d) => (log += d))
  child.stderr.on('data', (d) => (log += d))
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page' && /renderer|localhost:\d+\/?$/.test(t.url))
      if (page) return { child, port, log: () => log, page }
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  await stopApp(child, port)
  throw new Error('Electron did not expose a renderer target:\n' + log)
}

export class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.id = 0
    this.pending = new Map()
    this.opened = new Promise((res, rej) => {
      this.ws.onopen = res
      this.ws.onerror = rej
    })
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      const p = this.pending.get(msg.id)
      if (p) {
        this.pending.delete(msg.id)
        msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result)
      }
    }
  }
  async send(method, params = {}) {
    await this.opened
    const id = ++this.id
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  async waitFor(expression, timeoutMs = 15000, label = expression) {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      try {
        const v = await this.eval(expression)
        if (v) return v
      } catch {
        /* retry */
      }
      await sleep(250)
    }
    throw new Error(`Timed out waiting for: ${label}`)
  }
  async screenshot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'))
  }
  close() {
    try { this.ws.close() } catch { /* */ }
  }
}

/** Type into a React-controlled input. */
export const setInput = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`

export const clickText = (selector, text) => `(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.trim().includes(${JSON.stringify(text)}));
  if (!el) return false; el.click(); return true;
})()`

/** Connect to the <webview> page whose URL contains `urlPart`. */
export async function connectWebview(port, urlPart, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const t = list.find((x) => x.type === 'webview' && x.url.includes(urlPart))
    if (t) return new Cdp(t.webSocketDebuggerUrl)
    await sleep(250)
  }
  throw new Error('webview target not found: ' + urlPart)
}
