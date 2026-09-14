## v0.8.8 — `aih update` works on Windows offline installs

### Fixed
- **`aih update` failed on Windows offline installs with
  `EPERM: operation not permitted, unlink node.exe`** (`cli/src/update.ts`):
  offline installs deploy a portable Node.js at `app\.node\...\node.exe`
  and the running AIH process IS that exe. The old whole-app rename swap
  (app → .bak, new → app) then tried to remove/rename the RUNNING
  executable — Windows forbids it, so applying 0.8.6 → 0.8.7 aborted.
  A prior guard (945d786) attempted to refuse offline auto-update via a
  shebang check, but the Windows offline launcher shares the same
  `#!/usr/bin/env node` head as the tarball launcher, so it never fired.

- **Fix** (per your direction — update should skip node, the bundled node
  keeps working): when `app\.node\` is detected, `applyUpdate` takes a
  **copy-over** path — it copies the NEW payload (aih, lib/, node_modules/,
  package.json) over the old app dir and leaves `.node\` fully untouched.
  No rename/remove of the running executable → no EPERM. Plain tarball
  installs keep the original atomic rename swap.

### Testing
- New smoke integration test: builds a real temp install
  (`app/.node/node.exe` + old launcher), a real tarball, applies the
  update, and asserts `.node/node.exe` stays **byte-identical** while the
  payload files are replaced.
- `npm run build` + full smoke suites green.