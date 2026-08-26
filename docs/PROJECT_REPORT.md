# CCLEAR — Project Report & Idea Backlog

**Audience:** an AI agent (or human) deciding what to build next.
**Snapshot:** commit `6d1e228` on `main`, 2026-10-15.
**How to use this doc:** Part 1 is the honest state of the project. Part 2 is a large, unfiltered idea backlog. Part 3 is a suggested triage. Every idea has a rough *value / effort / risk* tag so you can filter. Nothing in Part 2 is committed to; pick and choose.

---

## Part 1 — What CCLEAR is, honestly

### 1.1 One-paragraph summary
CCLEAR is an Electron (v41) + React 19 + TypeScript desktop browser aimed at people who get overwhelmed by the web (ADHD / focus use case). It wraps pages in `<webview>` tabs, adds a right-hand chat assistant, and offers a **Focus mode** that bumps reading typography and can **"Simplify page"**, rewriting page prose into shorter summaries in-place. All AI runs on a **local Ollama** model (default `qwen3:4b`; vision via `llava:latest`), so it is free, private and offline-capable. ~7.7k lines, no backend, no accounts.

### 1.2 Architecture map
| Area | Where | What it does |
|---|---|---|
| Main process | `electron/main.ts`, `electron/ipc/{ai,prefs,register,tabs}.ts`, `electron/preload.ts` | Window, IPC handlers, prefs (electron-store). `tabs.ts` is a stub (`tabs:noop`). |
| Renderer shell | `src/renderer/App.tsx` (1.1k lines), `components/{TopBar,TabStrip,WebviewHost,ChatSidebar,NewTabPage,WhyAmIHereBox}.tsx`, `styles/theme.css` (1k lines) | All browser UI and nearly all state (~22 `useState/useEffect`). |
| Focus engine | `src/focus/*` | Injects reading CSS, extracts page blocks, filters chrome/nav text, heuristic summarization fallback, applies summaries back into the DOM, caches per tab+URL (hash stripped). |
| AI layer | `src/ai/*` | Ollama client (structured JSON output, strips `<think>`), rewrite→review→repair loop for simplify (`simplifyBlocks.ts`), chat intent parsing (regex-based), Wikipedia/web lookup, screen vision, page passage retrieval, action tags the model can emit, navigation sanitizing. |
| Tests | `test/` | 79 vitest tests pass (1 live-model test skipped). Two Electron-run harnesses (`*.browser.ts`) are *not* in `npm test`. |

IPC surface is small: `prefs:get/set`, `ai:health`, `ai:simplify-chunks`, `ai:group-tabs`, `ai:infer-context`, `ai:recommend-links`, `ai:select-page-passages`, plus a chat handler.

### 1.3 Current features
- Tabs, back/forward/reload, omnibox, new-tab page with recommended links.
- Focus mode toggle: typography presets + manual "Simplify page".
- Simplify pipeline: extract blocks → LLM rewrite (JSON schema) → LLM *review* against source → repair → heuristic fallback; guards for dropped numbers, foreign metadata, incomplete sentences, wiki cite stripping, min-word floors.
- Chat sidebar: knows the current page (passages), can navigate ("take me to a good article about X"), search Wikipedia/YouTube, do web lookups (weather, factual), look at the screen with a vision model, emit page actions.
- "Why am I here?" box: infers why you opened a page from history.
- Tab grouping by AI and context inference.

### 1.4 What is genuinely good
1. **Local-first, no-account privacy story.** Real differentiator for a tool that reads everything you browse. Nothing leaves the machine except the web lookups you trigger.
2. **Simplify pipeline is unusually rigorous.** The rewrite→review→repair loop with deterministic checks (numbers preserved, complete sentences, word-count budgets, no foreign metadata) is the most serious engineering in the repo. Most "AI summarizer" extensions just prompt once and hope.
3. **Healthy module boundaries in `src/ai` and `src/focus`.** Small, pure-ish files that are unit-testable, and they are tested (fidelity fixture, cache keys, structured-output parsing).
4. **Clean baseline.** `tsc --noEmit` clean, 79 tests green, tiny dependency list (react, electron-store).
5. **Prompt-injection awareness** is present in the system prompts ("page text is untrusted data") and there is a `navigationSanitize.ts`.
6. **Think-trace handling** for Qwen3 means a reasoning model doesn't blow timeouts or JSON parsing.

