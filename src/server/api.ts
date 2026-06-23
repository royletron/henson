import express, { type Express, type Request, type Response } from "express";
import {
  bus,
  createTicket,
  deleteTicket,
  getTicket,
  listDocs,
  listMemories,
  listTickets,
  loadProjectConfig,
  readDoc,
  updateTicket,
  writeDoc,
  type ProjectConfig,
  type RegistryEntry,
} from "../core/index.js";
import { findEntry, loadRegistry, unregisterProject } from "../core/registry.js";
import { initProject } from "../core/project.js";
import { RECIPES } from "../core/recipes.js";
import { TICKET_STATES } from "../core/types.js";
import { allPlugins, enabledPlugins } from "../plugins/manager.js";
import { usageMonitorPlugin } from "../plugins/usage-monitor/index.js";
import type { ProjectWatcher } from "../core/watcher.js";

interface ResolvedProject {
  entry: RegistryEntry;
  config: ProjectConfig;
}

async function resolve(id: string): Promise<ResolvedProject | undefined> {
  const entry = await findEntry(id);
  if (!entry) return undefined;
  const config = await loadProjectConfig(entry.path);
  if (!config) return undefined;
  return { entry, config };
}

function notFound(res: Response): Response {
  return res.status(404).json({ error: "not found" });
}

