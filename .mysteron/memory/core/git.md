---
name: core/git
description: How runs land their patches onto the host, and the gotchas in landGuestPatch
metadata:
  type: project
---

`src/core/git.ts` owns turning a run's work into host commits. There are now **two**
landing paths, chosen by the effective git strategy (`resolveProjectGit`):

## Snapshot + diff (current-branch / target-branch modes, and all guest runs)

- `captureSnapshotRef(root, runId)` pins the host's tracked+untracked tree as a
  throwaway commit; the run is isolated off it and never sees prior history.
- `worktreeRunPatch(dir, baseSha)` flattens an isolated run worktree into a
  `{ patch, commitMessage }` against its base. Empty patch when nothing changed.
- `landGuestPatch(root, opts)` applies that patch in a throwaway worktree
  (`/tmp/mysteron-apply-<runId>`), commits it, then lands it per the project's git
  strategy (`current-branch` / `target-branch` / `new-branch`). The checkout is
  never touched directly; the raw patch is always saved to
  `.git/mysteron-patches/<runId>.diff` first so work is never lost.

**Gotcha — no-op patches (tickets gFxZ6GGD, gI7sD2zY).** A patch can be non-empty yet
apply to *nothing* (a resumed run re-emits a diff already present in the base), so
`git apply --3way` is a clean no-op. After `git add -A`, `landGuestPatch` runs
`git diff --cached --quiet`; if nothing is staged it returns `mode: "noop"` (no
commit, `ok: true`) rather than the old `mode: "failed"` that bounced a finished
ticket back to Ready. Caller handling in `src/runner/manager.ts` differs by path
because **guests have no board access**: `landLocalRun` leaves the agent's state on
`noop`; `applyGuestResult` treats `noop` as done → review.

## Ticket branch (per-ticket / new-branch mode, **local runs only** — ticket r4zbwCW8)

The per-ticket path no longer snapshots-and-diffs. Instead the run accumulates on
the ticket's own branch and resumes from it:

- `ticketBranchName(prefix, ticketId)` → `<prefix><ticketId>` (default `mysteron/`),
  the same name `landGuestPatch` uses for new-branch landings.
- `ensureTicketBranch(root, branch, base?)` creates the branch up front at *dispatch*
  time (idempotent — a re-run finds the existing branch untouched).
- `addTicketWorktree(root, branch, runId)` checks the branch out in a per-run
  worktree (`RunWorktree.ownsBranch = false`); the agent's commits land straight on
  it. `removeTicketWorktree` drops the checkout but **keeps the branch**, so a dead
  run's commits survive and the next run resumes from them.
- `commitTicketWork(dir, baseSha, {message, trailer})` sweeps up anything left
  uncommitted and reports how far the branch advanced — there's no diff to apply.

Wiring lives in `src/runner/manager.ts`: `setUpIsolation` splits into
`setUpTicketBranch` vs `setUpSnapshot`; `finalizeTicketBranchRun` replaces
`landGuestPatch` for this path (commits>0 → ticket to review); `teardownIsolation`
branches on `RunWorktree.ownsBranch` (keep ticket branch / delete throwaway). Design
note: `docs/GIT-WORKFLOW.md`.

**Still snapshot+diff:** guest (remote) runs in every mode. Host-as-origin live push
(so guests commit onto the host branch too) is follow-up `zs0L7zRi`. Edge: a
per-ticket ticket that runs locally (branch created) then on a guest still goes
through `landGuestPatch`, which collides and makes `<prefix><id>-<runId>`; the
follow-up removes that. See [[runner/isolation]], [[runner/session-continuity]],
[[core/subtasks]].
