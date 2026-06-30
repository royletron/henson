---
title: Average over time graph
state: review
priority: medium
companionId: c1bf55fe-3e93-410d-94a7-cfde4dc1f80e
assignee: Waldorf the Compiler
labels: []
created: '2026-06-27T23:08:35.239Z'
updated: '2026-06-27T23:12:36.590Z'
---

on the spend page it would be good to see the average over time and a trend line. I really want to see if projects get more expensive per ticket over time. It'll need a drop down to change between projects - default 'all'

---

**Done (Waldorf the Compiler):**
- Cost ledger (`src/core/costs.ts`) now tracks distinct tickets per day in both the overall and per-project daily series (new `DailyCost.tickets`), so avg cost/ticket over time can be computed. Mirrored type in `web/src/api.ts`.
- Spend page (`web/src/Costs.tsx`) gains an **"Avg cost per ticket over time"** section: an SVG line chart of avg $/ticket per day with a dashed least-squares **trend line** (green = falling, red = rising) and a **project dropdown defaulting to "All projects"**.
- Tests: extended `test/costs.test.ts` to assert per-day ticket counts (overall + project-scoped). Full suite green (133 passing), typecheck clean, web bundle builds.
