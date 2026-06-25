import { bus } from "../core/events.js";
import { GuestConnection, type GuestOptions, type GuestStatus } from "../worker/guest.js";

/**
 * Holds this server's single outbound guest offer, so a guest can offer their
 * machine from their own web app (rather than a separate `mysteron join` CLI).
 */
export class GuestController {
  private conn?: GuestConnection;

  start(opts: GuestOptions): GuestStatus {
    this.conn?.stop("Replaced by a new offer.");
    const conn = new GuestConnection(opts);
    conn.onChange = () => bus.emitGuest();
    this.conn = conn;
    conn.start();
    return conn.status();
  }

  stop(): void {
    this.conn?.stop("Offer withdrawn.");
    this.conn = undefined;
    bus.emitGuest();
  }

  status(): GuestStatus | undefined {
    const s = this.conn?.status();
    if (s && s.state === "stopped") {
      this.conn = undefined;
      return undefined;
    }
    return s;
  }

  /** The live connection (for proxying the host board). */
  get connection(): GuestConnection | undefined {
    return this.conn;
  }
}
