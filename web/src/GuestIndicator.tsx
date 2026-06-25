import { useEffect, useRef, useState } from "preact/hooks";
import { useAsync, useGlobalEvents } from "./hooks";
import { getWorkers, fmtWhen } from "./api";
import { LiveDot } from "./ui";

/** Small cloud glyph — signals work offloaded to a remote guest machine. */
function CloudGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6-1.6A4 4 0 0 0 6 19z" />
    </svg>
  );
}

/**
 * Header indicator for connected guest companions. Hidden when none are
 * connected; otherwise shows a live count, click to expand a detail popover.
 * Refetches on every global event (guests register/finish push `workers-changed`).
 */
export function GuestIndicator() {
  const [nonce, setNonce] = useState(0);
  useGlobalEvents(() => setNonce((n) => n + 1));
  const workers = useAsync(() => getWorkers(), [nonce]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const list = workers.data?.workers ?? [];
  if (list.length === 0) return null;

  const busy = list.filter((w) => w.status === "busy").length;
  const allBusy = busy === list.length;

  return (
    <div ref={ref} class="relative inline-flex">
      <button
        type="button"
        class={`pill gap-1.5 ${allBusy ? "border-amber-500 text-amber-400" : "border-emerald-500 text-emerald-400"}`}
        title={`${list.length} guest companion${list.length === 1 ? "" : "s"} connected${busy ? `, ${busy} working` : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <CloudGlyph />
        <span>{list.length}</span>
      </button>

      {open && (
        <div class="card absolute right-0 top-full z-50 mt-1.5 w-72 p-3 text-sm shadow-lg">
          <div class="mb-2 font-semibold">
            Connected guests ({list.length}
            {busy ? `, ${busy} working` : ""})
          </div>
          <div class="flex flex-col gap-1.5">
            {list.map((w) => (
              <div key={w.id} class="flex items-center gap-2 rounded-sm border border-zinc-800 px-2.5 py-1.5">
                <span class={`inline-flex items-center gap-1.5 ${w.status === "busy" ? "text-amber-400" : "text-emerald-400"}`}>
                  <LiveDot />
                  {w.label}
                </span>
                <span class="text-xs text-zinc-500">×{w.capacity}</span>
                <div class="flex-1" />
                <span class="text-xs text-zinc-500">expires {fmtWhen(w.expiresAt)}</span>
              </div>
            ))}
          </div>
          <a
            href="#/settings"
            class="mt-2 inline-block text-xs text-violet-300 hover:underline"
            onClick={() => setOpen(false)}
          >
            Manage guests →
          </a>
        </div>
      )}
    </div>
  );
}
