import { z } from "zod";
import type { Plugin } from "../types.js";
import { usageInWindow } from "./usage.js";

/** Default billable-token ceiling per rolling window. Override with env. */
function tokenLimit(): number {
  const raw = process.env.HENSON_USAGE_TOKEN_LIMIT;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 2_000_000;
}

function windowHours(): number {
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
          const limit = tokenLimit();
          const usage = await usageInWindow(windowHours());
          const used = usage.billableTokens;
          const pct = limit > 0 ? (used / limit) * 100 : 0;
          const remaining = Math.max(0, limit - used);
          const safeToContinue = pct < margin;

          // When the window resets: windowStart + windowHours.
          const resetAt = new Date(
            Date.parse(usage.windowStart) + windowHours() * 3600_000,
          ).toISOString();

          let recommendation: string;
          if (safeToContinue) {
            recommendation = ctx.config.yolo
              ? "Within budget — proceed to the next ticket."
              : "Within budget — safe to continue.";
          } else {
            recommendation = `Budget nearly exhausted (${pct.toFixed(
              1,
            )}% of limit). Pause new work until the window resets around ${resetAt}.${
              ctx.config.yolo ? " In yolo mode: sleep until reset, then resume the board." : ""
            }`;
          }

          return {
            windowHours: usage.windowHours,
            windowStart: usage.windowStart,
            resetAt,
            limit,
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
            recommendation,
          };
        },
      },
    ];
  },
};
