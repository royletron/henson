import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** The Mysteron build a worker is running, so the host can spot stale guests. */
export interface WorkerVersion {
  /** `version` from the running install's package.json. */
  version?: string;
  /** Short git sha of the running install's checkout (undefined for a packed install). */
  commitSha?: string;
}

/** Walk up from this module to the package root (the dir holding our package.json). */
async function packageRoot(): Promise<string | undefined> {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8"));
      if (pkg?.name === "mysteron") return dir;
    } catch {
      /* keep walking up */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

let cached: Promise<WorkerVersion> | undefined;

/** The version + short commit sha of the Mysteron this process is running. Cached. */
export function localWorkerVersion(): Promise<WorkerVersion> {
  return (cached ??= resolve());
}

async function resolve(): Promise<WorkerVersion> {
  const root = await packageRoot();
  if (!root) return {};
  let version: string | undefined;
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    if (typeof pkg?.version === "string") version = pkg.version;
  } catch {
    /* no readable package.json */
  }
  let commitSha: string | undefined;
  try {
    const { stdout } = await exec("git", ["-C", root, "rev-parse", "--short", "HEAD"]);
    commitSha = stdout.trim() || undefined;
  } catch {
    /* not a git checkout (packed install) */
  }
  return { version, commitSha };
}
