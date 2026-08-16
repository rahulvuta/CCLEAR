# Architecture

```
Renderer (React)                       Main process (Electron)                Local
  App.tsx (shell, tabs, wiring)          ipc/ai.ts        assist, ask-page      Ollama
  hooks/                                 ipc/session.ts   persistence, steps,   (HTTP :11434)
    useSession   state + persistence                      relevance judge
    useDrift     relevance + nudge timing ipc/reading.ts  reader summaries
    useAssistant chat + tool execution    ipc/models.ts   status, pull, select
    useReading   typography + reader      blocker.ts      ad/tracker requests
  components/*                            security.ts     permissions, navigation,
        │                                                 webview lockdown, context menu
        │ executeJavaScript                preload.ts     the only bridge (contextBridge)
        ▼
  <webview> pages (partition persist:adhd-browser)
```

## Pure, unit-tested logic (no Electron, no DOM)
| Module | Role |
|---|---|
| `src/session/relevance.ts` | keyword + host-category scorer → on / unsure / off |
| `src/session/drift.ts` | nudge state machine: dwell, cooldown, hourly cap, snooze |
| `src/session/store.ts` | reducer for goal, steps, parked items, progress, settings |
| `src/session/progress.ts` | reading-position probe and resume rules |
| `src/ai/tools.ts` | typed tool calls + **action gate** (auto / confirm / deny) |
| `src/ai/router.ts` | schema-constrained routing prompt and parser |
| `src/ai/askPage.ts` | TF-IDF passage retrieval, answer validation, citations |
| `src/reading/*` | CSS/script builders, reader extraction and overlay, summary validation |
| `src/blocker/match.ts` | third-party ad/tracker matcher |
| `src/shared/palette.ts` | fuzzy command search |

## Trust boundaries
1. **Web page text → model** only inside a labelled untrusted data block.
2. **Model → actions** only as typed tool calls through `gateToolCall`; the model never executes anything itself. Navigation to a site the user did not name, clicking and typing need a click; sensitive fields are refused; non-http(s) schemes are refused.
3. **Webviews** are sandboxed, `contextIsolation` on, no preload, fixed partition, scheme-restricted navigation, permissions denied except fullscreen (camera/mic/location/notifications prompt once per site).
4. **Reader view** builds DOM with `textContent` only; it never inserts page HTML.

## Why schema-constrained JSON instead of native tool calling
Measured on the installed `qwen3:4b`: native tool calling ignored `think:false` and narrated its reasoning (5 s+ per turn, no tool call within the token budget); grammar-constrained JSON with a closed think block returned valid routing in ~1 s. `docs/MODEL_BENCHMARK.md` has the full comparison.
