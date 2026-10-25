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
- **Focus mode** (in-place simplification): long paragraphs are cut hard (a 150-word block becomes roughly 40–60 words) and shown as short lines, one sentence each. It works on what you are about to read, not the whole page at once, and every paragraph is one click from its original (**show original**). Rewrites are gated by rule checks (numbers are never invented; long blocks must keep at least half of theirs). An optional second-model review (eco mode off, `qwen3:8b` installed) exists but is stricter and slower and leaves most paragraphs unchanged, so it is off by default. Some paragraphs are left unchanged when no safe rewrite passes; see `docs/MODEL_BENCHMARK.md`.
- **Simplify just what you select.** Drag to select text on any page, right-click → **Simplify selected text**. It rewrites the selection one sentence at a time (short sentences are left alone; a rewrite that changes a number or is not shorter is rejected). Select it again and right-click → **Show original of selected text** to put the exact original sentences back. Also in the ⌘K palette.

**Safer assistant**
- The assistant can only *propose* actions. A deterministic gate decides what runs: harmless things (highlight, scroll, go back) run automatically; opening a site you did not name, clicking, or typing needs your approval; typing into password/card/SSN fields is refused. Text from web pages is treated as data, never as instructions.

**Less noise**
- Built-in blocker for third-party ad and tracker requests (per-site off switch, visible counter), plus find-in-page, a right-click menu with *Explain / Define / Park*, and a `⌘K` command palette.

## Light on your computer

**Settings → Performance → Lighter on my computer** is on by default: the AI model unloads after 3 idle minutes instead of 30, only one AI task runs at a time (what you are waiting on goes first), simplification only works near what you are reading, and the second, larger reviewer model is skipped. The new-tab page uses static gradients instead of animated blurred layers, and background timers pause when the window is hidden.

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

## Development and tools

I designed CCLEAR and built its early Electron browser shell, much of its main-process logic, the local Ollama integration, and its initial interface. I wrote much of the early code myself and tested the main workflows. I made the final decisions about features and design. I used Claude Code mostly to refine and debug local-model calls, polish parts of the interface and animations, and investigate problems. Some of those refinements involved code suggested or edited by Claude Code.

## Known limitations

- Needs Ollama; the experience on 8 GB Macs is **untested** (a smaller model is suggested but not benchmarked).
- Relevance judging is a heuristic plus a small local model; it will sometimes be wrong, which is why every nudge is dismissible and "This is relevant" teaches it.
- In-place simplification is the least reliable feature: on long test paragraphs it simplified 9 of 11 and cut them to about 40% of their length, but it leaves the rest unchanged, and on the default (eco) setup it is checked by rules, not by a model. Reader view is the more reliable option.
- Read-aloud (Listen) uses the system speech engine and was not verified by automated tests.
- Multi-window, bookmarks, downloads UI and extensions are not implemented.
- Built-in blocker is a short conservative host list, not a full filter engine.
- Not code-signed; run from source or an unsigned build.
