## [0.8.14] - 2026-09-20

### Added

- **SOCKS5 proxy for `webfetch` / `websearch`** (`cli/src/socks-proxy.ts`, `cli/src/general-tools.ts`, `cli/src/config.ts`): outbound web tools can now route through a SOCKS5 tunnel. Configure it in `aih.json` / user config / project config (later layers win):
  ```json
  { "proxy": { "socks5": "127.0.0.1:1080" } }
  ```
  Optional `username` / `password` for authenticated proxies, and a `timeoutMs` override. Env `AIH_SOCKS5_PROXY=host:port` wins over config. Implemented with undici's official `Socks5ProxyAgent` (pure JS, no native deps) so it handles the CONNECT handshake, optional auth, and the TLS wrap for HTTPS targets — and bundles cleanly into the offline package. With no proxy configured, `webfetch` / `websearch` fall back to the direct path exactly as before.

### Changed

- **Auxiliary LLM calls now stream at the adapter level** (`core/src/seams/llm-openai.ts`, `core/src/agent-loop.ts`): side-calls that bypass the main loop's streaming — goal judge, `best_of_n` judge, MEA guardian/auditor, dream/title/branch distillation, and the compaction summary — previously emitted `stream:false` and were rejected by gateways that only accept streaming from a keyless client. The adapter now decides the stream decision in one place, so every such call is covered and the final text is still fully assembled. No behavior change for callers that only need the final response.
- **Clean-slate offline packaging** (`scripts/offline-package`): the packaged default config now ships **no providers, no models and no proxy** — a clean slate so each user configures their own endpoint after install. The build machine's local `aih.json` (providers, models, proxy, local endpoints) is stripped, not merged, so nothing machine-local leaks into the installer.
- **Fresh-install startup guidance** (`cli/src/index.ts`): with nothing configured, `aih run` / `aih chat` no longer fail with a cryptic "no API key" / "no model id" error. Instead the user is pointed at the setup path:
  ```
  aih connect                       # browse the provider catalog
  aih connect <id> --key <API_KEY>  # save a provider + key
  ```
  or add a provider to `aih.json`. Self-hosted / keyless endpoints need no key; `--mock` runs an offline demo.
- **TUI multi-select + compaction hints** (`cli/src/tui.ts`): the multi-select column window widens monotonically (drag right-then-down keeps the swept width), and the status area surfaces an "▲ compact soon (auto ≥ 80%)" warning.

### Fixed

- **node tarball silently dropped new runtime deps** (`scripts/package`): the runtime dep list was hardcoded (`@modelcontextprotocol/sdk` / `string-width` / `zod`), so a new runtime dep added to a workspace (e.g. `undici` for the SOCKS5 proxy) was missing from the tarball and the staged-tree sanity check failed. The dep set is now derived dynamically from each workspace's `package.json` (matching `scripts/offline-package`), so adding a dep to a workspace ships it automatically.

### Docs

- **0.8.13 release page width** (`docs-site/style.css`): the content column was capped at 840px and left-aligned inside a ~1200px content area, leaving a large empty band on the right. The reading column is now wider and centered, so the page uses its width properly on desktop while staying responsive on mobile.

Full changelog: https://github.com/summit4you/aih/blob/main/CHANGELOG.md
