---
name: runner/session-continuity
description: How Claude session continuity works between tickets, the prompt trimming, and the session-rejection guard
metadata:
  type: project
---

Each companion gets a stable session ID (`companion.id`). The runner uses `--session-id <id>` on the first run and `--resume <id>` on subsequent ones, so the Claude conversation carries forward across tickets.

`companionHasLocalSession()` in `src/runner/manager.ts` checks whether any prior run for this companion exists on the current hostname — that's the gate for switching between `--session-id` and `--resume`.

**Prompt trimming on resume** (`buildPrompt` in `src/runner/manager.ts`, the `resume` param):
- First run: full prompt (spec excerpt, etiquette, team, brief, ticket).
- Resumed runs: compact prompt (ticket + git only). Spec/etiquette/team/brief are already in context — re-sending them was ~5k tokens of waste per ticket.
- `RunManager.start()` passes `resumeSession` to both `resolveCommand` (CLI flag) and `buildPrompt` (prompt content) so they stay in sync.

**Sessions are local-only.** Guest workers start fresh each time (the host can't know if a guest already has a session for this companion). That's a future improvement.

**Session-rejection guard (ticket -w1w39Gy "Fail on resume").** A session id created on machine A (or under a different account) can be rejected when this machine tries `--session-id`/`--resume` it — Claude can't start. `SESSION_ERROR_RE` in `manager.ts` matches the rejection phrases (`invalid session id`, `session ... not found`, `does not belong ... account`, `session ... already exists`); `append()` sets `run.sessionError`. On process close, `RunManager.start`'s `child.on("close")` checks `run.sessionError && !_noSession`, fails the run, and restarts once via `start(args, true)` — `_noSession` drops ALL session flags (`useSession` false) so the retry can't loop on the same error. Covered by the test "session error triggers a fresh retry without session flags".

**Opt out:** set `MYSTERON_AGENT_SESSION=0` to get a fresh context on every run.
