# Git workflow: ticket branches + host-as-origin

Design note for ticket `r4zbwCW8` (follow-up to subtasking `9ai5-mfx`). Read
alongside memory `core/git` (how patches land today) and `runner/isolation`
(how a local run gets its worktree + node_modules).

## Where we are today

Every run — local or guest — works against a **snapshot** of the host's working
tree and returns a single squashed **diff**, which the host applies via
`landGuestPatch`:

- `captureSnapshotRef(root, runId)` pins the host's tracked+untracked tree as a
  throwaway commit. The run never sees prior git history — by design, so parallel
  companions don't trip over each other's half-finished work.
- A **local** run is isolated in a per-run worktree (`addRunWorktree`) off that
  snapshot; on finish `worktreeRunPatch` flattens it to a diff.
- A **guest** run downloads the snapshot as a tar, runs in a throwaway repo, and
  ships back `patchBase64` over the worker WebSocket.
- `landGuestPatch` applies the diff in a throwaway worktree and lands it per the
  project's `CommitStrategy` (`current-branch` / `target-branch` / `new-branch`).
  In `new-branch` (a.k.a. `per-ticket`) mode it creates `<prefix><ticketId>` **at
  land time**.

The cost of "ignore history + one diff at the end":

- **Nothing accumulates.** A run that dies mid-ticket loses everything it did;
  the resumable-subtask layer (`core/subtasks`) only resumes the *plan*, not the
  *code* — the next run redoes the unfinished step from scratch.
- **No live visibility.** Guest commits only appear once the whole run finishes
  and the diff lands.
- **A dead remote worker is unrecoverable** beyond the saved `.diff`.

## Target model

> A ticket gets its own branch at dispatch time; runs commit small and often onto
> that branch; a remote worker pushes to the host (the host is its `origin`) so
> the branch survives the worker's death; a re-run checks the branch out and
> continues; when the ticket is done the branch is finalised per the project's
> merge strategy.

### 1. A branch per ticket, created up front

When a ticket starts under `per-ticket`/`new-branch` mode, the host ensures
`<prefix><ticketId>` exists **before dispatch** (creating it from the current base
if absent, leaving it alone if a prior run already made it). Branch creation moves
from *land* time to *dispatch* time so work accumulates on a stable, named branch.

`ensureTicketBranch(root, branch, base?)` is the foundational helper: idempotent,
returns whether it created the branch and the base SHA. `ticketBranchName(prefix,
ticketId)` centralises the naming `landGuestPatch` already uses.

### 2. Commit small & frequently onto the ticket branch

Both local and guest workers commit as they go rather than emitting one squash at
the end. For the **local** path this is natural: base the run worktree *on the
ticket branch* (an existing-branch checkout, not a snapshot), and the agent's
commits advance the branch directly — there is no separate "land" step, the work
is already on the branch when the worktree is torn down. `addRunWorktree` gains an
existing-branch mode (`worktree add <dir> <branch>`); teardown must **not** delete
the ticket branch (only the throwaway `mysteron/_run-*` branches).

### 3. Host as `origin` for remote (guest) workers

A guest can't push to a host it can't route to over plain git, so the host
exposes a git endpoint the guest pushes through:

- The host serves its repo over **git-http (smart protocol)** at an authenticated
  worker path (reusing the guest token already used for the snapshot/MCP), or via
  an SSH-less HTTP `receive-pack` proxy. The dispatch message gains a `gitPath`
  the guest turns into a remote URL, exactly as it does for `snapshotPath`/`mcpPath`.
- The guest, instead of (or in addition to) returning a diff, sets the host as
  `origin`, fetches the ticket branch, commits onto it, and `git push origin
  <ticketBranch>` as it works. Commits land on the host branch **live**.
- The host accepts pushes only to `refs/heads/<prefix>*` ticket branches (a
  pre-receive guard), never to `main`/the checkout, so a guest can't move
  protected refs.

This supersedes `landGuestPatch` for the guest path in `per-ticket` mode; the
diff-return path stays as the fallback when git-http is unavailable
(offline/locked-down host), so nothing regresses.

### 4. Resume from the host branch

Because the branch lives on the host and accumulates commits, recovery is "check
it out and keep going":

- `captureSnapshotRef`'s **ignore-history** behaviour is dropped for the
  per-ticket path — a re-run bases its worktree on the existing ticket branch, so
  it sees everything prior runs committed.
- The resume prompt (`subtasksSection`) already tells the agent to continue from
  the first unfinished step; now the committed code from earlier steps is actually
  present, so "redo from scratch" becomes "continue".
- The snapshot path is retained for `current-branch`/`target-branch` modes, where
  isolation-from-history is still the right default.

### 5. Finalise per the merge strategy

When the ticket reaches `review`/`done`, the existing branch tooling takes over:
`listBranches` surfaces the open ticket branch, `mergeBranch` merges it to the
checkout (auto-committing board changes), `unmergedBranchTicketIds` keeps a
"done-but-unmerged" ticket from unblocking its dependents until it actually lands.
`per-ticket` keeps the branch for the user to review/merge; `main`/`branch` modes
finalise straight onto the target as they do now.

## Local ↔ remote split, and staging

The two halves are independently shippable:

- **Local resumable ticket branches** (parts 1, 2, 4 for local runs) need no
  network: ticket branch up front + worktree-on-branch + accumulate + resume.
  This is the foundation and is implemented first (see `core/git.ts`
  `ensureTicketBranch` and the `runner/manager.ts` wiring).
- **Host-as-origin live push** (part 3, and part 4 for remote runs) is the larger,
  separable piece — it adds a git-http endpoint, push auth, a ref guard, and a
  guest push loop, with the diff-return path as fallback. Tracked as a follow-up
  ticket.

Both share the same end state (commits on `<prefix><ticketId>`), so finalisation
(part 5) is identical regardless of which machine produced the work.

## Risks / decisions

- **Concurrent worktrees on one branch.** Only ever one run per ticket is in
  flight (the dispatch queue enforces one task per companion), so the ticket
  branch is never checked out in two worktrees at once.
- **A dirty host checkout** is irrelevant to the per-ticket path: the worktree is
  based on the branch ref, not the working tree, so uncommitted host edits are
  neither seen nor disturbed.
- **Push auth** rides the existing guest token; the ref guard is what keeps it
  safe. Until the git-http endpoint exists, guests keep returning a diff and
  `landGuestPatch` lands it (now onto the up-front ticket branch).
