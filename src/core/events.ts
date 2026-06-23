import { EventEmitter } from "node:events";

export interface HensonEvent {
  type: "docs-changed" | "board-changed" | "config-changed";
  projectId: string;
  detail?: string;
  at: string;
}

/** Process-wide event bus used to push live updates to the web UI (via SSE). */
class HensonBus extends EventEmitter {
  emitEvent(evt: Omit<HensonEvent, "at">): void {
    this.emit("henson", { ...evt, at: new Date().toISOString() } satisfies HensonEvent);
  }
}

export const bus = new HensonBus();
