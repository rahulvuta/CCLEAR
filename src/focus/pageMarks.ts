import type { PageMarkMode, PagePassage, PagePassageSnapshot } from '../ai/pageActions'

type MarkOptions = {
  mode: PageMarkMode | 'read'
  passages?: PagePassage[]
  url?: string
}

// Serialized into the webview; keep all DOM helpers inside this function.
function pageMarkRuntime(opts: MarkOptions) {
  const skip = 'nav, footer, header, aside, script, style, noscript, textarea, input, select, button, [contenteditable="true"], [hidden], [aria-hidden="true"], #mw-navigation, #mw-panel, #mw-head, .sidebar, [role="navigation"], .mw-editsection, sup.reference, [role="doc-noteref"], .reflist, .references, .toc, .navbox, .mwe-math-mathml-a11y'
  const blockSelector = 'p, li, dd, dt, figcaption, blockquote, h1, h2, h3, h4, h5, h6, td, th, [data-cclear-simplified]'

  function clearMarks() {
    const marks = Array.from(document.querySelectorAll('span.cclear-page-sent'))
    for (const mark of marks) {
      const parent = mark.parentNode
      if (!parent) continue
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
      parent.removeChild(mark)
      parent.normalize()
    }
    return { count: marks.length, scrolled: false }
  }

  if (opts.mode === 'clear') return clearMarks()
  if (opts.url && opts.url !== location.href) return { count: 0, scrolled: false, stale: true }

  const root = document.querySelector('#mw-content-text .mw-parser-output') ||
    document.querySelector('#mw-content-text') || document.querySelector('article, main, [role="main"]') || document.body
  const visibility = new Map<Element, boolean>()
  function visible(el: Element): boolean {
    const cached = visibility.get(el)
    if (cached !== undefined) return cached
    const style = getComputedStyle(el)
    const result = !el.matches(skip) && style.display !== 'none' && style.visibility !== 'hidden' &&
      style.visibility !== 'collapse' && (!el.parentElement || visible(el.parentElement))
    visibility.set(el, result)
    return result
  }

  type TextPart = { node: Text; start: number; end: number }
  type Block = { text: string; nodes: TextPart[]; context: string }
  const blocks: Block[] = []
  let lastOwner: Element | null = null
  let section = ''
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const parent = node.parentElement
    if (!parent || !visible(parent)) continue
    const value = node.nodeValue || ''
    if (!value) continue
    const owner = parent.closest(blockSelector) || parent.closest('div, section, article, main') || root
    if (!value.trim() && owner !== lastOwner) continue
    if (owner !== lastOwner) {
      if (/^H[1-6]$/.test(owner.tagName)) section = (owner.textContent || '').trim()
      blocks.push({ text: '', nodes: [], context: section })
      lastOwner = owner
    }
    const block = blocks[blocks.length - 1]
    block.nodes.push({ node: node as Text, start: block.text.length, end: block.text.length + value.length })
    block.text += value
  }

  const segmenter = new Intl.Segmenter(document.documentElement.lang || 'en', { granularity: 'sentence' })
  const candidates: Array<PagePassage & { block: Block; start: number; end: number }> = []
  for (const block of blocks) {
    for (const segment of segmenter.segment(block.text)) {
      const text = segment.segment.trim()
      if (!text) continue
      const start = segment.index + segment.segment.indexOf(text)
      candidates.push({
        id: `p${candidates.length}`, text: text.replace(/\s+/g, ' '), context: block.context,
        block, start, end: start + text.length
      })
    }
  }
  if (opts.mode === 'read') {
    return {
      url: location.href, title: document.title,
      passages: candidates.map(({ id, text, context }) => ({ id, text, context }))
    }
  }

  const requested = new Map((opts.passages || []).map((p) => [p.id, p]))
  const chosen = candidates.filter((p) => {
    const expected = requested.get(p.id)
    return expected && expected.text === p.text && expected.context === p.context
  })
  // Never apply a delayed AI response to different text after navigation or a page update.
  if (chosen.length !== requested.size) return { count: 0, scrolled: false, stale: true }
  if (!chosen.length) return { count: 0, scrolled: false }
  if (opts.mode === 'scroll') chosen.splice(1)

  // Unwrap previous marks without normalizing nodes referenced by the new ranges.
  for (const mark of Array.from(document.querySelectorAll('span.cclear-page-sent'))) {
    const parent = mark.parentNode
    if (!parent) continue
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  }

  let firstSpan: HTMLElement | null = null
  let count = 0
  for (const passage of chosen.reverse()) {
    let marked = false
    for (const part of [...passage.block.nodes].reverse()) {
      const start = Math.max(passage.start, part.start) - part.start
      const end = Math.min(passage.end, part.end) - part.start
      if (end <= start) continue
      const range = document.createRange()
      range.setStart(part.node, start)
      range.setEnd(part.node, end)
      const span = document.createElement('span')
      span.className = 'cclear-page-sent'
      span.dataset.cclearPageMark = opts.mode === 'scroll' ? 'highlight' : opts.mode
      // Wrap each text fragment so existing links and their event handlers stay intact.
      range.surroundContents(span)
      firstSpan = span
      marked = true
    }
    if (marked) count += 1
  }
  if (firstSpan) {
    firstSpan.classList.add('cclear-page-scroll-target')
    firstSpan.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  return { count, scrolled: Boolean(firstSpan) }
}

export function getPagePassagesScript(): string {
  return `(${pageMarkRuntime.toString()})(${JSON.stringify({ mode: 'read' })})`
}

export function getPageMarkScript(opts: {
  mode: PageMarkMode
  passages?: PagePassage[]
  url?: PagePassageSnapshot['url']
}): string {
  return `(${pageMarkRuntime.toString()})(${JSON.stringify(opts)})`
}
