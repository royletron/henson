---
name: plugins/usage-monitor
description: How the usage-monitor decides live (session/weekly) vs token-estimate mode, and the snapshot-clobber gotcha in the capture proxy
metadata:
  type: project
---

The usage-monitor (`src/plugins/usage-monitor/`) reports real subscription session(5h)/weekly(7d) limits when the capture proxy has a fresh `anthropic-ratelimit-unified-*` reading, otherwise falls back to a transcript-token estimate.

**The mode decision** lives in `index.ts` `check_usage_budget`: `hasLive = unified && (unified.session || unified.weekly)`. `unified` comes from the latest snapshot, gated by freshness (`liveTtlMs`, 15 min default) or an active lockout. If `hasLive` is false it drops to estimate mode ("token usage"). The handler itself is correct — when the snapshot holds session/weekly buckets it reports live.

**Capture-clobber gotcha (ticket gZONscTi "Usage Broke").** The proxy (`proxy.ts` `capture`) writes the snapshot on every Anthropic response with `anthropic-ratelimit-*` headers. Many responses (token-counting and other endpoints) carry only the *legacy* `anthropic-ratelimit-requests-*` headers and no unified session/weekly buckets, so `parseUnifiedLimits` returns undefined. Persisting that **clobbered the last good unified reading**, forcing the monitor back to the token estimate — exactly the "reverts to token usage" symptom. Fix: `capture` now skips writing when the reading has no `unified.session`/`unified.weekly`. Regression test in `test/usage.test.ts` ("a non-unified response does not clobber a good unified snapshot").

The single snapshot lives at `mysteronHome()/ratelimit-snapshot.json` (per-machine, not per-project). Related: [[runner/limit-detection]].
