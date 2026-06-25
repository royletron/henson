import { useEffect, useState } from "preact/hooks";

export type ToastTone = "success" | "warn" | "info";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

// Module-level toast bus — like ws.ts, anything can push without context plumbing.
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<(toasts: Toast[]) => void>();
const emit = () => listeners.forEach((l) => l(toasts));

export function pushToast(message: string, tone: ToastTone = "info"): void {
  const id = nextId++;
  toasts = [...toasts, { id, message, tone }];
  emit();
  setTimeout(() => dismissToast(id), 4500);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const TONE: Record<ToastTone, string> = {
  success: "border-emerald-500 text-emerald-300",
  warn: "border-amber-500 text-amber-300",
  info: "border-zinc-700 text-zinc-200",
};

/** Mount once; renders the stack of active toasts bottom-right. */
export function Toaster() {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.add(setList);
    return () => void listeners.delete(setList);
  }, []);

  if (list.length === 0) return null;
  return (
    <div class="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-72 flex-col gap-2">
      {list.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          class={`pointer-events-auto cursor-pointer rounded-sm border bg-zinc-900 px-3 py-2 text-left text-sm shadow-lg shadow-black/40 ${TONE[t.tone]}`}
          style="animation: drawer-in 0.18s ease-out"
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
