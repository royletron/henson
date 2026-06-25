import { usageMonitorPlugin } from "../plugins/usage-monitor/index.js";
import type { ProjectConfig } from "../core/types.js";

export interface BudgetResult {
  safeToContinue: boolean;
  percentUsed: number;
  resetAt?: string;
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
