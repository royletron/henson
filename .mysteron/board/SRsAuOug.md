---
title: Subtask Commit Confirmation
state: review
priority: medium
companionId: c1bf55fe-3e93-410d-94a7-cfde4dc1f80e
assignee: Waldorf the Compiler
labels: []
created: '2026-06-30T13:39:18.117Z'
updated: '2026-06-30T13:54:57.145Z'
order: 1
---

Can we confirm that when a subtask is commited - especially on a remote worker - that the commit is pushed back to the host machine? It's super important that we can break off and pick up from the last comitted subtask - but I can't see evidence that subtasks are being committed?

---

## Confirmed — and your suspicion is right ❌

**No. On a remote (guest) worker, subtask commits are NOT pushed back to the host, and not as separate commits.** Code-verified, full write-up in `docs/SUBTASK-COMMIT-CONFIRMATION.md`.

What actually happens (`src/worker/guest.ts` → `handleDispatch`):
1. The guest runs the agent in a **throwaway repo** (`/tmp/mysteron-guest-<runId>`) built from a downloaded snapshot of the host's working tree.
2. The agent's per-subtask `git commit`s land **only in that throwaway repo**.
3. At run-end, all commits are **squashed into one `git diff --binary`** patch, sent **once** in `run-done`, and the workdir is `rm -rf`'d.
4. The host (`applyGuestResult` → `landGuestPatch`) applies that as **a single commit**, only after the run finishes.

Consequences:
- The agent *is* committing subtasks — but in an ephemeral repo the host never sees; they're squashed to one host commit.
- If a worker **dies mid-ticket**, the diff is never sent and the workdir is deleted → **the code is lost**. Only the board's subtask `done` flags survive (they go to the host's live MCP), so resume recovers the **plan**, not the **code**. That's why a resumed run shows ticked-off subtasks with none of the corresponding code present.
- **Local** runs under `per-ticket`/`new-branch` mode are fine (commits accumulate on the ticket branch and survive). Local runs under `current-branch`/`target-branch` have the same squash caveat.

## Resolution
This is an audit ticket; the actual fix is already tracked as **`zs0L7zRi` — host-as-origin live push for remote (guest) workers** (backlog, labels v2/git): host serves git over authenticated HTTP, guest pushes each commit onto the ticket branch live, ref-guarded. Until that lands, treat remote-worker progress as **all-or-nothing per run**.

Deliverables: `docs/SUBTASK-COMMIT-CONFIRMATION.md` + memory `core/git` audit note. No behaviour changed. Tests: 149/149 pass.
