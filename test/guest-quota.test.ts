import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

// Isolate the transcript dir + snapshot file under temp before importing modules
// that read these env vars (the guest captures usage exactly like the host does).
const tmp = path.join(os.tmpdir(), `mysteron-guest-quota-${process.pid}`);
const projects = path.join(tmp, "claude");
process.env.MYSTERON_HOME = path.join(tmp, "home");
process.env.CLAUDE_PROJECTS_DIR = projects;
// No live capture proxy in this test, so we exercise the estimate regime.
process.env.MYSTERON_USAGE_TOKEN_LIMIT = "1000000";

const { captureGuestQuota } = await import("../src/runner/budget.js");

before(async () => {
  await fs.mkdir(projects, { recursive: true });
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    message: { usage: { input_tokens: 100_000, output_tokens: 20_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
  });
  await fs.writeFile(path.join(projects, "session.jsonl"), line + "\n", "utf8");
});

after(async () => {
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
});

test("captureGuestQuota tallies transcripts via the usage-monitor (estimate regime)", async () => {
  const quota = await captureGuestQuota();
  assert.ok(quota, "expected a quota reading");
  assert.equal(quota.source, "estimate");
  // 120k billable of a 1M budget ≈ 12%.
  assert.ok(quota.percentUsed > 10 && quota.percentUsed < 15, `percentUsed was ${quota.percentUsed}`);
  assert.equal(quota.safeToContinue, true);
  assert.ok(!Number.isNaN(Date.parse(quota.capturedAt)), "capturedAt should be an ISO timestamp");
});
