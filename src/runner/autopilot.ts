import { bus, type AutopilotStatus } from "../core/events.js";
import { blockedTicketIds, listTickets } from "../core/board.js";
import { loadProjectConfig } from "../core/project.js";
import { checkUsageBudget } from "./budget.js";
import {
  DispatchQueue,
  executorFor,
  planAssignments,
  runningCompanionId,
  type Assignment,
} from "./dispatch.js";
import type { ProjectConfig } from "../core/types.js";
import type { RunManager } from "./manager.js";
import type { WorkerRegistry } from "../server/workers.js";

function envMs(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// How long to wait between polls when idle / paused, and to breathe between tickets.
const IDLE_POLL_MS = () => envMs("MYSTERON_AUTOPILOT_IDLE_MS", 15_000);
const BUDGET_RECHECK_MS = () => envMs("MYSTERON_AUTOPILOT_BUDGET_MS", 30_000);
const BREATHER_MS = () => envMs("MYSTERON_AUTOPILOT_BREATHER_MS", 1_500);

const MAX_ACTIVITY = 50;

export interface AutopilotState {
  projectId: string;
  projectRoot: string;
  status: AutopilotStatus;
  message: string;
  currentTicketId?: string;
  currentRunId?: string;
  pausedUntil?: string;
  completed: number;
  startedAt: string;
  activity: { at: string; text: string }[];
  /** Live dispatch-queue snapshot, refreshed each tick (observability). */
  queue: { depth: number; inFlight: number; maxWaitMs: number };
}

/**
 * Drives a project's board autonomously: pulls the next ready ticket, runs an
 * agent on it, and moves on — pausing when the Claude usage budget is reached
 * and resuming after the window resets. This is the "yolo autopilot": set up a
 * board and leave it churning within your account limits.
 */
export class Autopilot {
  private states = new Map<string, AutopilotState>();
  private stopFlags = new Map<string, boolean>();

  constructor(
    private runs: RunManager,
    private workers: WorkerRegistry,
  ) {}

  status(projectId: string): AutopilotState | undefined {
    return this.states.get(projectId);
  }

  isActive(projectId: string): boolean {
    const s = this.states.get(projectId);
    return Boolean(s && s.status !== "stopped");
  }

  start(projectId: string, projectRoot: string): AutopilotState {
    const existing = this.states.get(projectId);
    if (existing && existing.status !== "stopped") return existing;

    const state: AutopilotState = {
      projectId,
      projectRoot,
      status: "running",
      message: "Starting…",
      completed: 0,
      startedAt: new Date().toISOString(),
      activity: [],
      queue: { depth: 0, inFlight: 0, maxWaitMs: 0 },
    };
    this.states.set(projectId, state);
    this.stopFlags.set(projectId, false);
    this.set(state, "running", "Autopilot started.");
    void this.loop(state);
    return state;
  }

  stop(projectId: string): boolean {
    const state = this.states.get(projectId);
    if (!state || state.status === "stopped") return false;
    this.stopFlags.set(projectId, true);
    this.set(state, "stopped", "Autopilot stopped.");
    return true;
  }

  private async loop(state: AutopilotState): Promise<void> {
    // One queue per loop: the board's ready column is reconciled into it each
    // tick, and it owns in-flight dedup, depth and wait-time (no per-tick run scan).
    const queue = new DispatchQueue();
    while (!this.stopFlags.get(state.projectId)) {
      const config = await loadProjectConfig(state.projectRoot);
      if (!config) {
        this.set(state, "idle", "Project is not initialised.");
        await this.sleep(state, IDLE_POLL_MS());
        continue;
      }

      // When the host's Claude budget is maxed it can't run locally, so the
      // planner offloads only to guests until the window resets.
      const budget = await checkUsageBudget(state.projectRoot, config);
      const hostMaxed = !!(budget && !budget.safeToContinue);

      // Reconcile the queue with the board: ready, unblocked, not already in flight.
      const ready = await listTickets(state.projectRoot, { state: "ready" });
      const blocked = await blockedTicketIds(state.projectRoot);
      queue.sync(ready.filter((t) => !blocked.has(t.id)));

      // Plan one tick of work across idle guests + free local companions, then
      // start each through its executor — one uniform dispatch path.
      const idleWorkers = this.workers.idle().map((w) => ({ id: w.id, label: w.label }));
      const plan = planAssignments({
        queued: queue.queued(),
        config,
        idleWorkers,
        hostMaxed,
        isCompanionBusy: (id) => queue.isCompanionBusy(id),
      });
      for (const assignment of plan) {
        if (this.stopFlags.get(state.projectId)) break;
        this.dispatch(state, config, queue, assignment);
      }

      state.queue = { depth: queue.depth(), inFlight: queue.inFlight(), maxWaitMs: queue.maxWaitMs() };

      if (hostMaxed && budget) {
        const resetWhen = budget.resetAt ? new Date(budget.resetAt).toLocaleTimeString() : "the end of the window";
        const offloaded = plan.some((a) => a.target.kind === "guest");
        this.set(
          state,
          "paused",
          `Usage budget reached (${budget.percentUsed}%).${offloaded ? " Offloading ready work to guests." : ""} Local companions wait for the window to reset around ${resetWhen}.`,
          { pausedUntil: budget.resetAt },
        );
        await this.sleep(state, BUDGET_RECHECK_MS());
        continue;
      }

      const working = queue.inFlight();
      if (working > 0) this.set(state, "running", `${working} companion(s) working.`);
      else this.set(state, "idle", "No ready tickets for a free companion — waiting for work.");

      // Tick quickly while there's work (so a freed companion picks up its next
      // ticket promptly); poll slowly when fully idle.
      await this.sleep(state, plan.length || working ? BREATHER_MS() : IDLE_POLL_MS());
    }
    if (state.status !== "stopped") this.set(state, "stopped", "Autopilot stopped.");
  }

  /**
   * Start one planned assignment through its executor and wire its lifecycle back
   * to the queue: a finished run that landed (done) releases the claim; anything
   * else requeues it (bumping attempts) to be retried on a later tick. Doesn't
   * block the tick — other assignments dispatch concurrently.
   */
  private dispatch(state: AutopilotState, config: ProjectConfig, queue: DispatchQueue, assignment: Assignment): void {
    const { item, target } = assignment;
    const ticket = item.ticket;
    const who = target.kind === "guest" ? target.label : config.companions.find((c) => c.id === target.companionId)?.name ?? "companion";
    const icon = target.kind === "guest" ? "☁" : "▶";
    const ctx = { projectId: state.projectId, projectRoot: state.projectRoot, config };
    const executor = executorFor(target, this.runs, this.workers, ctx);
    queue.claim(ticket.id, runningCompanionId(config, ticket));

    executor
      .start(ticket)
      .then((run) => {
        if (!run) {
          queue.requeue(ticket.id);
          this.addActivity(state, `✖ ${who}: ${ticket.title} — could not start`);
          return;
        }
        this.addActivity(state, `${icon} ${who} → ${ticket.title}`);
        void this.runs.waitFor(run.id).then((finished) => {
          if (finished.status === "done") {
            state.completed++;
            queue.release(ticket.id);
          } else {
            queue.requeue(ticket.id);
          }
          const mark = finished.status === "done" ? "✓" : finished.status === "stopped" ? "■" : "✖";
          this.addActivity(state, `${mark} ${who}: ${ticket.title} — ${finished.status}`);
          this.set(state, state.status, state.message);
        });
      })
      .catch((err) => {
        queue.requeue(ticket.id);
        this.addActivity(state, `✖ ${who}: ${(err as Error).message}`);
      });
  }

  /** Sleep in small steps so stop() takes effect promptly. */
  private async sleep(state: AutopilotState, ms: number): Promise<void> {
    const step = 500;
    let waited = 0;
    while (waited < ms && !this.stopFlags.get(state.projectId)) {
      await new Promise((r) => setTimeout(r, step));
      waited += step;
    }
  }

  private set(
    state: AutopilotState,
    status: AutopilotStatus,
    message: string,
    extra?: { currentTicketId?: string; pausedUntil?: string },
  ): void {
    state.status = status;
    state.message = message;
    if (extra && "currentTicketId" in extra) state.currentTicketId = extra.currentTicketId;
    if (extra && "pausedUntil" in extra) state.pausedUntil = extra.pausedUntil;
    if (status !== "paused") state.pausedUntil = undefined;
    bus.emitAutopilot({
      projectId: state.projectId,
      status,
      message,
      currentTicketId: state.currentTicketId,
      currentRunId: state.currentRunId,
      completed: state.completed,
    });
  }

  private addActivity(state: AutopilotState, text: string): void {
    state.activity.unshift({ at: new Date().toISOString(), text });
    if (state.activity.length > MAX_ACTIVITY) state.activity.length = MAX_ACTIVITY;
  }
}
