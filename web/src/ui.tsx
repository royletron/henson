import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { runElapsed, type RunStatus, type Subtask } from "./api";
import { useNow } from "./hooks";
import { CheckCircle2, Circle, ListChecks, Loader2 } from "lucide-preact";

export function Modal({ children, onClose }: { children: ComponentChildren; onClose: () => void }) {
  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="card max-h-[90vh] w-full max-w-xl overflow-auto bg-zinc-900">{children}</div>
    </div>
  );
}

export function Loading({ what }: { what?: string }) {
  return <div class="pulse p-10 text-center text-zinc-500">{what ?? "Loading…"}</div>;
}

/** A pulsing dot marking a live/running state. Inherits the current text colour. */
export function LiveDot({ class: className = "" }: { class?: string }) {
  return <span class={`live-dot ${className}`} aria-hidden="true" />;
}

/** Cloud glyph — marks work running on / offloaded to a remote guest machine. */
export function CloudGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6-1.6A4 4 0 0 0 6 19z" />
    </svg>
  );
}

/** Home glyph — marks work that ran on the local host machine. */
export function HomeGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

/** Monitor glyph — marks work that ran on another (non-guest) machine. */
export function MonitorGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

/** Where a run executed, shown on its own line so a run row never overflows:
 *  a cloud for guest machines, a monitor for remote hosts, a home for the local host. */
export function RunMachine({
  run,
}: {
  run: { guestLabel?: string; hostname?: string; logAvailable?: boolean };
}) {
  if (run.guestLabel)
    return (
      <span class="inline-flex items-center gap-1 text-sky-400" title={`Ran on guest machine “${run.guestLabel}”`}>
        <CloudGlyph size={11} /> {run.guestLabel}
      </span>
    );
  if (run.logAvailable === false)
    return (
      <span class="inline-flex items-center gap-1 text-zinc-500" title={`Ran on ${run.hostname ?? "another machine"}; logs are local to that machine`}>
        <MonitorGlyph size={11} /> {run.hostname || "remote"}
      </span>
    );
  return (
    <span class="inline-flex items-center gap-1 text-zinc-500" title={`Ran on this host machine${run.hostname ? ` (${run.hostname})` : ""}`}>
      <HomeGlyph size={11} /> {run.hostname || "host"}
    </span>
  );
}

/** Elapsed-time readout for a run; ticks every second while the run is running. */
export function RunTimer({
  run,
  prefix = "",
  class: className = "",
}: {
  run: { startedAt: string; endedAt?: string; status: RunStatus };
  prefix?: string;
  class?: string;
}) {
  const label = runElapsed(run, useNow(run.status === "running"));
  if (!label) return null;
  return (
    <span class={`tabular-nums ${className}`}>
      {prefix}
      {label}
    </span>
  );
}

/** How many of a ticket's subtasks are done, or null when there are none. */
export function subtaskProgress(subtasks?: Subtask[]): { done: number; total: number } | null {
  if (!subtasks?.length) return null;
  return { done: subtasks.filter((s) => s.done).length, total: subtasks.length };
}

/** Compact "✓ 2/5" badge for a ticket's subtask progress; renders nothing when
 *  the ticket has no breakdown. Sits among the tags on a board card. */
export function SubtaskBadge({ subtasks }: { subtasks?: Subtask[] }) {
  const p = subtaskProgress(subtasks);
  if (!p) return null;
  const complete = p.done === p.total;
  return (
    <span
      class={`tag inline-flex items-center gap-1 ${complete ? "text-emerald-400" : "text-zinc-300"}`}
      title={`${p.done} of ${p.total} subtasks done`}
    >
      <ListChecks size={11} /> {p.done}/{p.total}
    </span>
  );
}

/** Tracks which subtasks flipped from open → done since the last render, so we can
 *  play the "just ticked off" animation only on the ones that actually changed.
 *  Pre-completed subtasks on first render are seeded silently (no animation). */
function useJustCompleted(subtasks?: Subtask[]): Set<number> {
  const prev = useRef<boolean[] | null>(null);
  const [justDone, setJustDone] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    const cur = (subtasks ?? []).map((s) => s.done);
    const before = prev.current;
    prev.current = cur;
    if (!before) return; // first render — seed without celebrating existing ticks
    const newly = new Set<number>();
    cur.forEach((done, i) => {
      if (done && !before[i]) newly.add(i);
    });
    if (newly.size === 0) return;
    setJustDone(newly);
    const id = setTimeout(() => setJustDone(new Set()), 900);
    return () => clearTimeout(id);
  }, [subtasks]);
  return justDone;
}

/** The ticket's subtask checklist with a progress bar — the resumable steps it's
 *  been broken into, with completed ones ticked. Renders nothing without a breakdown.
 *  On a live run, a step springs its tick and washes its row the moment it lands.
 *  When `active` (a run is in flight) the first not-yet-done step is shown as
 *  "running" — the agent works the breakdown strictly in order, so that's the one
 *  it's on right now. */
export function SubtaskList({ subtasks, active = false }: { subtasks?: Subtask[]; active?: boolean }) {
  const justDone = useJustCompleted(subtasks);
  const p = subtaskProgress(subtasks);
  if (!p || !subtasks) return null;
  const pct = Math.round((p.done / p.total) * 100);
  const complete = p.done === p.total;
  const celebrate = complete && justDone.size > 0;
  const runningIdx = active && !complete ? subtasks.findIndex((s) => !s.done) : -1;
  return (
    <div>
      <div class="mb-1.5 flex items-center justify-between text-xs">
        <span class="inline-flex items-center gap-1.5 text-zinc-400">
          <ListChecks size={13} /> Subtasks
        </span>
        <span class={complete ? "text-emerald-400" : "text-zinc-400"}>
          {p.done}/{p.total} done
        </span>
      </div>
      <div class="mb-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          class={`h-full rounded-full transition-all duration-500 ${complete ? "bg-emerald-500" : "bg-violet-500"} ${celebrate ? "bar-complete" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <ol class="flex flex-col gap-1 text-sm">
        {subtasks.map((s, i) => {
          const running = i === runningIdx;
          return (
            <li key={i} class={`flex items-start gap-2 rounded px-1 ${justDone.has(i) ? "subtask-done" : ""}`}>
              {s.done ? (
                <CheckCircle2 size={15} class={`mt-0.5 shrink-0 text-emerald-400 ${justDone.has(i) ? "check-pop" : ""}`} />
              ) : running ? (
                <Loader2 size={15} class="subtask-spin mt-0.5 shrink-0 text-violet-400" />
              ) : (
                <Circle size={15} class="mt-0.5 shrink-0 text-zinc-600" />
              )}
              <span
                class={`transition-colors duration-300 ${
                  s.done ? "text-zinc-500 line-through" : running ? "text-violet-200" : "text-zinc-200"
                }`}
              >
                {s.title}
                {running && <span class="ml-2 text-xs text-violet-400">running…</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return <div class="p-10 text-center text-red-400">{message}</div>;
}

export function Avatar({ emoji, size = "text-3xl" }: { emoji: string; size?: string }) {
  return <div class={`${size} leading-none`}>{emoji}</div>;
}
