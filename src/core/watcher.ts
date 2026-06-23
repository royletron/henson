import chokidar, { type FSWatcher } from "chokidar";
import { bus } from "./events.js";
import { boardDir, docsDir } from "./paths.js";
import { loadRegistry } from "./registry.js";

/**
 * Watches the docs and board directories of every registered project. Doc
 * changes raise a "docs-changed" event and mark the project as having pending
 * changes the companion should review for new tickets.
 */
export class ProjectWatcher {
  private watcher?: FSWatcher;
  /** projectId -> ISO timestamp of last docs change not yet synced into tickets. */
  private pendingDocSync = new Map<string, string>();

  async start(): Promise<void> {
    const reg = await loadRegistry();
    const paths: string[] = [];
    const byPath = new Map<string, string>(); // watched dir -> projectId
    for (const p of reg.projects) {
      const d = docsDir(p.path);
      const b = boardDir(p.path);
      paths.push(d, b);
      byPath.set(d, p.id);
      byPath.set(b, p.id);
    }
    if (paths.length === 0) return;

    this.watcher = chokidar.watch(paths, {
      ignoreInitial: true,
      depth: 1,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    const resolve = (file: string): { id: string; kind: "docs" | "board" } | undefined => {
      for (const [dir, id] of byPath) {
        if (file.startsWith(dir)) {
          return { id, kind: dir.endsWith("board") ? "board" : "docs" };
        }
      }
      return undefined;
    };

    const onChange = (file: string) => {
      const hit = resolve(file);
      if (!hit) return;
      if (hit.kind === "docs") {
        this.pendingDocSync.set(hit.id, new Date().toISOString());
        bus.emitEvent({ type: "docs-changed", projectId: hit.id, detail: file });
      } else {
        bus.emitEvent({ type: "board-changed", projectId: hit.id, detail: file });
      }
    };

    this.watcher
      .on("add", onChange)
      .on("change", onChange)
      .on("unlink", onChange);
  }

  /** Projects whose docs changed since the companion last reviewed them. */
  pendingSyncs(): { projectId: string; since: string }[] {
    return [...this.pendingDocSync.entries()].map(([projectId, since]) => ({
      projectId,
      since,
    }));
  }

  clearPending(projectId: string): void {
    this.pendingDocSync.delete(projectId);
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
  }
}