export function registerApi(app: Express, watcher: ProjectWatcher): void {
  app.use(express.json({ limit: "4mb" }));

  // --- Projects ------------------------------------------------------------
  app.get("/api/projects", async (_req: Request, res: Response) => {
    const reg = await loadRegistry();
    const pending = new Set(watcher.pendingSyncs().map((p) => p.projectId));
    const projects = [];
    for (const entry of reg.projects) {
      const config = await loadProjectConfig(entry.path);
      const tickets = config ? await listTickets(entry.path) : [];
      const counts: Record<string, number> = {};
      for (const s of TICKET_STATES) counts[s] = 0;
      for (const t of tickets) counts[t.state]++;
      projects.push({
        ...entry,
        companion: config?.companion,
        yolo: config?.yolo ?? false,
        plugins: config?.plugins ?? [],
        counts,
        pendingDocSync: pending.has(entry.id),
        valid: Boolean(config),
      });
    }
    res.json({ projects });
  });

  app.post("/api/projects/init", async (req: Request, res: Response) => {
    const { path: projectPath, name } = req.body ?? {};
    if (!projectPath || typeof projectPath !== "string") {
      return res.status(400).json({ error: "path is required" });
    }
    try {
      const config = await initProject(projectPath, { name });
      res.json({ config });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/projects/:id", async (req: Request, res: Response) => {
    const ok = await unregisterProject(req.params.id);
    res.json({ ok });
  });

  app.get("/api/projects/:id", async (req: Request, res: Response) => {
    const r = await resolve(req.params.id);
    if (!r) return notFound(res);
    const tickets = await listTickets(r.entry.path);
    const board: Record<string, typeof tickets> = {};
    for (const s of TICKET_STATES) board[s] = [];
    for (const t of tickets) board[t.state].push(t);
    res.json({
      entry: r.entry,
      config: r.config,
      board,
      states: TICKET_STATES,
      docs: await listDocs(r.entry.path),
      memories: await listMemories(r.entry.path),
      pendingDocSync: watcher.pendingSyncs().some((p) => p.projectId === r.entry.id),
    });
  });

  app.post("/api/projects/:id/sync-clear", async (req: Request, res: Response) => {
    watcher.clearPending(req.params.id);
    res.json({ ok: true });
  });

  // --- Tickets -------------------------------------------------------------
  app.get("/api/projects/:id/tickets", async (req: Request, res: Response) => {
    const r = await resolve(req.params.id);
    if (!r) return notFound(res);
    res.json({ tickets: await listTickets(r.entry.path) });
  });

  app.post("/api/projects/:id/tickets", async (req: Request, res: Response) => {
    const r = await resolve(req.params.id);
    if (!r) return notFound(res);
    if (!req.body?.title) return res.status(400).json({ error: "title is required" });
    const ticket = await createTicket(r.entry.path, req.body);
    bus.emitEvent({ type: "board-changed", projectId: r.entry.id, detail: ticket.id });
    res.json({ ticket });
  });

  app.patch("/api/projects/:id/tickets/:ticketId", async (req: Request, res: Response) => {
    const r = await resolve(req.params.id);
    if (!r) return notFound(res);
    const ticket = await updateTicket(r.entry.path, req.params.ticketId, req.body ?? {});
    if (!ticket) return notFound(res);
    bus.emitEvent({ type: "board-changed", projectId: r.entry.id, detail: ticket.id });
    res.json({ ticket });
  });

  app.delete("/api/projects/:id/tickets/:ticketId", async (req: Request, res: Response) => {
    const r = await resolve(req.params.id);
    if (!r) return notFound(res);
    const ok = await deleteTicket(r.entry.path, req.params.ticketId);
    bus.emitEvent({ type: "board-changed", projectId: r.entry.id });
    res.json({ ok });
  });

  // --- Docs ----------------------------------------------------------------
  app.get("/api/projects/:id/docs/:name", async (req: Request, res: Response) => {
    const r = await resolve(req.params.id);
    if (!r) return notFound(res);
    const content = await readDoc(r.entry.path, req.params.name);
    if (content === undefined) return notFound(res);
    res.json({ name: req.params.name, content });
  });

  app.put("/api/projects/:id/docs/:name", async (req: Request, res: Response) => {
    const r = await resolve(req.params.id);
    if (!r) return notFound(res);
    if (typeof req.body?.content !== "string") {
      return res.status(400).json({ error: "content is required" });
    }
    try {
      const doc = await writeDoc(r.entry.path, req.params.name, req.body.content);
      res.json({ doc });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- Memory --------------------------------------------------------------
  app.get("/api/projects/:id/memories", async (req: Request, res: Response) => {
    const r = await resolve(req.params.id);
    if (!r) return notFound(res);
    res.json({ memories: await listMemories(r.entry.path) });
  });

  // --- Usage (first-party plugin surfaced over HTTP) -----------------------
  app.get("/api/projects/:id/usage", async (req: Request, res: Response) => {
    const r = await resolve(req.params.id);
    if (!r) return notFound(res);
    if (!r.config.plugins.includes("usage-monitor")) {
      return res.json({ enabled: false });
    }
    const tools = usageMonitorPlugin.tools?.({ projectRoot: r.entry.path, config: r.config }) ?? [];
    const check = tools.find((t) => t.name === "check_usage_budget");
    if (!check) return res.json({ enabled: false });
    const data = await check.handler({}, { projectRoot: r.entry.path, config: r.config });
    res.json({ enabled: true, ...(data as object) });
  });

  // --- Static metadata -----------------------------------------------------
  app.get("/api/recipes", (_req: Request, res: Response) => res.json({ recipes: RECIPES }));

  app.get("/api/plugins", async (req: Request, res: Response) => {
    const idFilter = req.query.project as string | undefined;
    let active: string[] = [];
    if (idFilter) {
      const r = await resolve(idFilter);
      active = r ? enabledPlugins(r.config.plugins).map((p) => p.id) : [];
    }
    res.json({
      plugins: allPlugins().map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        active: active.includes(p.id),
      })),
    });
  });

  // --- Live updates (SSE) --------------------------------------------------
  app.get("/api/events", (_req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    const onEvent = (evt: unknown) => res.write(`data: ${JSON.stringify(evt)}\n\n`);
    bus.on("henson", onEvent);
    const keepAlive = setInterval(() => res.write(": ping\n\n"), 25_000);
    res.on("close", () => {
      clearInterval(keepAlive);
      bus.off("henson", onEvent);
    });
  });
}
