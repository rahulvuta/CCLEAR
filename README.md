# ADHD Browser (MVP)

A macOS-friendly Electron wrapper around a minimalist browser chrome with:

- Tabs and standard navigation controls
- A right-side assistant panel using **local Ollama** (`mistral:7b` by default; free, offline capable)
- **Focus mode**: larger typography presets (toggle at the top) plus a **manual** **Simplify page** action while Focus mode is on (aggressive chunk summarization via the local model)
- Lightweight reading typography styling injected into pages via a small stylesheet (baseline assist)

## Prerequisites

1. Install [Ollama](https://ollama.com) and pull the model:

```bash
ollama pull mistral:7b
```

2. Optionally set these environment variables:

- `ADHD_OLLAMA_HOST` defaults to `http://127.0.0.1:11434`
- `ADHD_OLLAMA_MODEL` defaults to `mistral:7b`

## Development

```bash
npm install
npm run dev
```

## Packaging (macOS)

```bash
npm run build
```

Artifacts land in `./release/` (dmg/zip configured for arm64 and x64 when building on compatible hosts).

## Safety note

Automatic page rewriting is powerful: use it where you trust the content. Prefer reading sensitive pages without simplification unless you intentionally want summarized text persisted in local model cache.

## UI inspiration

Additional motion and component ideas can be explored in the [react-bits](https://github.com/DavidHDev/react-bits) reference collection (this MVP uses a custom minimal shell instead of importing that repo directly).
