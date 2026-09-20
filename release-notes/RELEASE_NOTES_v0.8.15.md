## [0.8.15] - 2026-09-20

### Added

- **SOCKS5 proxy for LLM requests** (`cli/src/index.ts`): LLM API calls now route through a SOCKS5 tunnel when `proxy.socks5` / `AIH_SOCKS5_PROXY` is set. `buildRealLlm` injects a `socksFetch`-based `fetchImpl` into `OpenAICompatibleLLM` (which already accepts a caller-supplied `fetchImpl`), so any provider's requests can go through a SOCKS endpoint — self-hosted networks, corporate egress, or a supported-region exit. No core changes.
- **`/socks` runtime toggle** (`cli/src/index.ts`, `cli/src/tui.ts`, `cli/src/slash.ts`): switch the LLM SOCKS5 proxy on/off without restarting. Bare `/socks` flips the state (on⇄off); `/socks on|off` sets it explicitly. A `socksOverride` gates the `fetchImpl` injection (off forces direct even when `aih.json` has `proxy.socks5`), and the TUI status line surfaces a `SOCKS on` / `SOCKS off` indicator after the agent tag. Registered as a builtin slash head so it is recognized while busy, with completions and a palette entry.

### Fixed

- **Bounded network recovery in the agent loop** (`core/src/agent-loop.ts`): a provider that accepts the connection but never answers (silent timeouts) could make every user message spin for minutes and re-burn the whole retry budget on the next message. A cumulative, TURN-level park cap (`MAX_NETWORK_PARK_WAITS`, symmetric with `MAX_QUOTA_WAITS`) now bounds the waits; exceeding it ends the turn honestly with a dedicated `network_exhausted` stopReason instead of hanging. The TUI surfaces a clear "network retries exhausted" hint.
- **Response-header timeout at the adapter** (`core/src/seams/llm-openai.ts`): a provider that accepts the TCP/SOCKS connection but never returns HTTP headers would hang the fetch forever (TUI spins, no `turn/end`). A `RESPONSE_HEADER_TIMEOUT_MS` guard (default 60s, `0` disables) bounds the header wait and reclassifies the timeout into a message the network-retry path owns, so it folds into the extended retry budget and the turn-level cap above.
- **Guardian reviewer session parity + event persistence** (`cli/src/index.ts`): the Guardian's auxiliary review LLM now shares the main loop's conversation-stable session identity (`x-opencode-session` affinity) across all three call sites (`run` / `workflow` / TUI `chat`), so it no longer diverges onto a per-instance random id that can surface as provider-side denials. Every review result is also persisted to the session log as a model-invisible `app/event` (`source: "guardian/review"`), so denial/error outcomes are visible in the JSONL instead of only on the terminal.

Full changelog: https://github.com/summit4you/aih/blob/main/CHANGELOG.md
