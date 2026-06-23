import { promises as fs } from "node:fs";
import path from "node:path";
import { docsDir } from "./paths.js";
import type { DocSummary } from "./types.js";

/** Reject names that try to escape the docs directory. */
function safeDocName(name: string): string {
  const base = path.basename(name);
  if (base !== name || name.includes("..") || name.startsWith("/")) {
    throw new Error(`Invalid doc name: ${name}`);
  }
  return name.endsWith(".md") ? name : `${name}.md`;
}

export async function listDocs(projectRoot: string): Promise<DocSummary[]> {
  const dir = docsDir(projectRoot);
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const out: DocSummary[] = [];
  for (const f of files) {
    const stat = await fs.stat(path.join(dir, f));
    out.push({
      name: f,
      path: path.join(dir, f),
      bytes: stat.size,
      updated: stat.mtime.toISOString(),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readDoc(
  projectRoot: string,
  name: string,
): Promise<string | undefined> {
  try {
    return await fs.readFile(path.join(docsDir(projectRoot), safeDocName(name)), "utf8");
  } catch {
    return undefined;
  }
}

export async function writeDoc(
  projectRoot: string,
  name: string,
  content: string,
): Promise<DocSummary> {
  const dir = docsDir(projectRoot);
  await fs.mkdir(dir, { recursive: true });
  const safe = safeDocName(name);
  const full = path.join(dir, safe);
  await fs.writeFile(full, content, "utf8");
  const stat = await fs.stat(full);
  return { name: safe, path: full, bytes: stat.size, updated: stat.mtime.toISOString() };
}

export async function deleteDoc(projectRoot: string, name: string): Promise<boolean> {
  try {
    await fs.unlink(path.join(docsDir(projectRoot), safeDocName(name)));
    return true;
  } catch {
    return false;
  }
}
