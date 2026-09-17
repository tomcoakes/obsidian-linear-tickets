import { requestUrl } from "obsidian";
import { LinearError, LinearIssue } from "./types";

const ENDPOINT = "https://api.linear.app/graphql";

const ISSUE_QUERY = `
query Issue($id: String!) {
  issue(id: $id) {
    identifier title url description priority priorityLabel updatedAt
    state { name type }
    assignee { name displayName }
    project { name }
    labels { nodes { name } }
  }
}`;

interface GraphQLResponse {
  data?: { issue?: RawIssue | null } | null;
  errors?: { message: string; extensions?: { code?: string; type?: string } }[];
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

/** Resolves to the issue, or null when Linear confirms it doesn't exist. */
export async function fetchIssue(apiKey: string | null, id: string): Promise<LinearIssue | null> {
  if (!apiKey) throw new LinearError("no-key", "No Linear API key configured");

  let status: number;
  let body: GraphQLResponse;
  try {
    // requestUrl goes through Electron's net stack, so Linear's lack of CORS headers doesn't matter.
    const response = await requestUrl({
      url: ENDPOINT,
      method: "POST",
      contentType: "application/json",
      headers: { Authorization: apiKey },
      body: JSON.stringify({ query: ISSUE_QUERY, variables: { id } }),
      throw: false,
    });
    status = response.status;
    body = response.json as GraphQLResponse;
  } catch {
    throw new LinearError("network", "Couldn't reach Linear");
  }

  if (status === 401 || status === 403) throw new LinearError("auth", "Linear rejected the API key");
  if (status === 429) throw new LinearError("rate-limit", "Linear rate limit reached");

  const issue = body?.data?.issue;
  if (issue) {
    return {
      ...issue,
      assignee: issue.assignee ? personName(issue.assignee) : null,
      project: issue.project?.name ?? null,
      labels: issue.labels.nodes.map((label) => label.name),
    };
  }

  const errors = body?.errors ?? [];
  if (errors.some((e) => e.extensions?.code === "AUTHENTICATION_ERROR")) {
    throw new LinearError("auth", "Linear rejected the API key");
  }
  if (errors.some((e) => e.extensions?.code === "RATELIMITED")) {
    throw new LinearError("rate-limit", "Linear rate limit reached");
  }
  if (status < 500 && (errors.length === 0 || errors.some((e) => /not found/i.test(e.message)))) {
    return null;
  }
  throw new LinearError("network", errors[0]?.message ?? `Linear returned ${status}`);
}
