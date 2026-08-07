# CCLEAR (MVP)

A macOS-friendly Electron wrapper around a minimalist browser chrome with:

- Tabs and standard navigation controls
- A right-side assistant panel using **local Ollama** (`qwen3:4b` by default; free, offline capable)
- **Focus mode** automatically rewrites page blocks in small batches. It targets 50–75% of each block's words and checks that definitions, options, causes, numbers, and complete sentences survive. If the model is unavailable or a rewrite fails its checks, Focus preserves the source information; that fallback may exceed the target length.
- Lightweight reading typography styling injected into pages via a small stylesheet (baseline assist)

## Prerequisites

1. Install [Ollama](https://ollama.com) and pull the model:

```bash
ollama pull qwen3:4b
```

2. Optionally set these environment variables:

- `CCLEAR_OLLAMA_HOST` defaults to `http://127.0.0.1:11434`
- `CCLEAR_OLLAMA_MODEL` defaults to `qwen3:4b`

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
