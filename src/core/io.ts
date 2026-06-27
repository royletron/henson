import { promises as fs } from "node:fs";

// ponytail: global map, per-path chains — correct for a single-process server
const queues = new Map<string, Promise<void>>();

/** Serialize async operations on a single file path. */
export function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const tail = (queues.get(filePath) ?? Promise.resolve()).then(fn);
  queues.set(filePath, tail.then(() => {}, () => {}));
  return tail;
}

/** Write via temp+rename so readers never see a partial file. */
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, filePath);
}
