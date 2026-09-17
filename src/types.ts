export interface LinearIssue {
  identifier: string;
  title: string;
  url: string;
  description: string | null;
  priority: number;
  priorityLabel: string;
  updatedAt: string;
  state: { name: string; type: string };
  assignee: string | null;
  project: string | null;
  labels: string[];
}

/** `issue: null` records a confirmed "no such ticket" so we don't re-ask on every hover. */
export interface CacheEntry {
  fetchedAt: number;
  issue: LinearIssue | null;
}

export type LinearErrorKind = "no-key" | "auth" | "rate-limit" | "network";

export class LinearError extends Error {
  constructor(public kind: LinearErrorKind, message: string) {
    super(message);
  }
}

export interface LinearTicketsSettings {
  workspaceSlug: string;
  teamKeys: string;
  apiKeySecret: string;
  openIn: "app" | "browser";
  hoverDelayMs: number;
  showDescription: boolean;
}

export const DEFAULT_SETTINGS: LinearTicketsSettings = {
  workspaceSlug: "",
  teamKeys: "",
  apiKeySecret: "",
  openIn: "browser",
  hoverDelayMs: 300,
  showDescription: true,
};

export const TICKET_CLASS = "linear-ticket";
export const TICKET_ATTR = "data-linear-ticket";
