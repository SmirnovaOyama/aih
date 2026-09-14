## v0.8.7 — TUI input-history browsing no longer trips the wheel-loss detector

### Fixed
- **Fast ↑ history browsing mis-fired the wheel-restore path** (`cli/src/tui.ts`):
  the old "≥3 arrows in 900ms" heuristic treated *real rapid ↑ presses* as the
  terminal having lost mouse tracking (wheel-as-arrows), which rolled the
  composer back and swallowed subsequent ↑ keys (`#swallowArrows`) until the
  900ms window expired — "can only press ↓, then nudge the wheel to continue".
  Now `#isWheelBurst` requires the **last 3 arrows to share one direction AND
  arrive ≤80ms apart** (the signature of a terminal-forwarded wheel flick);
  human-rhythm keys (>80ms apart, or mixed ↑/↓) never match.

### Testing
- New smoke regressions: 5 fast ↑ presses (120-240ms apart) recall history
  without being swallowed; no "mouse tracking" hint appears; ↓ still moves
  forward. Original wheel-burst test (0ms feed) still passes — real flicks are
  still detected and the composer restored.
- `npm run build` + all smoke suites green (1865 ok).