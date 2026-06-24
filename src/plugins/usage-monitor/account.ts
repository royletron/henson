import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const pexec = promisify(execFile);

/**
 * Which kind of Claude credentials are in play. This is the central fork for the
 * usage feature: the two account types have *different* limit models, so they
 * want different handling.
 *
 *  - "subscription" (Pro/Max): limits are a 5-hour rolling session cap + a
 *    weekly (7-day) cap, enforced server-side and unified across surfaces. The
 *    real numbers only come back on API response headers (see proxy.ts).
 *  - "api-key": there is no native session/weekly *token* cap — just per-minute
 *    limits and a monthly spend cap you set in the console. So the only sensible
 *    thing to track is a self-imposed budget (tokens per window).
 */
export type AccountKind = "subscription" | "api-key" | "unknown";

export interface AccountInfo {
  kind: AccountKind;
  /** e.g. "max", "pro", "enterprise" when known (subscription only). */
  subscriptionType?: string;
  /** Human-readable note on how we determined it (for display/debugging). */
  source: string;
}

interface OauthCreds {
  claudeAiOauth?: { subscriptionType?: string };
}

function parseOauth(obj: unknown, source: string): AccountInfo | undefined {
  const o = (obj as OauthCreds | null)?.claudeAiOauth;
  if (!o) return undefined;
  return { kind: "subscription", subscriptionType: o.subscriptionType, source };
}

/** Linux / non-keychain setups store OAuth creds in a plain file. */
async function readCredsFile(): Promise<AccountInfo | undefined> {
  const p = path.join(os.homedir(), ".claude", ".credentials.json");
  try {
    return parseOauth(JSON.parse(await fs.readFile(p, "utf8")), "~/.claude/.credentials.json");
  } catch {
    return undefined;
  }
}

/**
 * macOS keeps OAuth creds in the login keychain. The read may be denied
 * silently (our process isn't in the item's ACL) or prompt — either way we just
 * degrade to undefined and fall back to header-inference.
 */
async function readKeychain(): Promise<AccountInfo | undefined> {
  try {
    const { stdout } = await pexec(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { timeout: 4000 },
    );
    return parseOauth(JSON.parse(stdout), "macOS keychain");
  } catch {
    return undefined;
  }
}

let cache: { at: number; info: AccountInfo } | undefined;
const TTL_MS = 5 * 60_000;

/**
 * Determine whether Claude Code is authenticating with an API key or a
 * Claude.ai subscription. Cached for a few minutes (the keychain read can be
 * slow). `hintHasUnifiedLimits` lets the caller short-circuit to "subscription"
 * when the proxy has seen `anthropic-ratelimit-unified-*` headers — those are
 * only ever returned for subscription accounts, so they're a reliable signal
 * that needs no keychain access.
 */
export async function detectAccount(hintHasUnifiedLimits = false): Promise<AccountInfo> {
  if (hintHasUnifiedLimits) {
    return { kind: "subscription", source: "unified rate-limit headers observed" };
  }
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.info;

  const info = await resolveAccount();
  cache = { at: now, info };
  return info;
}

async function resolveAccount(): Promise<AccountInfo> {
  // An explicit API key wins — Claude Code prefers it over OAuth. (Note: we
  // can't see an apiKeyHelper-provided key here; those rare setups read as
  // "unknown" and fall back to budget mode, which is the safe default.)
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    return { kind: "api-key", source: "ANTHROPIC_API_KEY" };
  }
  return (
    (await readCredsFile()) ??
    (process.platform === "darwin" ? await readKeychain() : undefined) ??
    { kind: "unknown", source: "no credentials found" }
  );
}

/** Test hook: drop the cached detection. */
export function _resetAccountCache(): void {
  cache = undefined;
}
