import { requestUrl } from "obsidian";
import { LinearError, LinearIssue } from "./types";

const ENDPOINT = "https://api.linear.app/graphql";

const ISSUE_FIELDS = `
  identifier title url description priority priorityLabel updatedAt
  state { name type }
  assignee { name displayName }
  project { name }
  labels { nodes { name } }`;

const ISSUE_QUERY = `query Issue($id: String!) { issue(id: $id) {${ISSUE_FIELDS}} }`;

export const BATCH_SIZE = 100;

const BATCH_QUERY = `
query Issues($team: String!, $numbers: [Float!]) {
  issues(first: ${BATCH_SIZE}, filter: { team: { key: { eq: $team } }, number: { in: $numbers } }) {
    nodes {${ISSUE_FIELDS}}
  }
}`;

interface GraphQLError {
  message: string;
  extensions?: { code?: string };
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: GraphQLError[];
}

interface RawIssue extends Omit<LinearIssue, "assignee" | "project" | "labels"> {
  assignee: { name: string; displayName: string } | null;
  project: { name: string } | null;
  labels: { nodes: { name: string }[] };
}

/** Accounts created by email invite often have the address as `name`; the handle reads better then. */
function personName({ name, displayName }: { name: string; displayName: string }): string {
  if (name && !name.includes("@")) return name;
  return displayName
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toIssue(raw: RawIssue): LinearIssue {
  return {
    ...raw,
    assignee: raw.assignee ? personName(raw.assignee) : null,
    project: raw.project?.name ?? null,
    labels: raw.labels.nodes.map((label) => label.name),
  };
}

/** Throws LinearError for transport, auth and rate-limit failures; other GraphQL errors are returned to the caller. */
async function post<T>(
  apiKey: string | null,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ status: number; data: T | null; errors: GraphQLError[] }> {
  if (!apiKey) throw new LinearError("no-key", "No Linear API key configured");

  let status: number;
  let body: GraphQLResponse<T> | null;
  try {
    // requestUrl goes through Electron's net stack, so CORS never comes into it.
    const response = await requestUrl({
      url: ENDPOINT,
      method: "POST",
      contentType: "application/json",
      headers: { Authorization: apiKey },
      body: JSON.stringify({ query, variables }),
      throw: false,
    });
    status = response.status;
    body = response.json as GraphQLResponse<T> | null;
  } catch {
    throw new LinearError("network", "Couldn't reach Linear");
  }

  const errors = body?.errors ?? [];
  if (status === 401 || status === 403 || errors.some((e) => e.extensions?.code === "AUTHENTICATION_ERROR")) {
    throw new LinearError("auth", "Linear rejected the API key");
  }
  if (status === 429 || errors.some((e) => e.extensions?.code === "RATELIMITED")) {
    throw new LinearError("rate-limit", "Linear rate limit reached");
  }
  return { status, data: body?.data ?? null, errors };
}

/** Resolves to the issue, or null when Linear confirms it doesn't exist. */
export async function fetchIssue(apiKey: string | null, id: string): Promise<LinearIssue | null> {
  const { status, data, errors } = await post<{ issue?: RawIssue | null }>(apiKey, ISSUE_QUERY, { id });
  if (data?.issue) return toIssue(data.issue);
  if (status < 500 && (errors.length === 0 || errors.some((e) => /not found/i.test(e.message)))) return null;
  throw new LinearError("network", errors[0]?.message ?? `Linear returned ${status}`);
}

/**
 * One request for up to BATCH_SIZE tickets of a team. IDs missing from the result are
 * not necessarily absent from Linear: a ticket moved to another team still answers to
 * its old ID through fetchIssue, but not through this filter.
 */
export async function fetchIssues(apiKey: string | null, team: string, numbers: number[]): Promise<LinearIssue[]> {
  const { status, data, errors } = await post<{ issues?: { nodes: RawIssue[] } }>(apiKey, BATCH_QUERY, {
    team,
    numbers,
  });
  if (!data?.issues) throw new LinearError("network", errors[0]?.message ?? `Linear returned ${status}`);
  return data.issues.nodes.map(toIssue);
}
