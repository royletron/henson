---
name: core/worker-version
description: How a guest worker reports its Mysteron version + commit sha, and where it's surfaced
metadata:
  type: project
---

A connected guest worker reports the Mysteron build it's running so the host can spot a stale guest.

**Capture:** `src/core/version.ts` → `localWorkerVersion()` walks up from the module to the package root (the dir whose `package.json` has `name: "mysteron"`), reads `version`, and runs `git rev-parse --short HEAD` for the sha. Result is cached. Both fields are optional — a packed install with no git checkout reports just the version.

**Wire:** the guest sends `version` + `commitSha` in the `register` message (`RegisterMsg` in [[core/worker-protocol]] / `src/worker/guest.ts` open handler). `WorkerRegistry` (`src/server/workers.ts`) stores them on the `Worker` and `list()` exposes them.

**UI:** `web/src/ui.tsx` `WorkerVersion` component renders `v<version> · <sha>`. Used in the header guest popover (`GuestIndicator.tsx`) and the Settings connected-guests roster (`Settings.tsx`). Mirrors the host's own build badge in the footer (`App.tsx`, baked at build time via `__COMMIT_SHA__`).

Note: the host's own footer sha is build-time baked (vite `define`); the guest sha is captured at runtime on register — different mechanisms.
