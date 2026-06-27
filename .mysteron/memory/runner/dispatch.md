---
name: runner/dispatch
description: How the autopilot dispatches tickets to runs — there is no real queue, dedup is by scan, and local vs guest are split paths
metadata:
  type: project
---

There is **no queue data structure**. The board's `ready` column *is* the queue, re-derived from disk on every poll tick.

`Autopilot.loop()` (`src/runner/autopilot.ts`) wakes every `BREATHER_MS` (~1.5s, busy) or `IDLE_POLL_MS` (~15s, idle). Each tick:
1. `checkUsageBudget()` — if the host is maxed, pause local runs and let guests absorb work.
2. `fanOutToGuests()` — recompute the free ready-ticket set (`!blocked && !activeForTicket`, respecting companion local/guest pins) and hand one each to idle guests via `runs.startOnWorker()`.
3. Per companion: if free (`!activeForCompanion`) and allowed local, `nextTicketForCompanion()` → `runs.start()`.

**Two split dispatch paths for one concept** ("run this ticket on an executor"): local `runs.start()` vs guest `runs.startOnWorker()`, with selection logic duplicated/interleaved across both. Landing is already unified through `landGuestPatch()`; dispatch is not.

**Dedup is by O(runs) scan**: `activeForTicket` / `activeForCompanion` / `busyCompanionIds` in `manager.ts` each iterate all runs; the autopilot calls them per companion per tick. Correct (per-companion lock + per-ticket idempotency genuinely hold), just not O(1).

**Reliability gaps in this design:**
- No retry policy — a failed ticket goes back to `ready` and is re-dispatched next tick forever (no attempt cap, no backoff, no dead-letter). Poison ticket = infinite budget burn in yolo.
- Autopilot state is in-memory (`states`/`stopFlags` Maps); `hydrate()` recovers run history but the loop is not auto-resumed on restart.

Tracked as `v2` tickets: `nCDlPpY-` (unify dispatch behind one queue + Executor), `qY17AAjx` (retry policy), `AsPmwens` (persist/auto-resume autopilot). Pairs with `__J9CotP` (atomic board writes). See `docs/V2-REVIEW.md`. Related: [[runner/session-continuity]], [[core/git]].
