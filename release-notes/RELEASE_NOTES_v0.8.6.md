## v0.8.6 — Fifth-round audit fixes (readonly veto expansion, MCP param validation, env-policy broadening)

### Security & Correctness
- **F5**: MCP server — validate action parameters type before registration (fixes shapeOf() bypass)
- **F6**: Readonly mode — add `-s`/`--set` to dangerous substrings (blocks `date -s` system time writes)
- **F7**: Readonly mode — add `-ok`/`-okdir` to defensive blacklist (blocks `find` interactive exec)
- **F8**: Env policy — expand SECRET_HINT regex to catch `AUTH`, `CRED`, `ACCESS` patterns

### Infrastructure
- **F9**: Offline package config merge — already had T1 P1 fix (secret-shape scan)
- **F10**: TUI ANSI injection — already handled by #paintGuard method


### Sixth-round audit fixes (G-series)
- **G1**: MCP shapeOf — duck-typed Zod validation (unwraps `z.object` shape, fails fast on non-Zod params)
- **G2**: MCP textResult — JSON replacer guards circular refs / bigint / functions
- **G3**: MCP per-call 120s timeout (`AIH_MCP_TOOL_TIMEOUT_MS`), timer unref+clear
- **G9**: jobs.json read-modify-write race — `withBoardLockSync` mutex around spawn/finish/cancel
- **G10**: jobs.json atomic temp+rename publish
- **G11**: update staging dir gets PID+rand suffix (concurrent same-version safety)
- **G12**: piped stdin capped at 10 MiB
- **G15**: `@aih/core` dependency aligned 0.2.0 → 0.7.2 (npm ls ELSPROBLEMS fixed)

### Testing
- All npm run eval checks pass
- Smoke tests verify readonly veto expansion and MCP param validation
