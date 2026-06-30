# Are subtask commits pushed back to the host? (ticket `SRsAuOug`)

_Investigation by Waldorf the Compiler, 2026-06-30._

**Short answer: no — not for remote (guest) workers, and not as separate commits.**
Your suspicion is correct. Today the *plan* of which subtasks are done survives a
worker's death, but the *code* for those subtasks does not. Breaking off and picking
up from the last committed subtask recovers the checklist, not the work.

This is a confirmation/audit ticket. The actual fix is the larger
**host-as-origin live push** work, already tracked as follow-up `zs0L7zRi`
(see also the target model in `GIT-WORKFLOW.md`). Nothing here changes behaviour.

## What actually happens on a remote worker

Trace through `src/worker/guest.ts` → `handleDispatch`:

1. The guest downloads the host's working-tree **snapshot** as a tar and unpacks it
   into a throwaway repo at `/tmp/mysteron-guest-<runId>` (lines ~445–462). It
   `git init`s, sets a committer identity, `git add -A`, and commits a `base`.
2. The agent runs there. Whatever subtask commits it makes — `git commit` per step,
   following the etiquette — land **only in that throwaway repo**.
3. When the run ends, the guest reads back the agent's commit messages, sweeps up any
   uncommitted leftovers, then **flattens everything into a single squashed diff**:
   `git diff --binary <base> HEAD` → `patchBase64` (lines ~482–492).
4. That one patch is sent to the host **once**, in the `run-done` message — and the
   `finally` block immediately `rm -rf`s the workdir (line ~499).

Host side (`src/runner/manager.ts` → `applyGuestResult`, ~line 1082): the squashed
patch is applied via `landGuestPatch` as **one** commit, under the project's commit
strategy — and only *after* the whole run finishes.

So:

- The agent **is** committing subtasks — but in an ephemeral repo the host never sees.
- Those commits are **never pushed back live**; they are squashed to a single diff at
  the very end and landed as a single host commit.
- If the worker **dies mid-ticket** (crash, SIGKILL, lost connection), the diff is
  never assembled or sent and the workdir is deleted — **the code is lost**. The only
  thing that survives is the board's subtask `done` flags, because `complete_subtask`
  writes to the host's **live MCP** over HTTP (`mcpPath`), not to the snapshot.

That gap — done-flags persist but their code does not — is why a resumed run sees a
half-ticked checklist with none of the corresponding code present, and redoes the
"finished" steps from scratch.

## Local runs

The local path is in better shape: under `per-ticket` / `new-branch` git mode the run
is checked out on the ticket's own branch (`setUpTicketBranch` in `manager.ts`,
`ensureTicketBranch`/`addTicketWorktree` in `core/git.ts`), so the agent's commits
accumulate on a stable branch that survives the run and a re-run resumes from it.
Under `current-branch` / `target-branch` mode a local run still snapshots-and-squashes
like a guest, so the same "one commit at the end" caveat applies there.

## What would make subtask commits visible on the host

The fix is **`zs0L7zRi` — host-as-origin live push for guests**:

- host serves its repo over authenticated git-HTTP and adds a `gitPath` to the
  dispatch message;
- the guest sets the host as `origin`, fetches the up-front ticket branch, and
  `git push`es each commit as it works;
- a pre-receive ref guard restricts pushes to `refs/heads/<prefix>*` ticket branches;
- a dead guest leaves its commits on the host branch, so a re-run resumes from real
  code, with the diff-return path kept as the offline fallback.

Until that lands, treat remote-worker progress as **all-or-nothing per run**: a guest
that dies mid-ticket has done no durable code work, regardless of how many subtasks it
ticked off.
