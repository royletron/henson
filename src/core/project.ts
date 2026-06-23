import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { generateCompanion } from "./names.js";
import {
  ETIQUETTE_DOC,
  SPEC_DOC,
  boardDir,
  docsDir,
  memoryDir,
  projectConfigPath,
  projectHensonDir,
} from "./paths.js";
import { registerProject } from "./registry.js";
import type { ProjectConfig } from "./types.js";

const DEFAULT_ETIQUETTE = `# Project etiquette

A short contract for any agent working in this project.

- **Always commit** your work in small, focused commits with clear messages.
- **Always merge to main** once a ticket is reviewed and green — don't let branches rot.
- **Always run the tests** before moving a ticket to \`review\` or \`done\`.
- **Write few comments** — let clear code and names carry the meaning; comment only the surprising bits.
- **Match the surrounding style** rather than introducing new conventions.
- **Keep tickets honest** — if tests fail, say so; if a step was skipped, note it on the ticket.
`;

function defaultSpec(name: string): string {
  return `# ${name}

> Project specification. Edit this in the Henson web UI or directly on disk —
> changes are watched and can be turned into tickets.

## Overview

_Describe what this project is and what "done" looks like._

## Goals

- ...

## Non-goals

- ...
`;
}

export async function loadProjectConfig(projectRoot: string): Promise<ProjectConfig | undefined> {
  try {
    const raw = await fs.readFile(projectConfigPath(projectRoot), "utf8");
    return JSON.parse(raw) as ProjectConfig;
  } catch {
    return undefined;
  }
}

export async function saveProjectConfig(
  projectRoot: string,
  config: ProjectConfig,
): Promise<void> {
  await fs.mkdir(projectHensonDir(projectRoot), { recursive: true });
  await fs.writeFile(
    projectConfigPath(projectRoot),
    JSON.stringify(config, null, 2) + "\n",
    "utf8",
  );
}

export interface InitOptions {
  name?: string;
  plugins?: string[];
  yolo?: boolean;
}

/**
 * Initialise Henson inside an existing project folder: create the .henson
 * scaffold, generate a companion, seed SPEC + ETIQUETTE docs, and register it.
 */
export async function initProject(
  projectRoot: string,
  opts: InitOptions = {},
): Promise<ProjectConfig> {
  const abs = path.resolve(projectRoot);
  await fs.mkdir(abs, { recursive: true });
  const existing = await loadProjectConfig(abs);
  if (existing) {
    await registerProject(abs, existing.name);
    return existing;
  }

  const name = opts.name ?? path.basename(abs);
  await fs.mkdir(boardDir(abs), { recursive: true });
  await fs.mkdir(docsDir(abs), { recursive: true });
  await fs.mkdir(memoryDir(abs), { recursive: true });

  // Seed docs only if absent.
  const specPath = path.join(docsDir(abs), SPEC_DOC);
  const etiquettePath = path.join(docsDir(abs), ETIQUETTE_DOC);
  await writeIfAbsent(specPath, defaultSpec(name));
  await writeIfAbsent(etiquettePath, DEFAULT_ETIQUETTE);

  const config: ProjectConfig = {
    id: nanoid(8),
    name,
    companion: { ...generateCompanion(), recipe: "solo" },
    plugins: opts.plugins ?? ["usage-monitor"],
    yolo: opts.yolo ?? false,
    createdAt: new Date().toISOString(),
  };
  await saveProjectConfig(abs, config);
  await registerProject(abs, name);
  return config;
}

async function writeIfAbsent(file: string, content: string): Promise<void> {
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, content, "utf8");
  }
}
