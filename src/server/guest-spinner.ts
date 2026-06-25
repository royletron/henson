import { bus } from "../core/events.js";
import type { RunManager } from "../runner/manager.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * While guests are running tickets on the host's behalf, animate a status line in
 * the host terminal — and print a one-line summary as each guest finishes. The
 * loop only runs while there's guest work (kicked off by run events, and it stops
 * itself once none remain). No-op unless stdout is an interactive TTY and we're
 * not in verbose mode, where per-line logging would fight the spinner for the cursor.
 */
export function startGuestSpinner(runs: RunManager, verbose = false): () => void {
  if (verbose || !process.stdout.isTTY) return () => {};

  let frame = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let drawn = false;
  // Guest runs we were showing last tick — to detect when one finishes.
  const showing = new Map<string, { guestLabel: string; ticketTitle: string }>();

  const clearLine = () => {
    if (drawn) {
      process.stdout.write("\r\x1b[K");
      drawn = false;
    }
  };

  const tick = () => {
    const active = runs.activeGuestRuns();
    const activeIds = new Set(active.map((r) => r.id));

    // Anything we were showing that's gone now just finished — report its outcome.
    for (const [id, prev] of showing) {
      if (activeIds.has(id)) continue;
      const run = runs.get(id);
      const icon = run?.status === "done" ? "✓" : run?.status === "stopped" ? "■" : "✖";
      clearLine();
      // eslint-disable-next-line no-console
      console.log(`${icon} guest "${prev.guestLabel}" finished: ${prev.ticketTitle}${run ? ` — ${run.status}` : ""}`);
      showing.delete(id);
    }

    if (active.length === 0) {
      clearLine();
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      return;
    }

    for (const r of active) showing.set(r.id, { guestLabel: r.guestLabel, ticketTitle: r.ticketTitle });

    const spin = FRAMES[frame++ % FRAMES.length];
    const n = active.length;
    const detail = active.map((r) => `${r.guestLabel} ▸ ${r.ticketTitle}`).join("   ");
    let line = `${spin} ${n} guest${n > 1 ? "s" : ""} working for this host  ·  ${detail}`;
    const width = process.stdout.columns || 120;
    if (line.length > width) line = line.slice(0, width - 1) + "…";
    process.stdout.write("\r\x1b[K" + line);
    drawn = true;
  };

  const ensureSpinning = () => {
    if (timer) return;
    timer = setInterval(tick, 90);
    timer.unref?.();
  };

  // Any run activity may have started a guest run — start animating; tick() winds
  // itself down once no guest runs are left.
  const onRun = () => ensureSpinning();
  bus.on("run", onRun);

  return () => {
    bus.off("run", onRun);
    if (timer) clearInterval(timer);
    clearLine();
  };
}
