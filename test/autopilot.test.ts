import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const tmp = path.join(os.tmpdir(), `mysteron-autopilot-${process.pid}`);
process.env.MYSTERON_HOME = path.join(tmp, "home");
// Empty Claude dir → zero usage → budget always safe for the test.
process.env.CLAUDE_PROJECTS_DIR = path.join(tmp, "no-claude");
process.env.MYSTERON_AGENT_CMD = "true"; // instant, exit 0
process.env.MYSTERON_AUTOPILOT_IDLE_MS = "300";
process.env.MYSTERON_AUTOPILOT_BUDGET_MS = "300";
process.env.MYSTERON_AUTOPILOT_BREATHER_MS = "50";

const { initProject, loadProjectConfig, saveProjectConfig } = await import("../src/core/project.js");
const { createTicket, getTicket, listTickets, updateTicket } = await import("../src/core/board.js");
const { RunManager } = await import("../src/runner/manager.js");
const { Autopilot, loadAutopilotIntent } = await import("../src/runner/autopilot.js");
const { WorkerRegistry } = await import("../src/server/workers.js");

const projectRoot = path.join(tmp, "proj");

before(async () => {
  await fs.mkdir(projectRoot, { recursive: true });
});
after(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error("timeout"));
      setTimeout(tick, 25);
    };
    tick();
  });
}

test("autopilot drains ready tickets one at a time", async () => {
  const { config } = await initProject(projectRoot, { name: "Auto" });
  await createTicket(projectRoot, { title: "Ticket one", state: "ready" });
  await createTicket(projectRoot, { title: "Ticket two", state: "ready" });

  const ap = new Autopilot(new RunManager(), new WorkerRegistry());
  ap.start(config.id, projectRoot, config);

  // It should process both ready tickets, then go idle.
  await waitFor(() => (ap.status(config.id)?.completed ?? 0) >= 2);
  await waitFor(() => ap.status(config.id)?.status === "idle");

  assert.equal(ap.stop(config.id), true);
  assert.equal(ap.status(config.id)?.status, "stopped");

  // No tickets left in "ready"; both were claimed/run.
  assert.equal((await listTickets(projectRoot, { state: "ready" })).length, 0);
  assert.ok((ap.status(config.id)?.completed ?? 0) >= 2);
});

test("autopilot never runs a guest-pinned companion on the local host", async () => {
  const root = path.join(tmp, "guest-pinned");
  await fs.mkdir(root, { recursive: true });
  const { config } = await initProject(root, { name: "Pinned" });

  // Pin the soloist to a guest that isn't connected, so it can't run locally.
  config.companions[0].runsOn = ["a-guest-that-is-offline"];
  await saveProjectConfig(root, config);

  const reloaded = (await loadProjectConfig(root))!;
  const ticket = await createTicket(root, {
    title: "Guest-only work",
    state: "ready",
    companionId: reloaded.companions[0].id,
  });

  const ap = new Autopilot(new RunManager(), new WorkerRegistry());
  ap.start(config.id, root);

  // Let several ticks pass; with no connected guest the ticket can run nowhere.
  await waitFor(() => ap.status(config.id)?.status === "idle");
  await new Promise((r) => setTimeout(r, 400));

  ap.stop(config.id);
  assert.equal(ap.status(config.id)?.completed ?? 0, 0, "nothing ran locally");
  const still = await listTickets(root, { state: "ready" });
  assert.equal(still.length, 1, "the ticket stays ready, waiting for its guest");
  assert.equal(still[0].id, ticket.id);
});

test("autopilot intent is persisted and loadAutopilotIntent reflects it", async () => {
  const root = path.join(tmp, "persist");
  await fs.mkdir(root, { recursive: true });
  const { config } = await initProject(root, { name: "Persist" });

  // Initially no intent file → false.
  assert.equal(await loadAutopilotIntent(root), false);

  const ap = new Autopilot(new RunManager(), new WorkerRegistry());
  ap.start(config.id, root);
  // Intent is written async; give it a moment.
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(await loadAutopilotIntent(root), true);

  ap.stop(config.id);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(await loadAutopilotIntent(root), false);
});

test("orphaned in-progress tickets are requeued to ready on autopilot start", async () => {
  const root = path.join(tmp, "orphan");
  await fs.mkdir(root, { recursive: true });
  const { config } = await initProject(root, { name: "Orphan" });

  // Simulate a ticket that was left in-progress by a previous server crash.
  const orphan = await createTicket(root, { title: "Orphaned ticket", state: "in-progress" });

  const ap = new Autopilot(new RunManager(), new WorkerRegistry());
  ap.start(config.id, root);

  // The orphan should be requeued to ready, then picked up by the loop.
  await waitFor(() => ap.status(config.id)?.activity.some((a) => /requeued orphaned/.test(a.text)) ?? false);

  const t = await getTicket(root, orphan.id);
  assert.ok(t?.state === "ready" || t?.state === "done", "orphan was requeued (and may have run)");
  ap.stop(config.id);
});

test("a ticket that keeps failing is retried then dead-lettered (capped + parked)", async () => {
  const root = path.join(tmp, "poison");
  await fs.mkdir(root, { recursive: true });
  const { config } = await initProject(root, { name: "Poison" });
  const created = await createTicket(root, { title: "Cannot pass", state: "ready" });

  // An agent that hits a usage limit (retryable) and exits non-zero, every time.
  const prevCmd = process.env.MYSTERON_AGENT_CMD;
  process.env.MYSTERON_AGENT_CMD = 'echo "usage limit reached"; exit 1';
  try {
    // Tiny, deterministic policy: 2 retryable attempts, ~50ms backoff, no jitter.
    const policy = { maxAttempts: 2, maxNonRetryableAttempts: 1, baseDelayMs: 50, maxDelayMs: 50, jitter: 0 };
    const ap = new Autopilot(new RunManager(), new WorkerRegistry(), policy);
    ap.start(config.id, root);

    // It gives up after the cap and parks the ticket for a human.
    await waitFor(() => (ap.status(config.id)?.deadLettered ?? 0) >= 1, 12_000);
    ap.stop(config.id);

    const parked = await getTicket(root, created.id);
    assert.equal(parked?.state, "backlog", "parked off the ready column");
    assert.ok(parked?.labels.includes("stuck"), "labelled stuck so it's visible");
    assert.match(parked?.body ?? "", /parked by autopilot/i, "the failure reason is noted on the ticket");

    // It was actually retried before giving up (the cap is 2), and the backoff was logged.
    const acts = ap.status(config.id)?.activity ?? [];
    assert.ok(acts.some((a) => /retry 1\/2/.test(a.text)), "retried at least once with the cap shown");
    assert.ok(acts.some((a) => /parked \(stuck\)/.test(a.text)), "logged the dead-letter");

    // And it's not still spinning on the ready column.
    const ready = await listTickets(root, { state: "ready" });
    assert.equal(ready.length, 0, "no longer ready — stopped being retried");
  } finally {
    if (prevCmd === undefined) delete process.env.MYSTERON_AGENT_CMD;
    else process.env.MYSTERON_AGENT_CMD = prevCmd;
  }
});
