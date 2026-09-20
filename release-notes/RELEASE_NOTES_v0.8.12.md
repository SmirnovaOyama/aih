## [0.8.12] - 2026-09-17

### Fixed

- **steering input swallowed at the final step** (`core/src/agent-loop.ts`): steering queued while the model was about to end the turn was silently dropped. The final-step drain now appends pending steering to the log and runs one more step to process the user's instruction.
- **compaction failures were silent no-ops** (`core/src/agent-loop.ts`): an empty summary left the context bloated with no diagnostic (next LLM call could 400 or hang). Empty summaries now emit `[aih] compaction produced empty summary (turn=…, head=N msgs)` on stderr; `#compactOrSkip` errors gain `turn=` + `trigger=auto` context. The compaction summary template now also mandates preserving USER AUTHORIZATION STATE verbatim (`已获授权推送` / `未经允许不 commit` / `不修复` are behavioral constraints, not work items — losing them makes the agent act without permission or redo declined work).

### Changed

- **model picker MRU** (`cli/src/mru.ts`): providers/models used most recently float to the top of the `/model` palette (deduped by provider/model, rest keep config order); recorded only on SUCCESS so failed switches don't pollute recents.
- **steering recall (↩ / Alt+Up)** (`cli/src/tui.ts`): pull the most recent NOT-yet-drained steering message back into the editor for editing/resubmission; once drained it is part of the turn and cannot be recalled.
- **question UX** (`cli/src/tui.ts`): `askQuestion()` forces `#pinned` + scroll-to-bottom so the question text is never hidden behind the option panel while browsing history; custom free-text mode is exitable (backspace on empty buffer → back to options).
- **Ctrl+R fallback** (`cli/src/tui.ts`): secondary keybinding for steering where the primary is taken.

Full changelog: https://github.com/summit4you/aih/blob/main/CHANGELOG.md
