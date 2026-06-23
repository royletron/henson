#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import {
  createTicket,
  findEntry,
  listTickets,
  loadProjectConfig,
  loadRegistry,
  unregisterProject,
} from "./core/index.js";
import { initProject } from "./core/project.js";
import { registerProject } from "./core/registry.js";
import { startStdioMcp } from "./mcp/server.js";
import { serve } from "./server/index.js";

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { positionals: string[]; flags: Flags } {
  const positionals: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

const HELP = `🎭  Henson — manage AI agents across your projects.

Usage:
  henson init [path] [--name <name>] [--yolo]   Initialise Henson in a project folder
  henson register <path>                         Register an existing Henson project
  henson unregister <id|path>                    Remove a project from the registry
  henson list                                    List registered projects
  henson serve [--port <n>] [--host <h>]         Start the web UI + API
  henson mcp [id|path]                           Run the MCP server (stdio) for a project
  henson ticket list <id|path>                   List a project's tickets
  henson ticket add <id|path> <title...>         Add a ticket (to backlog)
  henson help                                    Show this help
`;

async function resolveRoot(idOrPath?: string): Promise<string> {
  const target = idOrPath ?? process.cwd();
  const entry = await findEntry(target);
  if (entry) return entry.path;
  return path.resolve(target);
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  const { positionals, flags } = parseArgs(rest);

  switch (cmd) {
    case "init": {
      const config = await initProject(positionals[0] ?? process.cwd(), {
        name: typeof flags.name === "string" ? flags.name : undefined,
        yolo: Boolean(flags.yolo),
      });
      console.log(
        `Initialised "${config.name}" ${config.companion.avatar}  Companion: ${config.companion.name}`,
      );
      console.log(`  plugins: ${config.plugins.join(", ") || "(none)"}  yolo: ${config.yolo}`);
      console.log(`Run "henson serve" then open the web UI to manage the board.`);
      break;
    }
    case "register": {
      if (!positionals[0]) throw new Error("register requires a <path>");
      const cfg = await loadProjectConfig(path.resolve(positionals[0]));
      const name = cfg?.name ?? path.basename(path.resolve(positionals[0]));
      const entry = await registerProject(positionals[0], name);
      console.log(`Registered ${entry.name} (${entry.id}) -> ${entry.path}`);
      break;
    }
    case "unregister": {
      if (!positionals[0]) throw new Error("unregister requires an <id|path>");
      const ok = await unregisterProject(positionals[0]);
      console.log(ok ? "Unregistered." : "Nothing matched.");
      break;
    }
    case "list": {
      const reg = await loadRegistry();
      if (reg.projects.length === 0) {
        console.log("No projects registered. Try: henson init");
        break;
      }
      for (const p of reg.projects) {
        const cfg = await loadProjectConfig(p.path);
        const av = cfg?.companion.avatar ?? "❓";
        const comp = cfg?.companion.name ?? "(uninitialised)";
        console.log(`${av}  ${p.name}  [${p.id}]  ${comp}\n    ${p.path}`);
      }
      break;
    }
    case "serve": {
      await serve({
        port: typeof flags.port === "string" ? Number(flags.port) : undefined,
        host: typeof flags.host === "string" ? flags.host : undefined,
      });
      break;
    }
    case "mcp": {
      // Important: no stdout noise — stdio is the MCP transport.
      const root = await resolveRoot(positionals[0]);
      await startStdioMcp(root);
      break;
    }
    case "ticket": {
      const sub = positionals[0];
      const root = await resolveRoot(positionals[1]);
      if (sub === "list") {
        const tickets = await listTickets(root);
        for (const t of tickets) {
          console.log(`[${t.state}] ${t.title}  (${t.priority})  ${t.id}`);
        }
        if (tickets.length === 0) console.log("(no tickets)");
      } else if (sub === "add") {
        const title = positionals.slice(2).join(" ");
        if (!title) throw new Error('ticket add requires a title');
        const t = await createTicket(root, { title });
        console.log(`Added ticket ${t.id}: ${t.title}`);
      } else {
        console.log("Usage: henson ticket <list|add> <id|path> [title...]");
      }
      break;
    }
    case "help":
    case undefined:
    case "--help":
    case "-h":
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`henson: ${(err as Error).message}`);
  process.exitCode = 1;
});
