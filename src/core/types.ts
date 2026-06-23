/** Core domain types for Henson. */

export const TICKET_STATES = [
  "backlog",
  "ready",
  "in-progress",
  "review",
  "done",
] as const;

export type TicketState = (typeof TICKET_STATES)[number];

export const TICKET_PRIORITIES = ["low", "medium", "high"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export interface Ticket {
  id: string;
  title: string;
  state: TicketState;
  priority: TicketPriority;
  assignee?: string;
  labels: string[];
  created: string;
  updated: string;
  /** Markdown description / acceptance criteria. */
  body: string;
}

export interface CompanionConfig {
  /** Randomly generated fun name, e.g. "Kermit the Compiler". */
  name: string;
  /** Emoji avatar. */
  avatar: string;
  /** Default agent-team recipe id used when delegating work. */
  recipe?: string;
}

export interface ProjectConfig {
  id: string;
  name: string;
  companion: CompanionConfig;
  /** Enabled plugin ids. */
  plugins: string[];
  /** When true the companion may work autonomously without per-step approval. */
  yolo: boolean;
  createdAt: string;
}

export interface RegistryEntry {
  id: string;
  name: string;
  /** Absolute path to the project root on disk. */
  path: string;
  createdAt: string;
}

export interface Registry {
  projects: RegistryEntry[];
}

export interface DocSummary {
  name: string;
  path: string;
  bytes: number;
  updated: string;
}

export interface MemorySummary {
  name: string;
  description?: string;
  type?: string;
}
