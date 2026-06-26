import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { memoryDir } from "./paths.js";
import type { MemorySummary } from "./types.js";

/**
 * Project memory is shared context that travels with the git repo (under
 * <project>/.mysteron/memory). It mirrors the Claude Code memory format —
 * markdown with frontmatter (name, description, metadata.type) — but is meant
 * to grow alongside the code: organise it to mimic the `src/` tree (e.g.
 * `core/board.md`, `server/api.md`) so an agent that learns it owns an area can
 * record that next to the file structure it maps to. A memory file can hold as
 * many related facts as make sense for its area; it is not one fact per file.
 */

const MD = ".md";

/**
 * Resolve a memory name to an absolute path inside the memory dir. Names may be
 * nested (e.g. `core/board`) so memory can mirror the src tree, but must stay
 * within the memory dir — traversal and absolute paths are rejected.
 */
function resolveMemory(projectRoot: string, name: string): { full: string; rel: string } {
  const dir = memoryDir(projectRoot);
  const rel = name.endsWith(MD) ? name : `${name}${MD}`;
  const full = path.resolve(dir, rel);
  const within = path.relative(dir, full);
  if (within.startsWith("..") || path.isAbsolute(within) || within === "") {
    throw new Error(`Invalid memory name: ${name}`);
  }
  return { full, rel: within.split(path.sep).join("/") };
}

export async function listMemories(projectRoot: string): Promise<MemorySummary[]> {
  const dir = memoryDir(projectRoot);
  const out: MemorySummary[] = [];

  async function walk(current: string, prefix: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(current, entry.name), rel);
      } else if (entry.name.endsWith(MD) && rel !== "MEMORY.md") {
        const raw = await fs.readFile(path.join(current, entry.name), "utf8");
        const { data } = matter(raw);
        out.push({
          name: rel.replace(/\.md$/, ""),
          description: data.description as string | undefined,
          type: (data.metadata as { type?: string } | undefined)?.type,
        });
      }
    }
  }

  await walk(dir, "");
  return out;
}

export async function readMemory(
  projectRoot: string,
  name: string,
): Promise<string | undefined> {
  try {
    return await fs.readFile(resolveMemory(projectRoot, name).full, "utf8");
  } catch {
    return undefined;
  }
}

export async function writeMemory(
  projectRoot: string,
  name: string,
  content: string,
): Promise<string> {
  const { full, rel } = resolveMemory(projectRoot, name);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
  return rel;
}
