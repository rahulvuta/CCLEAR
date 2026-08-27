# CCLEAR

A privacy-first desktop browser built to help students with ADHD and attention-management difficulties stay on task, recover from distraction, and get through long pages. All AI runs **locally** through [Ollama](https://ollama.com): no accounts, no API keys, and no page content leaves your Mac.

CCLEAR is a productivity and reading aid. It does not diagnose, treat, or claim to improve any medical condition.

## What it does

**Stay on what you meant to do**
- **Goal bar.** Say what you are here to do; CCLEAR breaks it into steps and keeps the goal visible.
- **On-task awareness.** Each tab shows whether it fits your goal (a green / amber / coral dot with a text label). A fast keyword scorer handles most pages; the local model is asked only about pages it cannot tell.
- **Gentle nudges, not alarms.** After sustained time off-task, a small dismissible card offers *Back to task · This is relevant · Park it · Snooze*. Dwell time, cooldowns and an hourly cap prevent nagging, and you can set check-ins to Off, Quiet, Balanced or Coach.
- **Parking lot.** `⇧⌘P` parks the current tab (or a thought) so it stops pulling at you. Everything is restored later, with the place you stopped reading.
- **Picks up where you left off.** Goal, steps, tabs, parked items and reading position survive restarts. The new-tab page shows your goal, your next step and unfinished reading.
- **Pause sites.** Pick sites that get an 8-second "is this what you want right now?" pause before opening.

**Make long pages manageable**
- **Reader view** with a quick summary (numbers are checked against the article; if the AI is unavailable it falls back to the article's opening sentences) and **Listen** (read-aloud). Your original page is never modified; `Esc` returns to it.
- **Reading tools:** font, size, line and letter spacing, narrow lines, sepia/cream/night backgrounds, a **line-focus ruler**, and **dim paragraphs you are not reading**.
- **Ask this page.** Questions about the open page are answered from the page itself, with numbered citations; click one to jump to the sentence. If the page does not contain the answer, it says so.
- **Focus mode** (in-place simplification, on-screen paragraphs first) with click-any-paragraph **show original**. Rewrites are gated by rule checks (numbers, dates, grammar) and, when `qwen3:8b` is installed on a 16 GB Mac, fact-checked by it. About 4 in 10 paragraphs are left unchanged because they fail the checks; see `docs/MODEL_BENCHMARK.md`.

**Safer assistant**
- The assistant can only *propose* actions. A deterministic gate decides what runs: harmless things (highlight, scroll, go back) run automatically; opening a site you did not name, clicking, or typing needs your approval; typing into password/card/SSN fields is refused. Text from web pages is treated as data, never as instructions.

**Less noise**
- Built-in blocker for third-party ad and tracker requests (per-site off switch, visible counter), plus find-in-page, a right-click menu with *Explain / Define / Park*, and a `⌘K` command palette.

## Run it

Requirements: macOS, Node 22+, and [Ollama](https://ollama.com).

```bash
ollama pull qwen3:4b          # recommended; ~2.5 GB, measured on 16 GB Macs
ollama pull llava             # optional: "look at my screen" questions
npm install
npm run dev
```

You can also use **Settings → Local AI** to see what is installed, choose a model, and download the recommended one with a progress bar. Without Ollama the browser still works; AI features say so instead of failing silently.

### Demo
```bash
npm run build:app && npm run demo
```
Starts the bundled demo pages and launches the app with shorter nudge timing, so a recording does not have to wait.

### Environment variables
`CCLEAR_OLLAMA_HOST` (default `http://127.0.0.1:11434`), `CCLEAR_OLLAMA_MODEL` (default `qwen3:4b`), `CCLEAR_OLLAMA_VISION_MODEL` (default `llava:latest`).

## Test it

```bash
npm run typecheck
npm test            # unit tests (pure logic: relevance, drift, action gate, citations, blocker, reading, …)
npm run build:app
npm run test:e2e    # drives the real built app and the real local model through the main flows
npm run bench       # benchmarks installed models on CCLEAR's actual tasks (see docs/MODEL_BENCHMARK.md)
```

## How it is built

Electron + React + TypeScript. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the layout, [docs/CAC_2026_PLAN.md](docs/CAC_2026_PLAN.md) for what was built and why, and [docs/MODEL_BENCHMARK.md](docs/MODEL_BENCHMARK.md) for model results.

## Known limitations

- Needs Ollama; the experience on 8 GB Macs is **untested** (a smaller model is suggested but not benchmarked).
- Relevance judging is a heuristic plus a small local model; it will sometimes be wrong, which is why every nudge is dismissible and "This is relevant" teaches it.
- In-place simplification is the least reliable feature: it changes only about 6 in 10 paragraphs on the demo article, and on a 4B-only setup is checked by rules, not by a model. Reader view is the more reliable option.
- Read-aloud (Listen) uses the system speech engine and was not verified by automated tests.
- Multi-window, bookmarks, downloads UI and extensions are not implemented.
- Built-in blocker is a short conservative host list, not a full filter engine.
- Not code-signed; run from source or an unsigned build.