### 1.5 What is bad (brutal version)
**Product**
- **The core promise is under-delivered.** The product is called an ADHD browser but the ADHD-specific value is thin: bigger text and a summarize button. There is no task/intent model, no distraction control, no time awareness, no body-doubling, no "get me back on track". It's currently "a Chromium wrapper with Ollama chat", which Arc/Brave/Edge + a Copilot sidebar already approximate.
- **Simplify is slow and fragile by design.** Multiple sequential LLM passes (rewrite, review, repair) on a 4B model for a whole page is minutes of latency on many machines, and it is manual-only. A user with ADHD will not wait. Quality on non-article pages (apps, feeds, forums, SPAs) is unproven; the test fixture is one automotive-engine article and Wikipedia is the tuned target.
- **Rewriting content is a trust problem.** A 4B model rewriting facts in place can silently change meaning. The review pass mitigates but doesn't eliminate that, and the UI doesn't make "this is a summary, here's the original" obvious enough to rely on (verify this before trusting it).
- **Hard dependency on a separate Ollama install + 2 model pulls.** Most target users will not do this. No first-run flow, no bundled model, no graceful "AI unavailable" product (only a health check).
- **Just removed the basics.** The last commit deleted bookmarks, find-in-page, context menu, and internal pages (`chrome://`-style). A browser without bookmarks or Cmd-F is hard to daily-drive. (Deliberate per owner, but it's a real gap.)

**Engineering**
- **`App.tsx` is a 1.1k-line god component** and `theme.css` a 1k-line single stylesheet. No state management, no tests for any renderer code, no component isolation. The recent rewrite (+1.1k/−3.6k lines) was committed **without anything exercising the renderer at runtime in this review** — treat UI correctness as unverified.
- **Regex-based intent parsing** (`chatAssist.ts`: stop-word lists, `KNOWN_SITES`, `extractTopic` regex chains) is brittle English-only heuristics. It will misroute constantly outside the happy path. A tool-calling model or a small router would be more robust and less code.
- **`<webview>` tag** is deprecated-ish in Electron and has weaker isolation than `WebContentsView`; it's also hard to do per-tab sessions/permissions/extensions with it. This is a foundation decision that gets costlier the longer it's deferred.
- **Security posture needs an audit.** Page text goes into prompts; model output drives navigation and "action tags"; scripts are injected into arbitrary pages; web lookup uses a spoofed Chrome UA. Needs a threat model (prompt injection → navigation/actions, injected-script escape, preload surface).
- **No CI, no packaged-app smoke test, browser harnesses outside `npm test`** so they can rot unnoticed. README is stale (still says `mistral:7b` default; code says `qwen3:4b`; doesn't describe sidebar, vision, new-tab, web lookup).
- **Dead/stub code:** `tabs.ts` is a no-op handler. `Prefs` is just `{ focusModeEnabled }`.
- **Wikipedia-shaped assumptions** (UA string, cite stripping, `article` intent) leak through the Focus and chat code. Generalization is the real test and hasn't been done.
- **Hard-coded UA** string referencing a GitHub URL (`rahulvuta/cclear`) that may not exist.

**Net assessment:** strong, careful core in the simplify engine; weak product framing, brittle chat/intent layer, an untested and oversized UI layer, and a big setup barrier. It's a promising prototype, not yet a product.

---

## Part 2 — Idea backlog

Tags: **V** = value (H/M/L), **E** = effort (S ≈ hours, M ≈ days, L ≈ weeks), **R** = risk/unknowns. "Dep" = depends on another idea.

### A. Make the ADHD value real (product)
1. **Intent / "session goal" bar.** On opening a window, ask "what are you here to do?" (one line). Everything keys off it: tab grouping, drift detection, summaries framed around the goal. *V:H E:M R:low.* Builds on existing "Why am I here?" and `infer-context`.
2. **Drift nudges.** Detect when current tab/topic diverges from the session goal and show a gentle, dismissible nudge ("You were on X — continue?"), never a block. *V:H E:M R:UX tone.* Dep: 1.
3. **Parking lot.** One-key "park this thought/tab" (Cmd-Shift-P) that saves the link + a one-line why, closes the tab, and reviews later. Removes the "but I might need it" tab-hoarding anxiety. *V:H E:S.*
4. **Tab diet.** Hard cap or soft cap on open tabs with auto-archive of stale ones into the parking lot with AI summary. *V:H E:M.*
5. **Focus timer / sprints.** Pomodoro-ish sprint bound to the session goal; end-of-sprint recap of what you read (auto-generated). *V:M E:M.*
6. **Site friction rules.** User-defined "time-sink" sites get a speed bump (10s pause + "why are you here?"), a daily budget, or grayscale. *V:H E:M R:easy to bypass; that's ok.*
7. **Reading progress & re-entry.** Remember scroll position + generate a "where you left off" 2-line recap when you return to a long page. *V:H E:M.*
8. **Body-doubling mode.** A tiny, quiet companion in the sidebar ("still with you") that checks in on a timer, celebrates finishes. Optional. *V:M E:S R:cheesy if overdone.*
9. **Task decomposition.** Paste a vague goal ("apply for passport"), get a stepwise checklist with links opened one step at a time. *V:H E:M.* Pairs with agentic browsing (E).
10. **Dopamine-aware end states.** Subtle completion feedback when a goal/sprint finishes; streaks without guilt. *V:L E:S.*
11. **Distraction-free "Single-tab mode"**: only the current tab exists visibly; others hidden in a drawer. *V:M E:S.*
12. **Notification & autoplay suppressor** by default: block autoplay video, sticky banners, newsletter modals, cookie walls, infinite-scroll "recommended" rails. *V:H E:M.*

### B. Simplify / reading engine
13. **Make it fast: streaming + lazy.** Simplify the viewport and next ~2 screens first, stream results into the DOM, defer the rest on scroll. Kills the minutes-long wait. *V:H E:M.*
14. **Drop the multi-pass LLM loop by default.** Single pass + deterministic checks; run the review pass only on blocks that fail a cheap check (numbers missing, length). Cuts latency 2–3x. *V:H E:S.*
15. **Show the original on demand.** Hover/click any rewritten block to reveal source; a global "toggle original/simplified"; diff highlights where numbers changed. Builds trust. *V:H E:S.*
16. **Non-destructive modes** instead of rewriting everything: (a) bionic/bold-first-letters, (b) key-sentence highlighting only, (c) TL;DR card at top, (d) "explain this paragraph" on select. Lower hallucination risk than rewriting. *V:H E:M.*
17. **Reader-mode extraction first** (Readability-style) so simplify works on clean article DOM; fall back to heuristics. *V:M E:S–M.*
18. **Page-type router:** article / docs / forum / product / feed / video / app. Different strategy per type (e.g., forum → thread summary, product → pros/cons/specs table). *V:H E:L.*
19. **Structured outputs:** convert dense pages into outline, key facts table, glossary, "what to do next" actions. *V:M E:M.*
20. **Reading-level slider** (grade 5 ↔ original) and **length slider**. *V:M E:S.*
21. **Dyslexia/ADHD typography options:** OpenDyslexic/Atkinson Hyperlegible, line focus ruler, paragraph dimming of everything except the one you're reading, adjustable line height/width. Pure CSS, no LLM. *V:H E:S.* Probably the best effort-to-value on this list.
22. **Read-aloud (TTS) with synced highlight** using macOS `say`/Web Speech or local Piper/Kokoro TTS. *V:H E:M.*
23. **Per-site memory:** remember the preferred mode per domain. *V:M E:S.*
24. **Eval harness for simplify** with ~30 diverse pages (news, docs, recipes, forums, Wikipedia, blogs) + automated fact-preservation score (numbers/entities recall, NLI check). Needed before tuning anything. *V:H E:M.*

### C. Local model choice & AI infrastructure
25. **Model tiers by task** instead of one model: tiny/fast (e.g. a ~1–3B) for routing, classification, tab grouping; mid (Qwen3 4–8B class) for rewriting/chat; vision model only on demand. *V:H E:M.*
26. **Candidates to benchmark on the eval harness (don't assume):** Qwen3 (4B/8B/14B), Gemma 3/3n, Llama 3.2/3.1, Phi-4-mini, Mistral small, SmolLM3; for vision: Qwen2.5-VL / Gemma 3 multimodal / MiniCPM-V in place of the older `llava`. Pick by measured fact-preservation per second on an M-series Mac. *V:H E:M.* (Model landscape moves fast — verify current availability.)
27. **Auto-detect hardware and recommend a model** (RAM, chip) at first run; download with progress UI. *V:H E:M.*
28. **Embedded runtime option:** bundle `llama.cpp`/`node-llama-cpp` or MLX so no separate Ollama install is needed. Biggest onboarding win and biggest packaging cost. *V:H E:L R:binary size, signing.*
29. **Optional cloud fallback** (user's own API key) behind a clear toggle for hard tasks or weak hardware; never default. *V:M E:S R:privacy messaging.*
30. **Speculative/draft decoding & KV-cache reuse** for repeated system prompts; keep model warm (`keep_alive`), prefetch on page load. *V:M E:S–M.*
31. **Tool-calling instead of regex intent:** replace `chatAssist` regex routing with a native function-calling schema (navigate, search, summarize, park, open_tab, find_in_page…). Smaller code, better coverage. *V:H E:M.*
32. **Local embeddings + vector index** (small embedding model) for history/page search and passage retrieval (replace keyword passage scoring). *V:M E:M.*
33. **Prompt-injection hardening:** separate trusted/untrusted channels, confirm-before-act for any model-initiated navigation or form action, output allow-lists, log what the model "saw". *V:H E:M (do before agentic features).*

### D. Chat sidebar & agentic features
34. **"Do it for me" agent mode** with visible, interruptible steps (open, click, fill) and a confirm step before irreversible actions. Start narrow (search → open result → extract). *V:H E:L R:high; reliability on 4B models is poor.*
35. **Ask-the-page with citations:** answers highlight and scroll to the source passage. *V:H E:M.* (Passage selection already exists.)
36. **Multi-tab questions:** "compare these 3 tabs", "which of my tabs mentions pricing". *V:H E:M.*
37. **Selection actions:** floating menu on selected text — explain, define, simplify, translate, save to parking lot. *V:H E:S–M.*
38. **Slash commands & quick actions** (`/summarize`, `/park`, `/steps`, `/compare`) so users don't have to phrase well. *V:M E:S.*
39. **Voice input** (local Whisper.cpp). Typing a prompt is friction for many ADHD users. *V:M E:M.*
40. **Persistent notes per session**, auto-appended with things you read/decided; exportable to Markdown/Obsidian. *V:M E:M.*
41. **Proactive but quiet suggestions** ("this page is 4,000 words — want a 5-bullet version?") shown as a small chip, never a modal. *V:M E:S.*

### E. Browser fundamentals (restoring what was deleted + more)
42. **Find-in-page, bookmarks, context menu, downloads, history page, settings page** — re-add in the new design, but thinner. Users won't daily-drive without these. *V:H E:M.*
43. **Migrate `<webview>` → `WebContentsView`** with per-tab partitions, proper permission handling, and session isolation. *V:M E:L R:significant refactor; do before the codebase grows further.*
44. **Content blocking** (ad/tracker lists via `@ghostery/adblocker-electron`) — also a core ADHD feature (less visual noise). *V:H E:S–M.*
45. **Chrome extension support** (limited in Electron) or a curated built-in set (uBlock-like, dark mode, password manager integration). *V:M E:L.*
46. **Password manager / autofill integration** via system keychain. *V:M E:L.*
47. **Vertical tabs / tab tree** with collapse and AI-named groups. *V:M E:M.*
48. **Session restore, crash recovery, multi-window, split view.** *V:M E:M.*
49. **Command palette (Cmd-K)** for tabs, history, actions, settings — pairs well with ADHD's need for low-friction navigation. *V:H E:S–M.*
50. **Keyboard-first navigation** (hints / vimium-style link labels). *V:M E:M.*

### F. UI / UX
51. **Calm visual language:** low-contrast chrome, one accent color, generous spacing, no badges/red dots, reduced motion by default; a real design token system instead of one 1k-line CSS file. *V:H E:M.*
52. **Three density/"intensity" presets:** Calm (minimal chrome), Standard, Coach (more prompts). *V:M E:S.*
53. **Onboarding that sets up Ollama/models and asks 3 questions** (goals, sensitivities, preferred reading style) to preconfigure everything. *V:H E:M.*
54. **Sidebar that is optional and resizable**, with a compact "pill" state; don't make the AI panel the default focus. *V:M E:S.*
55. **Visible AI state:** which model, local/cloud, tokens/sec, and a clear "thinking" progress for long operations with a cancel button. Right now long operations need obvious progress and cancel. *V:H E:S.*
56. **Accessible by default:** full keyboard navigation, screen-reader labels, WCAG contrast, respects `prefers-reduced-motion`/`prefers-color-scheme`. *V:H E:M.*
57. **Light/dark/sepia themes** and per-site overrides. *V:M E:S.*
58. **New-tab page as a daily dashboard:** today's goal, parked items, last read, one suggested next action — not a link grid. *V:H E:M.* Builds on existing new-tab page.
59. **Break-the-doomscroll UI:** at N minutes on a feed site, fade the page and show a one-line check-in. *V:M E:S–M.*

### G. Engineering health (enables everything above)
60. **Split `App.tsx`** into hooks/stores (tabs, focus, chat, prefs) + a small state lib (Zustand). *V:H E:M.*
61. **Renderer tests** (Vitest + Testing Library) and a **Playwright-for-Electron smoke test** that launches the app, opens a page, runs simplify against a local fixture server. *V:H E:M.*
62. **Add CI** (typecheck + vitest + build) and move the `*.browser.ts` harnesses into the test run. *V:H E:S.*
63. **Telemetry-free local diagnostics:** a debug panel with timings per pipeline stage, model I/O (opt-in), and exportable bug report. *V:M E:S.*
64. **Typed IPC layer** (single contract file generating preload + handlers) to prevent drift between `preload.ts`, `cclear-preload.d.ts` and handlers. *V:M E:S–M.*
65. **Refresh README and add `docs/ARCHITECTURE.md`,** delete the `tabs:noop` stub, fix the UA/GitHub URL. *V:M E:S.*
66. **Security review pass** (webview/preload surface, injected scripts, URL schemes, `navigationSanitize`, CSP). *V:H E:M.*
67. **Packaging:** code signing + notarization, auto-update, a first-run "model download" flow. *V:H E:M–L.*

### H. Wilder / longer-shot
68. **Personal "reading memory":** local knowledge base of everything you've read, queryable ("what was that article about X last week?"). *V:H E:L.*
69. **Energy-aware UI:** user sets energy level (low/med/high) each morning; the browser adjusts how much it simplifies, how many tabs it allows, and what it suggests. *V:M E:M.*
70. **Accountability partner mode:** optional shareable weekly summary (local-generated) to a friend/coach. *V:L E:M.*
71. **Dictation-to-form and "fill this form for me" with confirmation** for admin paralysis tasks (insurance, taxes, bills). *V:H E:L R:high.*
72. **Video support:** local transcript + summary for YouTube/lectures, chapter jump list, skip-to-the-point. *V:H E:M–L.*
73. **Email/newsletter triage mode** (via webmail pages) to a 3-item digest. *V:M E:L.*
74. **Plugin API** so others can add focus rules/site adapters; a community site-adapter repo for tricky pages. *V:M E:L.*
75. **Mobile companion** (read-later queue sync via local network). *V:L E:L.*

---

## Part 3 — Suggested triage (opinionated)

**Do first (cheap, high payoff, de-risks everything):**
- #62 CI + move harnesses into tests, #65 README/cleanup, #24 simplify eval harness, #60 split `App.tsx`.
- #21 ADHD typography/line-focus/paragraph-dimming (pure CSS), #15 show-original, #55 progress+cancel, #14 cut LLM passes, #44 content blocking.

**Then the product identity (this is what makes it *not* "Chromium + chat"):**
- #1 session goal, #3 parking lot, #4 tab diet, #7 re-entry recap, #2 drift nudges, #58 goal-centric new-tab page, #49 command palette.

**Then robustness of the AI layer:**
- #31 tool-calling replaces regex intents, #25/#26 model tiers benchmarked on the eval harness, #33 prompt-injection hardening, #13 streaming/lazy simplify.

**Then onboarding/distribution:**
- #53 first-run, #27 hardware-aware model pick, #28 embedded runtime (the big one), #67 signing/updates, #42 restore find/bookmarks/context menu.

**Defer / only with a strong reason:** #34 agent mode (until #33 and #31 are solid), #43 `WebContentsView` migration (do it early or not at all), #45 extensions, #71 form-filling, #75 mobile.

## Part 4 — Open questions for the owner
1. Who is the user: people with ADHD generally, students, or knowledge workers? This decides whether #1–#9 (coaching) or #13–#24 (reading) is the lead.
2. Is "no setup, local-only" a hard requirement (forces #28), or is a cloud-key fallback (#29) acceptable?
3. Were the Chrome-style features removed to simplify the product, or only to reset the UI? (Determines #42.)
4. Target hardware floor (8 GB M1?) — governs model choices in #25/#26.
5. Is rewriting page content in place a must-have, or is it okay to prefer non-destructive aids (#16)?
