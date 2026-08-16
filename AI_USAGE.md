# AI usage disclosure

This file records how AI was used to make CCLEAR, for the Congressional App Challenge submission. **The student should review and complete the bracketed parts so they describe their own work accurately.**

## AI inside the app
CCLEAR runs a local language model (default `qwen3:4b` through Ollama) on the user's own computer for: step suggestions, judging whether a page fits a goal, command routing, reader-view summaries, answering questions about the open page, and optional in-place simplification. No data is sent to an external AI service. Model output is validated (schemas, number checks, citation checks) and never executes actions without the deterministic action gate.

## AI used to build the app
- **Tool:** Claude (Anthropic) through Claude Code, an AI coding assistant. Commits made with its help carry a `Co-Authored-By: Claude` trailer in `git log`.
- **What the assistant did in this development cycle (October 2026):** audited the existing code; proposed and triaged feature ideas (`docs/PROJECT_REPORT.md`, `docs/CAC_2026_PLAN.md`); wrote most of the implementation for the goal/steps/parking/nudge system, reading tools and reader view, cited answers, the action gate and security hardening, the ad blocker, settings/model manager, command palette, tests, benchmark harness and documentation; and ran the app's automated tests and end-to-end checks.
- **What the student did:** [Describe your own contributions: the original idea and the problem you chose, your product decisions (target users, answers to design questions, what to build or cut), the earlier versions of CCLEAR, your testing and feedback, anything you wrote or edited yourself, and who you tested with.]
- **Earlier work:** commits before October 2026 include the original Electron shell, Focus mode, simplification pipeline and sidebar assistant. [State which of those you wrote and which were AI-assisted.]

## Verification
Generated code was checked with: type-checking, ~140 unit tests, a scripted end-to-end run of the real app against the real local model, and manual review of screenshots. Known limitations are listed in `README.md`.

## Third-party
Electron, React, Vite, electron-store, Vitest (see `package.json`); Ollama and the open-weight models it runs (e.g. Qwen3) under their own licenses. Demo pages in `demo/` are original text written for this project.
