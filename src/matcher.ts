export function parseTeamKeys(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((key) => key.trim().toUpperCase())
    .filter((key) => /^[A-Z][A-Z0-9]{0,9}$/.test(key));
}

/**
 * Global regex for bare ticket IDs, or null when no team keys are configured.
 * The lookbehind rejects IDs glued to a word, a URL path (`/issue/ENG-1`) or a
 * longer slug (`FOO-ENG-1`); markdown-level exclusions are the callers' job.
 */
export function buildTicketRegex(teamKeys: string[]): RegExp | null {
  if (teamKeys.length === 0) return null;
  return new RegExp(`(?<![\\w/-])(?:${teamKeys.join("|")})-\\d{1,6}\\b`, "g");
}

/** The desktop app's deep link is the web URL with `https://linear.app/` swapped for `linear://`. */
export function issueUrl(workspaceSlug: string, id: string, openIn: "app" | "browser"): string {
  const origin = openIn === "app" ? "linear://" : "https://linear.app/";
  return `${origin}${encodeURIComponent(workspaceSlug)}/issue/${id}`;
}
