---
title: Changelog
description: AIH release notes — key changes in 0.8.x / 0.7.x / 0.6.x / 0.5.x.
---

# Changelog

The full itemized record lives in the repo [`CHANGELOG.md`](https://github.com/summit4you/aih/blob/main/CHANGELOG.md) (Keep a Changelog format, SemVer). This page is a per-version summary.

## 0.8.12 (2026-09-17)

**Fixed**

- **opencode zen free tier 403 (invalid session id format)** — session files are named `s-YYYYMMDD-HHMMSS` and were passed straight into `x-opencode-session`; the gateway validates the id FORMAT (`ses_` + 26 base62), so every request 403'd. `normalizeSid()` now remaps any non-conforming id to a fresh valid `ses_<26>` body, STABLE per input (one conversation = one gateway session across requests).
- **steering input swallowed at the final step** — steering queued while the model was about to end the turn was silently dropped. The final-step drain now appends pending steering to the log and runs one more step.
- **compaction failures were silent no-ops** — empty summaries left the context bloated with no diagnostic. They now emit a stderr line with `turn=` / `trigger=auto` context; the summary template also preserves user authorization state verbatim.

**Changed**

- **model picker MRU** — providers/models used most recently float to the top of the `/model` palette (deduped; rest keep config order).
- **steering recall (Alt+Up)** — pull the most recent undrained steering back into the editor; Ctrl+R fallback; question UX pinned + scroll-to-bottom + exitable custom free-text mode.
- **packaging strips opencode client-identity headers** — the packaged default config no longer ships `x-opencode-session` / `x-opencode-client` / `x-opencode-project` / `x-opencode-request` / opencode user-agent for opencode.ai providers — AIH must not impersonate the opencode official client. Free model lists are preserved; configure headers yourself in aih.json if you want the zen tier.

## 0.8.11 (2026-09-15)

**Fixed**

- **question options silently dropped at the TUI boundary** — the agent wiring passed only `(q)` to the `ask` callback, so LLM-supplied `options` never reached `Tui.askQuestion` and the choice list fell back to the plain free-text input (the smoke suite exercised `Tui.askQuestion` directly, bypassing the callback, so it stayed green). The wiring now forwards `(q, options)` and the non-TTY stdin fallback renders the option rows too.

## 0.8.10 (2026-09-15)

**Fixed**

- **Compaction starved by shrunk provider prompt_tokens** — after a model switch the provider-reported token count shrank, so the old heuristic skipped compaction ("context not tight"). `agent-loop.ts` now cross-checks the local estimate; compaction is no longer wrongly skipped.

## 0.8.9 (2026-09-15)

**Fixed**

- **TUI keyboard: connect-provider sub-menu Esc then Enter deadlock** — Esc on the first-level menu left focus state misaligned with the Enter default, so Enter hung; state reset fixed.
- **`aih update` lost user config after upgrade** — `applyUpdate` merged config trusting only the new package config, overwriting the user layer; it now preserves the user config layer.

## 0.8.8 (2026-09-14)

**Fixed**

- **`aih update` failed on Windows offline installs (`EPERM: unlink node.exe`)** — offline installs deploy a portable Node.js at `app\.node\...\node.exe` and the running AIH process IS that exe. The old whole-app rename swap (app → .bak, new → app) tried to remove/rename the RUNNING executable — Windows forbids it. When `app\.node\` is detected, `applyUpdate` takes a **copy-over** path: it copies the new payload (aih, lib/, node_modules/, package.json) over the old app dir and leaves `.node\` fully untouched — no rename/remove of the running executable → no EPERM. Plain tarball installs keep the original atomic rename swap.

## 0.8.7 (2026-09-14)

**Fixed**

- **TUI input-history browsing falsely triggered wheel restore** — rapid ↑ presses while paging input history were misread as output scrolling and snapped the view back to bottom; distinguishing "input history browsing" from "task output scrolling" pinned-state fixed.

## 0.8.6 (2026-09-14)

**Security**

- **MCP parameter validation hardened** — action parameter schemas are validated before registration; invalid params are rejected.
- **Readonly-mode execution surface hardened** — write-capable flags like `date -s`/`--set` are blocked; read-only shell cannot be tricked into writes.
- **Env-var redaction expanded** — SECRET_HINT regex covers more secret shapes.
- **jobs.json read-modify-write race** — concurrent spawn/finish/cancel lost task-board state; atomic updates now.

**Fixed**

- **MCP tool call timeout** — per-call 120s timeout, no more hangs.
- **MCP error serialization crash** — textResult JSON replacer handles circular ref/bigint/function.
- **jobs.json non-atomic write** — saveBoard uses temp+rename atomic publish.
- **Update staging directory clash** — staging dir gets PID+random suffix.
- **Unbounded piped stdin** — `aih run <` input capped at 10 MiB, over-limit errors.
- **@aih/core dependency version skew** — cli core dep 0.2.0 → 0.7.2 fixed.

## 0.8.5 (2026-09-13)

**Fixed**

- **Background agent env leak (security)** — jobs/teams background tasks inherited the host's full env including secrets; now built from a controlled env.
- **readonly-allow missed `find` write flags** — `-delete`/`-exec`-style write flags weren't in the readonly allowlist check; completed.

## 0.8.4 (2026-09-13)

**Fixed**

- **Release supply-chain integrity (security)** — packaging/install scripts hardened against tampering.
- **Offline package credential leak (security)** — merging configs mixed local provider keys into the package; now ships an empty config.
- **todo store non-atomic write data loss** — `mcp-server/src/app-adapter.ts` switched to temp+rename atomic write.
- **Third-party MCP tools auto-allowed (security)** — tools without declared permissions now default to deny instead of silent allow.
- **webfetch HTML entity out-of-range** — `&#(\d+);` beyond Unicode crashed; clamped.
- **smoke credential-shape assertion tautology fixed** — assertion shape corrected, no longer always true.

## 0.8.3 (2026-09-13)

**Fixed**

- **`aih workflow list` no longer executes workflow code (security)** — the list command inadvertently imported workflow modules, running side effects; now reads metadata only.
- **MCP server child-process env redaction (credential surface)** — MCP children inherited the parent's secret-bearing env; now a controlled env is passed.

## 0.8.2 (2026-09-13)

**Fixed**

- **Permission-gate path traversal (security, R3 P1)** — `RulesetGate.evaluate/explain` didn't normalize path args, so `..` could bypass deny rules; path normalization + matching added.
- **Non-TTY ask hang (R3 P2)** — `SessionGate` falls back to readline when there's no TUI instead of waiting forever.
- **Concurrent ask slot race (turn hang, R5 P1)** — two concurrent `permission="ask"` tools rendered one slot and the other hung forever; concurrency queue added.
- **/model switch instantaneous 6k context flash (panel mismatch)** — context estimate口径 differed between `applyModel` and the panel; unified.

## 0.8.1 (2026-09-10)

**Added**

- **Self-update supports GitHub mirrors for mainland China (offline / GitHub-unreachable fallback)** — `cli/src/update.ts` falls back to mirror sources.
- **Same-version release re-upload detection** — refreshing a release with `--clobber` also triggers update (same version with changed sha treated as new).

**Fixed**

- **TUI messages delayed seconds after input** — session-log writes blocked UI rendering; async fix.
- **Windows `aih update` extraction failure** — `.bin\node-which` invalid path; packaging script fixed.
- **TUI todo panel vanished after compaction/finish** — panel state preserved through compaction.
- **End couldn't jump to bottom while browsing history** — VT `ESC[4~` unhandled; key added.
- **Scrolling history during a task snapped back to bottom** — missing pinned state, `#follow()` pinned unconditionally; pinned added.
- **`o`/`O` untypeable in an empty input box** — toggle shortcut collided with the letter; empty-input key priority gives the letter.
- **First `o`/`O` after restart swallowed** — DSR probe chunk drop race; probe response no longer eats the first char.

## 0.8.0 (2026-09-07)

**Added**

- **Network-failure resilience (turn-level park-and-retry)** — stream `finish_reason: network_error` / dropped connection parks the turn and retries without losing context.
- **Hook fault isolation** — a throwing hook in the tool registry / permission seam no longer drags down the main flow.
- **Credential storage boundary cleanup** — `sanitizeCredential` keeps keys in credential slots only, out of core state.
- **Skill visibility layering** — frontmatter `visibility:` support.
- **edit auto-repair + protected zones** — failed edits retry with smaller steps; protected zones (e.g. credential files) cannot be edited.
- **prompt-cache bucket stats** — per-window bucket statistics quantify prefix-stability gains.
- **Reversible secret placeholders** — secrets hidden in tool output as reversible placeholders (no leaks, replay intact).
- **Read-only shell defensive veto** — `readOnlyBash` vetoes write commands at the permission seam.
- **Branch distillation** — `checkRestoreSafety` prevents branch switches from clobbering unmerged work.
- **Doom-loop escalation observer + repeated-call halting** — detects repeated tool-call loops and escalates.

## 0.7.2 (2026-09-06)

**Added**

- **`read_file` dual budget + four-state truncation** — line + byte dual budget, truncation keeps head/tail with an elided marker.
- **Compaction file manifest** — compaction records the session's touched files so context clues survive.
- **Read-only bash guardrail + guarded write tools** — read-only mode distinguishes "pure read" from "guarded write" (bounded writes allowed); path-scoped sibling assertions aligned.

**Changed**

- `core/src/smoke.ts` — sibling write-tool assertions aligned to KL-R#4 guarded semantics.

**Fixed**

- **TUI display fixes** (opencode / mimo-code parity) — Linux cursor, block-char usage bar, meta-row fold.

## 0.7.1 (2026-09-06)

**Changed**

- **Windows/PowerShell TUI display fixes** (opencode / mimo-coder parity) — conhost keyboard expand, margins, ASCII usage bar, UTF-8 codepage compatibility.

## 0.7.0 (2026-09-06)

**Added**

- **In-stream `finish_reason: network_error` retry** (opencode v1.18.20 parity) — network errors don't drop the response mid-stream; the same turn auto-retries.
- **prompt-cache prefix stability** — system prompt gains a prefix-stability discipline section; volatile content moved later so the cache prefix stays intact.
- **remember over-budget explicit warning** — writes past `AIH_MEMORY_BUDGET` warn explicitly instead of silently truncating.
- **upstream-review skill hard gate** — upstream mechanism claims require local source reading + `file:line` citation; unverified claims degrade to "unverified (leads)".
- **MCP add_todo batch form** — `items` array (1–50) adds many rows in one call, avoiding re-planning.
- **Windows compatibility (mimo-code parity)** — run_cmd/sandbox resolve and execute the shell on win32.
- **Smoke suite hang fixed** — live tsserver child spawned-never-closed hang; now closed.

## 0.6.0 (2026-09-05)

**Added**

- **MEA independent-judgment layer (LH#1 + CX-R#1 merged, top roadmap item)** — Manager/Executor/Auditor three-role loop with a verified-state ledger: the auditor independently verifies each executor action before it's ledgered; the model's self-report is not evidence — no more "self-judged" loops.
- **Textual-grant bridge (`permissions` tool)** — when the user grants tool access in conversation ("直接写" / "不用确认"), the agent converts it into a real permission rule via the `permissions` tool — prose acknowledgment alone no longer leaves the gate unchanged.
- **CL-R#3 two-part rejection messages rejected (cline isomorphic)** — all permission-denied errors append REJECTION_SUFFIX; the model no longer mistakes a denial for a retryable error.
- **KL-R#3 sub-agent permission propagation** — `RulesetGate.subagentGate()` — parent deny rules propagate to sub-agents; sub-agents cannot overstep.
- **RulesetGate.explain()** — returns the highest-priority winning rule, surfaced on SessionGate deny.

**Changed**

- **OMP-R#1+OCL-R#4 retry upgrade** — `retryAfterHintFromHeaders()` multi-source hint resolution merged.
- **OMP-R#7 memory truncation marker** — fitBudget truncation appends an actionable hint.
- **OMP-R#10 replay-policy** — deriveMessages filters turn/end stopReason semantics.
- **kl-R#5 truncation recovery message** — continuation instructions upgraded after truncation.
- **TUI footer hint mode-aware** — bottom hints sync with run-or-copy confirm ([R]un [C]opy [N]o).

## 0.5.0 (2026-09-02)

**Added**

- **Provider catalog + `/connect` interactive login (opencode `/connect` parity, OpenAI-compatible scope)** — `connectCatalog()` returns a curated catalog of OpenAI-compatible providers (popular first; native-SDK Anthropic/Google excluded). TUI `/connect` and `aih connect [<id>]` walk provider selection → API key entry (persisted to the env file chmod 600, NEVER into aih.json) → `saveProvider()` writes config (`apiKeyEnv` names the env var, the key itself never stored) → model applied immediately. Unconfigured providers appear as "+ connect" entries at the bottom of the `/model` picker.
- **Docs-site tutorial extension (batch 3 + Ch.19 HemaGuide case)**, **rules loading (opencode `rules` parity)**, **provider policies**, **configurable keybinds**, **credential owner isolation (OC#7)**, **live-verify / check-existing-first disciplines (OC#3)**, **core per-call tax governance (OC#2)**, **trust model statement (OC#4)**, **`aih doctor --fix` config self-healing (OC#5)**, **maturity scorecard (OC#6)**, **BuffBench-style quality eval + baseline regression gate (FB#4)**.

**Fixed**

- **Overlay picker scroll highlight drift ("chose one, got another")**: the `/model` / ctrl-p palette compared a window-relative loop index against the global `sel`, so scrolling long lists highlighted a different row than the one actually selected; `paletteWindow()` now returns the window-relative highlight.
- **Phantom near-full context / false compaction on model switch**: free-tier gateways (opencode zen go) report CUMULATIVE `prompt_tokens` (949K / 3.2M observed on a ~78K-token conversation); the old `prompt_tokens ≤ 2×window` gate admitted those once the window grew to 1M (deepseek-v4-flash), flashing "949K ≥ 800K compact needed" when switching big-pickle (200k) → deepseek-v4-flash (1M). Plausibility now cross-checks the local chars÷4 estimate both directions — report ≫ estimate = cumulative garbage (estimate wins), estimate ≫ report = stale sample (estimate wins). Fixed in `agent-loop.ts` and `cost.ts`.

## 0.4.0 (2026-08-29)

**Added**

- **Safety seam (PE#1 / PE#2 / PE#4)** — the harness enforces safety, not the model. **PE#2 budget**: `maxCostUsd` / `maxWrites` / `timeoutMs` / `denyPaths` hard bounds stop the turn with an `escalate` event; a soft tripwire (task cost ≥ 2× session mean) hints once without blocking (`AIH_BUDGET` or `safety.budget`). **PE#1 sensors**: after a write, run a declared check (`AIH_SENSORS`), red → bounded retry → escalate; sensor children inherit no secrets. **PE#4 escalate**: a model-invisible `escalate` event (`reason` + `options` + `safestDefault`); non-interactive `run` exits **code 3**, the TUI renders the options. **`test/recovery.sh`**: crash → resume parks the tool (outcome unknown) and does not re-dispatch it.
- **Intelligent Terminal UX (IT#1–IT#5)** — **IT#1** `shell_context` tool + `/shell` + `AIH_SHELL_CONTEXT=auto`; **IT#2** deterministic failure detection + red `⚠ N failed` badge + `/fix`; **IT#3** `?` prefix starts an agent task with shell context auto-injected; **IT#4** `/sessions` panel (dashboard / `kill <id>` / `view <name>`); **IT#5** run-or-copy approval `[R]un / [C]opy / [N]o` for write commands.
- **`aih measure` distance ruler (PR#2)** — `distance` / `stream` (seeded permutation test) / `crystallize`; pure functions, `--json` out.
- **`aih session rm --all`** — real `-a/--all` flag to clear every saved session.
- **Quota auto-resume (CC#51)**, **read-only auto-allow (CC#54)**, **credential scope (CC#59)**, **BOM tolerance (CC#55)**, **MCP empty-schema (CC#56)**, **`/usage` per-loop breakdown (CC#57)**, **TUI truncation (CC#58)**, **injected-source isolation (CC#60)**, **question tool**, **bilingual docs site + GitHub Pages**, **harness scorecard (PE#3)**, **`escalate` event (PE#4 foundation)**.

**Fixed**

- **Tool-output budget marker (FA#2)**: the old cryptic truncation marker no longer blind-loops the model — it now tells it to stop re-issuing tools and wrap up.
- **Language rule covers progress notes**: every user-facing text (final answer *and* mid-task progress notes) matches the user's language.
- **Slash-command parsing**, **subagent partial results (CC#50)**, **`load_skill` dedup (CC#52)**, **permission ask for write tools (CC#53)**.

## 0.3.0 (2026-08-26)

**Added**

- **Per-event session durability**: `chat` now appends every event to the session file as it happens (byte-watermarked incremental flush), so a long multi-tool turn survives a crash or kill instead of living only in memory
- **Extension API (P#39)**: `.aih/extensions/*.mjs` modules — `registerTool`, `registerCommand`, `on("tool:before" | "tool:after" | "turn:end")` handlers that can cancel calls or rewrite results in place; `--no-extensions` disables loading; gated by the project trust decision
- **Session tree (P#37)**: events carry optional parent links; `aih session tree` renders the branch structure and TUI `/tree` navigates it, with fork from any historical point
- **Steering + follow-up queues (P#35)**: input typed while busy now lands mid-turn (between tool batches) instead of waiting; follow-up queue drains at the natural stop point
- **Project trust gate (P#40)**: repo-supplied extensions/skills/config stay dormant until the directory is trusted; decisions persist per-path in the user dir; `--trust` / `--no-trust` one-shot overrides
- **Eval framework phase 1 (P#46)**: Experiment → Cells → Attempts → Results data model for measuring harness changes against fixed task sets
- **Context prune + lazy archive (MK#43)**: oversized old tool results are pruned once per session start and retrievable verbatim via `archive_read`
- **Compaction coverage digest (MK#42)**: summaries stamp what they replace
- **User-level memory + background jobs + memory tidy**: `remember` gains `scope: project|user`; `/bg <prompt>` dispatches isolated background agent turns; `aih tidy` / `aih distill` dedup memory and mine repeated flows
- **BM25 skill relevance + streaming TPS**: installed skills are ranked against the user query and auto-surfaced before each turn; per-request streaming throughput shown in `/usage`, `aih stats`, and the TUI context panel
- **Skill-driven hook config (D#11)**: a skill's front matter may declare `secretPatterns` that the built-in redaction hook masks
- **Agent Teams (minimal) (D#15)**: `aih team` manages a roster, a task board, and a per-agent mailbox
- **`/find` tool-output search (T#22)**: search across every tool's output, expand matched tools and scroll the first hit into view

**Fixed**

- **Context panel truthfulness**: free-tier gateways reporting cumulative or garbage `prompt_tokens` no longer reach the display — usage samples are window-bounded, a compaction is a hard provenance cutoff, and stale samples fall back to local estimation
- **CJK-aware token estimation**: flat chars÷4 undercounted Chinese + JSON sessions ~3×; now corrected

## 0.2.0

**Added**

- **Codex-inspired hardening**: child-process env policy strips secret-like variables (`KEY`/`TOKEN`/`SECRET`/`PASSWORD`, `AIH_*API*`) before spawning tools; `--debug-prompt` prints the exact model-visible messages per LLM call; skill roster injected into the system prompt within a ~2% context budget
- **Multi-model catalogs**: providers may declare `models[]`; ctrl-p and `/model` switch between verified models at runtime
- **Live context-window detection and proactive / reactive / manual compaction** with verbatim recent-tail preservation and rolling summaries (`compactNow()`, `/compact`); user-query invariant keeps strict chat templates working after compaction
- **TUI design pass** (split/unified layouts, paste fix) and richer session introspection

## 0.1.0

**Added**

- Initial harness: `AgentLoop` step engine with max-steps handoff prefill, `SessionLog` append-only JSONL persistence + fork/replay, `ToolRegistry`, `PolicyGate` / `RulesetGate` approval flows, path-scoped write approvals, plan/read-only mode
- MCP server exposing app context/actions; CLI entry points (`run` / `chat` / `tools` / `describe` / `sessions`), bundled todo-app example, OpenAI-compatible adapter with SSE streaming and 429/5xx retries
- Contract docs (`APP.md`, `harness.yml`) and gates: `doctor`, `check`, smoke tests, full `eval`
