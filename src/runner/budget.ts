import { usageMonitorPlugin } from "../plugins/usage-monitor/index.js";
import type { ProjectConfig } from "../core/types.js";
import type { GuestQuota } from "../core/worker-protocol.js";

export interface BudgetResult {
  safeToContinue: boolean;
  percentUsed: number;
  resetAt?: string;
  /** How the figure was derived: real captured limits, or a transcript-token estimate. */
  source?: "live" | "estimate";
}

/**
 * Ask the usage-monitor whether the host can still run Claude locally. Returns
 * `undefined` when the plugin isn't enabled (or errors) — callers treat that as
 * "no budget constraint, run locally". Shared by the autopilot loop and the
 * manual-run endpoint so both make the same offload decision.
 */
export async function checkUsageBudget(
  projectRoot: string,
  config: ProjectConfig,
): Promise<BudgetResult | undefined> {
  if (!config.plugins.includes("usage-monitor")) return undefined;
  const tools = usageMonitorPlugin.tools?.({ projectRoot, config }) ?? [];
  const tool = tools.find((t) => t.name === "check_usage_budget");
  if (!tool) return undefined;
  try {
    return (await tool.handler({}, { projectRoot, config })) as BudgetResult;
  } catch {
    return undefined;
  }
}

/**
 * A guest has no project of its own, but its Claude account still lives on this
 * machine. Capture its allowance with the very same usage-monitor the host runs
 * on itself — real subscription limits when the capture proxy has fresh headers,
 * otherwise the transcript-token estimate — so host and guest readings are
 * directly comparable. Returns `undefined` if the monitor yields nothing.
 */
export async function captureGuestQuota(): Promise<GuestQuota | undefined> {
  const config: ProjectConfig = {
    id: "guest",
    name: "guest",
    recipe: "solo",
    companions: [],
    plugins: ["usage-monitor"],
    yolo: false,
    createdAt: new Date().toISOString(),
  };
  const b = await checkUsageBudget(process.cwd(), config);
  if (!b) return undefined;
  return {
    source: b.source ?? "estimate",
    percentUsed: b.percentUsed,
    safeToContinue: b.safeToContinue,
    resetAt: b.resetAt,
    capturedAt: new Date().toISOString(),
  };
}
