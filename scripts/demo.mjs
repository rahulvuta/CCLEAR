// One-command demo: serves the demo pages locally and launches the built app in demo mode.
//   npm run build:app && npm run demo
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'demo/pages')
const PORT = 4600

const server = http.createServer((req, res) => {
  const name = req.url === '/' ? 'index.html' : req.url.slice(1).split('?')[0]
  const file = path.join(dir, path.basename(name))
  if (!fs.existsSync(file)) return res.writeHead(404).end('not found')
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(fs.readFileSync(file))
})
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Demo pages: http://127.0.0.1:${PORT}/industrial-revolution.html  and  /gaming-clips.html`)
  const userData = process.env.CCLEAR_DEMO_FRESH === '0' ? undefined : fs.mkdtempSync(path.join(os.tmpdir(), 'cclear-demo-'))
  const args = [root, ...(userData ? [`--user-data-dir=${userData}`] : [])]
  const child = spawn(path.join(root, 'node_modules/.bin/electron'), args, {
    stdio: 'inherit',
    env: { ...process.env, CCLEAR_DEMO: '1', CCLEAR_DEMO_URL: `http://127.0.0.1:${PORT}` }
  })
  child.on('exit', () => {
    server.close()
    process.exit(0)
  })
})
