import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Reads Claude Code transcript JSONL files to estimate token usage within the
 * rolling session window. Claude Code stores transcripts under
 * ~/.claude/projects/<encoded-path>/*.jsonl, one JSON object per line, where
 * assistant turns carry a `message.usage` object and a top-level `timestamp`.
 */

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** input + output + cache-creation (cache reads are excluded as they're cheap). */
  billableTokens: number;
  messages: number;
}

export interface UsageWindow extends UsageTotals {
  windowHours: number;
  windowStart: string;
  now: string;
}

function claudeProjectsDir(): string {
  return process.env.CLAUDE_PROJECTS_DIR ?? path.join(os.homedir(), ".claude", "projects");
}

async function* walkJsonl(dir: string): AsyncGenerator<string> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e);
    const stat = await fs.stat(full).catch(() => undefined);
    if (!stat) continue;
    if (stat.isDirectory()) {
      yield* walkJsonl(full);
    } else if (e.endsWith(".jsonl")) {
      yield full;
    }
  }
}

interface UsageLine {
  timestamp?: string;
  message?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

const empty = (): UsageTotals => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  billableTokens: 0,
  messages: 0,
});

function addLine(totals: UsageTotals, usage: NonNullable<NonNullable<UsageLine["message"]>["usage"]>): void {
  const i = usage.input_tokens ?? 0;
  const o = usage.output_tokens ?? 0;
  const cc = usage.cache_creation_input_tokens ?? 0;
  const cr = usage.cache_read_input_tokens ?? 0;
  totals.inputTokens += i;
  totals.outputTokens += o;
  totals.cacheCreationTokens += cc;
  totals.cacheReadTokens += cr;
  totals.billableTokens += i + o + cc;
  totals.messages += 1;
}

/**
 * Sum usage across all transcripts within the last `windowHours`.
 * `nowMs` is injectable for testing.
 */
export async function usageInWindow(
  windowHours = 5,
  nowMs: number = Date.now(),
): Promise<UsageWindow> {
  const cutoff = nowMs - windowHours * 3600_000;
  const totals = empty();
  const dir = claudeProjectsDir();

  for await (const file of walkJsonl(dir)) {
    // Skip files untouched since before the window to save work.
    const stat = await fs.stat(file).catch(() => undefined);
    if (!stat || stat.mtimeMs < cutoff) continue;

    let content: string;
    try {
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      let obj: UsageLine;
      try {
        obj = JSON.parse(line) as UsageLine;
      } catch {
        continue;
      }
      const usage = obj.message?.usage;
      if (!usage) continue;
      const ts = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
      if (Number.isNaN(ts) || ts < cutoff) continue;
      addLine(totals, usage);
    }
  }

  return {
    ...totals,
    windowHours,
    windowStart: new Date(cutoff).toISOString(),
    now: new Date(nowMs).toISOString(),
  };
}
