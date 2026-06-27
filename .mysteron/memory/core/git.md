---
name: core/git
description: How runs land their patches onto the host, and the gotchas in landGuestPatch
metadata:
  type: project
---

`src/core/git.ts` owns turning a run's diff into a host commit.

- `worktreeRunPatch(dir, baseSha)` flattens an isolated run worktree into a `{ patch, commitMessage }` against its base. Returns an **empty patch** when the run produced no net file changes.
- `landGuestPatch(root, opts)` applies that patch in a throwaway worktree (`/tmp/mysteron-apply-<runId>`), commits it, then lands it per the project's git strategy (`current-branch` / `target-branch` / `new-branch`). The checkout is never touched directly; the raw patch is always saved to `.git/mysteron-patches/<runId>.diff` first so work is never lost.

**Gotcha — no-op patches (tickets gFxZ6GGD, gI7sD2zY).** A patch can be non-empty yet apply to *nothing*: a resumed run re-emits a diff whose changes are already present in the base, so `git apply --3way` is a clean no-op. `git commit` then fails with "nothing to commit", which used to surface as `mode: "failed"` ("could not apply the run's patch") — and the callers reset the ticket to **ready**, so a *finished* ticket bounced back to Ready (the bug in gI7sD2zY). Fix: after `git add -A`, `landGuestPatch` runs `git diff --cached --quiet`; if nothing is staged it cleans up the tmp worktree/branch and returns `mode: "noop"` (no commit, `ok: true`).

Caller handling in `src/runner/manager.ts` differs by path because **guests have no board access**:
- `landLocalRun`: `noop` → neither `applied` nor `landFailed`; leaves the ticket in whatever state the agent set via the Mysteron MCP (normally "review").
- `applyGuestResult`: `noop` → treated as done → ticket goes to **review** (the work is already present; bouncing to ready would re-run forever, leaving it in-progress would strand it).

The callers guard with `patch.trim()` before calling `landGuestPatch`, which only catches a *fully empty* patch — not the already-present case above. See [[runner/session-continuity]] for why resumes happen.

**Note on snapshots:** the `noop` mode was documented here before it actually existed in `git.ts` (the `LandResult.mode` union was only `current-branch | branch | failed`). Trust the code over older memory — agent snapshots often lag the described fixes.
