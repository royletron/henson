import type { z } from "zod";
import type { ProjectConfig } from "../core/types.js";

export interface PluginContext {
  projectRoot: string;
  config: ProjectConfig;
}

/** A tool a plugin contributes to the project's MCP server. */
export interface PluginTool {
  name: string;
  description: string;
  /** Zod raw shape (object of zod types) used to build the MCP input schema. */
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, unknown>, ctx: PluginContext) => Promise<unknown>;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  /** Tools this plugin exposes to agents over MCP. */
  tools?(ctx: PluginContext): PluginTool[];
}
