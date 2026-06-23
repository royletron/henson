import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { hensonHome, registryPath } from "./paths.js";
import type { Registry, RegistryEntry } from "./types.js";

async function ensureHome(): Promise<void> {
  await fs.mkdir(hensonHome(), { recursive: true });
}

export async function loadRegistry(): Promise<Registry> {
  try {
    const raw = await fs.readFile(registryPath(), "utf8");
    const parsed = JSON.parse(raw) as Registry;
    if (!Array.isArray(parsed.projects)) return { projects: [] };
    return parsed;
  } catch {
    return { projects: [] };
  }
}

export async function saveRegistry(reg: Registry): Promise<void> {
  await ensureHome();
  await fs.writeFile(registryPath(), JSON.stringify(reg, null, 2) + "\n", "utf8");
}

/** Register a project path. If already registered (by path), returns the existing entry. */
export async function registerProject(
  projectRoot: string,
  name: string,
): Promise<RegistryEntry> {
  const abs = path.resolve(projectRoot);
  const reg = await loadRegistry();
  const existing = reg.projects.find((p) => p.path === abs);
  if (existing) return existing;
  const entry: RegistryEntry = {
    id: nanoid(8),
    name,
    path: abs,
    createdAt: new Date().toISOString(),
  };
  reg.projects.push(entry);
  await saveRegistry(reg);
  return entry;
}

export async function unregisterProject(idOrPath: string): Promise<boolean> {
  const reg = await loadRegistry();
  const abs = path.resolve(idOrPath);
  const before = reg.projects.length;
  reg.projects = reg.projects.filter((p) => p.id !== idOrPath && p.path !== abs);
  if (reg.projects.length === before) return false;
  await saveRegistry(reg);
  return true;
}

export async function findEntry(idOrPath: string): Promise<RegistryEntry | undefined> {
  const reg = await loadRegistry();
  const abs = path.resolve(idOrPath);
  return reg.projects.find((p) => p.id === idOrPath || p.path === abs);
}
