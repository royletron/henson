import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectWatcher } from "../core/watcher.js";
import { registerApi } from "./api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Locate the static UI directory whether running from src (tsx) or dist (tsc). */
function publicDir(): string {
  const candidates = [
    path.join(__dirname, "public"),
    path.join(__dirname, "..", "..", "src", "server", "public"),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0];
}

export interface ServeOptions {
  port?: number;
  host?: string;
}

export async function serve(opts: ServeOptions = {}): Promise<{ port: number; close: () => Promise<void> }> {
  const port = opts.port ?? Number(process.env.HENSON_PORT ?? 4319);
  const host = opts.host ?? process.env.HENSON_HOST ?? "127.0.0.1";

  const watcher = new ProjectWatcher();
  await watcher.start();

  const app = express();
  registerApi(app, watcher);
  app.use(express.static(publicDir()));

  return new Promise((resolveServer) => {
    const server = app.listen(port, host, () => {
      // eslint-disable-next-line no-console
      console.log(`🎭  Henson is running at http://${host}:${port}`);
      resolveServer({
        port,
        close: async () => {
          await watcher.stop();
          await new Promise<void>((r) => server.close(() => r()));
        },
      });
    });
  });
}
