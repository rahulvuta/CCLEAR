import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPageMarkScript, getPagePassagesScript } from '../../src/focus/pageMarks'
import { selectPagePassages } from '../../src/ai/pagePassages'
import { ollamaGenerate } from '../../src/ai/ollamaClient'
import type { PageMarkMode, PagePassageSnapshot } from '../../src/ai/pageActions'

app.commandLine.appendSwitch('disable-gpu')
app.setPath('userData', mkdtempSync(join(tmpdir(), 'cclear-page-mark-test-')))

void app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  const run = (script: string) => win.webContents.executeJavaScript(script)
  const load = async (html: string) => {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await run(getPagePassagesScript()) as PagePassageSnapshot
  }
  const apply = (snapshot: PagePassageSnapshot, mode: PageMarkMode, ids: string[]) => run(getPageMarkScript({
    mode, url: snapshot.url, passages: snapshot.passages.filter((p) => ids.includes(p.id))
  }))
  try {
    const snapshot = await load(`<!doctype html><html lang="en"><title>Jet engine</title><body>
      <nav><p>It was invented in navigation.</p></nav><main><div id="mw-content-text"><div class="mw-parser-output">
      <h2>History</h2><p>Frank <a id="whittle" href="#history">Whittle</a> patented his design in England in 1930.<sup class="reference">[1]</sup>
      Hans von Ohain independently developed a turbojet in Germany.</p>
      <p hidden>It was invented in hidden content.</p><div style="display:none"><p>Another hidden invention.</p></div>
      <p>A jet engine produces thrust by expelling a fast-moving jet.</p>
      <p>England.</p><p>${'An unusually long sentence about the history of propulsion, '.repeat(14)}was published.</p>
      <div class="references"><ol><li>A bibliography citation about inventions.</li></ol></div>
      </div></div></main></body></html>`)
    assert.equal(snapshot.passages.length, 6)
    assert(snapshot.passages.some((p) => p.text === 'England.'))
    assert(snapshot.passages.some((p) => p.text.length > 500))
    assert(snapshot.passages.every((p) => !/hidden|navigation|bibliography|\[1\]/.test(p.text)))
    const ids = snapshot.passages.filter((p) => /patented|developed/.test(p.text)).map((p) => p.id)
    assert.equal(ids.length, 2)
    await run(`window.originalLink = document.getElementById('whittle'); window.linkClicks = 0;
      window.originalLink.addEventListener('click', (event) => { event.preventDefault(); window.linkClicks++; });`)
    for (const mode of ['highlight', 'underline', 'bold'] as const) {
      assert.equal((await apply(snapshot, mode, ids)).count, 2)
      assert(await run(`Array.from(document.querySelectorAll('.cclear-page-sent')).every((el) => el.dataset.cclearPageMark === ${JSON.stringify(mode)})`))
      assert.equal(await run(`document.getElementById('whittle') === window.originalLink`), true)
      assert.equal(await run(`document.querySelectorAll('.reference .cclear-page-sent').length`), 0)
      assert.deepEqual((await run(getPagePassagesScript())).passages, snapshot.passages)
    }
    await run(`document.getElementById('whittle').click()`)
    assert.equal(await run('window.linkClicks'), 1)
    const scroll = await apply(snapshot, 'scroll', ids)
    assert.equal(scroll.count, 1)
    assert.equal(scroll.scrolled, true)
    await run(getPageMarkScript({ mode: 'clear' }))
    assert.equal(await run(`document.querySelectorAll('.cclear-page-sent').length`), 0)
    assert.equal(await run(`document.getElementById('whittle') === window.originalLink`), true)
    console.log('PASS: inline links, citations, hidden content, short/long sentences, repeated formatting, clear and scroll')

    const many = await load(`<main><blockquote>${Array.from({ length: 12 }, (_, i) =>
      `<p>Engine ${i} was developed in England and first built there.</p>`).join('')}</blockquote></main>`)
    assert.equal(many.passages.length, 12)
    assert.equal((await apply(many, 'highlight', many.passages.map((p) => p.id))).count, 12)
    console.log('PASS: nested blocks do not duplicate sentences; all 12 matches are marked')
    const stale = await apply(snapshot, 'highlight', ids)
    assert.equal(stale.stale, true)
    await run(`document.querySelector('p').firstChild.textContent = 'The page changed.'`)
    assert.equal((await apply(many, 'bold', many.passages.map((p) => p.id))).stale, true)
    console.log('PASS: stale navigation and modified content are rejected')

    if (process.env.CCLEAR_TEST_OLLAMA === '1') {
      const selected = await selectPagePassages('all the parts where it talks about where it was invented', snapshot, async (params) => {
        const raw = await ollamaGenerate(params)
        console.log('Ollama selection:', raw)
        return raw
      })
      assert.equal(selected.usedFallback, false)
      assert(ids.every((id) => selected.ids.includes(id)))
      assert(!selected.ids.some((id) => snapshot.passages.find((p) => p.id === id)?.text.includes('produces thrust')))
      console.log('PASS: installed Ollama model selects England/Germany paraphrases and excludes unrelated operation')
      const unrelated = { ...snapshot, passages: snapshot.passages.filter((p) => /produces thrust|unusually long/.test(p.text)) }
      const absent = await selectPagePassages('where it was invented', unrelated)
      assert.deepEqual(absent, { ids: [], usedFallback: false })
      console.log('PASS: installed model returns no matches for unrelated passages')
    }
    if (process.env.CCLEAR_TEST_WIKIPEDIA === '1') {
      await win.loadURL('https://en.wikipedia.org/wiki/Jet_engine')
      const wiki = await run(getPagePassagesScript()) as PagePassageSnapshot
      writeFileSync(join(app.getPath('userData'), 'wikipedia-passages.json'), JSON.stringify(wiki))
      console.log('Wikipedia snapshot:', join(app.getPath('userData'), 'wikipedia-passages.json'))
      assert(wiki.passages.length > 100)
      console.log(`Wikipedia: checking ${wiki.passages.length} passages`)
      const selected = await selectPagePassages('all the parts where it talks about where it was invented', wiki, async (params) => {
        const raw = await ollamaGenerate(params)
        console.log('Wikipedia batch:', raw.replace(/\s+/g, ' '))
        return raw
      })
      assert.equal(selected.usedFallback, false)
      assert(selected.ids.length < 100, 'Selection must exclude unrelated sections')
      const texts = wiki.passages.filter((p) => selected.ids.includes(p.id)).map((p) => p.text)
      assert(texts.some((text) => /England/.test(text)))
      assert(texts.some((text) => /Germany/.test(text)))
      assert(texts.some((text) => /Spain/.test(text)))
      for (const mode of ['highlight', 'underline', 'bold'] as const) {
        assert.equal((await apply(wiki, mode, selected.ids)).count, selected.ids.length)
      }
      console.log(`PASS: real Wikipedia article marks ${selected.ids.length} invention passages in every formatting mode`)
    }
    win.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error)
    win.destroy()
    app.exit(1)
  }
})
