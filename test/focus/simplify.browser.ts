import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApplySummariesScript, buildRestoreSummariesScript, getExtractChunksScript } from '../../src/focus/simplify'
import { getInjectReadingAssistScript, getSetFocusVisualScript } from '../../src/focus/injector'
import type { PageBlockForSimplify } from '../../src/shared/types'

app.commandLine.appendSwitch('disable-gpu')
app.setPath('userData', mkdtempSync(join(tmpdir(), 'cclear-simplify-test-')))

const pageHtml = `<!doctype html><main class="mw-parser-output">
      <div class="ambox"><p>This section does not cite any sources. Please help improve this section by adding citations to reliable sources.</p></div>
      <div class="hatnote"><p>Main article: The history of steam engines and their inventors.</p></div>
      <div class="reflist"><p>An author wrote a reference about the history of engines.</p></div>
      <p id="first">A steam engine is a device that turns heat into mechanical motion by boiling water inside boilers to produce steam.</p>
      <p id="second">Electric cars use batteries to store electricity and deliver power to motors using alternating current or direct current.</p>
      </main>`

void app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  const run = (script: string) => window.webContents.executeJavaScript(script)
  const loadPage = async () => {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pageHtml)}`)
    await run(getInjectReadingAssistScript())
    await run(getSetFocusVisualScript(true))
  }
  try {
    await loadPage()
    const blocks = await run(getExtractChunksScript(30)) as PageBlockForSimplify[]
    assert.equal(blocks.length, 2)
    assert.equal(await run(`getComputedStyle(document.querySelector('.ambox')).display`), 'none')
    const original = await run(`document.querySelector('#first').innerHTML`)
    await run(buildApplySummariesScript([{ ...blocks[0], original: blocks[0].text, summary: 'Steam engines turn heat into mechanical motion. Boilers boil water to produce steam.' }]))
    assert.equal(await run(`document.documentElement.hasAttribute('data-cclear-focus-complete')`), false)
    const remaining = await run(getExtractChunksScript(30)) as PageBlockForSimplify[]
    assert.equal(remaining.length, 1)
    assert.match(remaining[0].text, /Electric cars/)
    await run(buildApplySummariesScript([{ ...remaining[0], summary: 'Electric car batteries power alternating current or direct current motors.' }]))
    await run(`document.documentElement.setAttribute('data-cclear-focus-complete', '')`)
    assert.equal(await run(`document.querySelectorAll('[data-cclear-simplified]').length`), 2)
    await run(buildRestoreSummariesScript())
    await run(getSetFocusVisualScript(false))
    assert.equal(await run(`document.querySelector('#first').innerHTML`), original)
    assert.equal(await run(`document.documentElement.hasAttribute('data-cclear-focus-complete')`), false)
    assert.notEqual(await run(`getComputedStyle(document.querySelector('.ambox')).display`), 'none')

    await loadPage()
    const cachedBlocks = await run(getExtractChunksScript(30)) as PageBlockForSimplify[]
    assert.equal(cachedBlocks.length, 2)
    const cached = [
      {
        ...cachedBlocks[0],
        original: cachedBlocks[0].text,
        summary: 'Steam engines turn heat into mechanical motion. Boilers boil water to produce steam.'
      },
      {
        ...cachedBlocks[1],
        original: cachedBlocks[1].text,
        summary: 'Electric car batteries power alternating current or direct current motors.'
      }
    ]
    const firstApply = await run(buildApplySummariesScript(cached)) as number
    assert.equal(firstApply, 2)
    const firstSimplified = await run(`document.querySelector('#first').innerHTML`) as string
    const secondSimplified = await run(`document.querySelector('#second').innerHTML`) as string
    await run(buildRestoreSummariesScript())
    const reapplied = await run(buildApplySummariesScript(cached)) as number
    assert.equal(reapplied, 2)
    assert.equal(await run(`document.querySelector('#first').innerHTML`), firstSimplified)
    assert.equal(await run(`document.querySelector('#second').innerHTML`), secondSimplified)

    await run(buildRestoreSummariesScript())
    await run(`Array.from(document.querySelectorAll('[data-cclear-src-id]')).forEach((n) => n.removeAttribute('data-cclear-src-id'))`)
    const rematched = await run(buildApplySummariesScript(cached)) as number
    assert.equal(rematched, 2)
    assert.equal(await run(`document.querySelector('#first').innerHTML`), firstSimplified)
    assert.equal(await run(`document.querySelector('#second').innerHTML`), secondSimplified)
    console.log('PASS: prose extraction, chrome exclusion, partial resume, inline apply, exact restoration, and cached re-apply')
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
