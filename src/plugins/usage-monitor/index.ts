import { z } from "zod";
import type { Plugin } from "../types.js";
import type { ProjectConfig } from "../../core/types.js";
import { usageInWindow } from "./usage.js";

/**
 * Token limit lookup order: project config → env var → default.
 * The default (5M) is intentionally generous — calibrate to your actual plan
 * via pluginOptions["usage-monitor"].tokenLimit in .henson/config.json or by
 * setting HENSON_USAGE_TOKEN_LIMIT in the environment.
 */
function tokenLimit(config?: ProjectConfig): { limit: number; source: "config" | "env" | "default" } {
  const fromConfig = config?.pluginOptions?.["usage-monitor"]?.tokenLimit;
  if (fromConfig && fromConfig > 0) return { limit: fromConfig, source: "config" };
  const raw = process.env.HENSON_USAGE_TOKEN_LIMIT;
  const fromEnv = raw ? Number(raw) : NaN;
  if (Number.isFinite(fromEnv) && fromEnv > 0) return { limit: fromEnv, source: "env" };
  return { limit: 5_000_000, source: "default" };
}

function windowHours(config?: ProjectConfig): number {
  const fromConfig = config?.pluginOptions?.["usage-monitor"]?.windowHours;
  if (fromConfig && fromConfig > 0) return fromConfig;
  const raw = process.env.HENSON_USAGE_WINDOW_HOURS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/**
 * Usage monitor: keeps the companion inside Claude Code session limits, so a
 * board can be left churning over hours/days (and in yolo mode) without
 * blowing the account's rolling-window budget.
 */
export const usageMonitorPlugin: Plugin = {
  id: "usage-monitor",
  name: "Claude usage monitor",
  description:
    "Tracks Claude Code token usage in the rolling session window and tells the companion whether it is safe to keep working.",

  tools(ctx) {
    return [
      {
        name: "check_usage_budget",
        description:
          "Report Claude Code token usage in the current rolling session window and whether it is safe to continue working. Call before starting a new ticket, especially in yolo mode.",
        inputSchema: {
          safetyMarginPercent: z
            .number()
            .min(0)
            .max(100)
            .optional()
            .describe("Stop when usage exceeds this percent of the limit. Default 85."),
        },
        async handler(args) {
          const margin = (args.safetyMarginPercent as number | undefined) ?? 85;
          const { limit, source: limitSource } = tokenLimit(ctx.config);
          const wh = windowHours(ctx.config);
          const [usage, weeklyUsage] = await Promise.all([
            usageInWindow(wh),
            usageInWindow(168),
          ]);
          const used = usage.billableTokens;
          const pct = limit > 0 ? (used / limit) * 100 : 0;
          const remaining = Math.max(0, limit - used);
          const safeToContinue = pct < margin;

          // Reset = when the oldest message in the window ages out of the rolling window.
          // If there are no messages, there's nothing to reset.
          const resetAt = usage.oldestMessageAt
            ? new Date(Date.parse(usage.oldestMessageAt) + wh * 3600_000).toISOString()
            : undefined;

          let recommendation: string;
          if (safeToContinue) {
            recommendation = ctx.config.yolo
              ? "Within budget — proceed to the next ticket."
              : "Within budget — safe to continue.";
          } else {
            const resetStr = resetAt ? new Date(resetAt).toLocaleTimeString() : "the end of the window";
            recommendation = `Budget nearly exhausted (${pct.toFixed(
              1,
            )}% of limit). Pause new work until the window resets around ${resetStr}.${
              ctx.config.yolo ? " In yolo mode: sleep until reset, then resume the board." : ""
            }`;
          }

          return {
            windowHours: wh,
            windowStart: usage.windowStart,
            resetAt,
            limit,
            limitSource,
            used,
            remaining,
            percentUsed: Number(pct.toFixed(1)),
            safetyMarginPercent: margin,
            safeToContinue,
            yolo: ctx.config.yolo,
            breakdown: {
              input: usage.inputTokens,
              output: usage.outputTokens,
              cacheCreation: usage.cacheCreationTokens,
              cacheRead: usage.cacheReadTokens,
              messages: usage.messages,
            },
            weeklyUsed: weeklyUsage.billableTokens,
            recommendation,
          };
        },
      },
    ];
  },
};
