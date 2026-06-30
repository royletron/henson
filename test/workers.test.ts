import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import WebSocket from "ws";

// Settings (the guest token) live under MYSTERON_HOME — isolate it before import.
const tmp = path.join(os.tmpdir(), `mysteron-workers-${process.pid}`);
process.env.MYSTERON_HOME = path.join(tmp, "home");

const { WorkerRegistry } = await import("../src/server/workers.js");
const { mintGuestToken } = await import("../src/core/settings.js");

let server: http.Server;
let port: number;
let token: string;
let registry: InstanceType<typeof WorkerRegistry>;

before(async () => {
  token = (await mintGuestToken()).token;
  registry = new WorkerRegistry();
  const wss = registry.createWss(() => "Test host");
  server = http.createServer();
  server.on("upgrade", (req, socket, head) => {
    if ((req.url || "").split("?")[0] === "/worker") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else socket.destroy();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
});

test("a guest's quota message is stored on the worker and exposed via list()", async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/worker`);
  await new Promise<void>((resolve, reject) => {
    ws.on("error", reject);
    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          t: "register",
          token,
          label: "macbook",
          capacity: 1,
          expiresInMs: 60_000,
          version: "0.1.0",
          commitSha: "abc1234",
        }),
      );
    });
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.t === "registered") {
        ws.send(
          JSON.stringify({
            t: "quota",
            quota: { source: "live", percentUsed: 88, safeToContinue: false, resetAt: "2026-06-25T20:00:00Z", capturedAt: "2026-06-25T18:00:00Z" },
          }),
        );
        resolve();
      } else if (msg.t === "rejected") {
        reject(new Error(msg.reason));
      }
    });
  });

  // Poll until the async message has been applied.
  let worker = registry.list()[0];
  for (let i = 0; i < 50 && !worker?.quota; i++) {
    await new Promise((r) => setTimeout(r, 10));
    worker = registry.list()[0];
  }
  ws.close();

  assert.ok(worker, "expected a connected worker");
  assert.equal(worker.label, "macbook");
  assert.equal(worker.version, "0.1.0");
  assert.equal(worker.commitSha, "abc1234");
  assert.ok(worker.quota, "expected the quota to be stored");
  assert.equal(worker.quota.percentUsed, 88);
  assert.equal(worker.quota.safeToContinue, false);
  assert.equal(worker.quota.source, "live");
});
