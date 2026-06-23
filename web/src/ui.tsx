import type { ComponentChildren } from "preact";
import { runElapsed, type RunStatus } from "./api";
import { useNow } from "./hooks";

export function Modal({ children, onClose }: { children: ComponentChildren; onClose: () => void }) {
  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="card max-h-[90vh] w-full max-w-xl overflow-auto">{children}</div>
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

export function ErrorBox({ message }: { message: string }) {
  return <div class="p-10 text-center text-red-400">{message}</div>;
}

export function Avatar({ emoji, size = "text-3xl" }: { emoji: string; size?: string }) {
  return <div class={`${size} leading-none`}>{emoji}</div>;
}
