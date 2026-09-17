import { CacheEntry, InlineMode, LinearIssue, TICKET_ATTR, TICKET_CLASS } from "./types";

const TITLE_CHARS = 48;

export const CHIP_CLASS = "is-chip";
const DOT_CLASS = "has-dot";
const ID_CLASS = "linear-ticket-inline-id";
const TITLE_CLASS = "linear-ticket-inline-title";

/** What an inline preview shows for a ticket, or null when there's nothing to show yet. */
export interface InlineView {
  stateType: string;
  title: string | null;
}

export function inlineViewOf(entry: CacheEntry | undefined, mode: InlineMode): InlineView | null {
  if (mode === "off" || !entry?.issue) return null;
  return { stateType: entry.issue.state.type, title: mode === "title" ? shortTitle(entry.issue) : null };
}

// A generous cap; CSS ellipsis does the real fitting to the space available.
function shortTitle(issue: LinearIssue): string {
  const title = issue.title.replace(/`/g, "").replace(/\s+/g, " ").trim();
  return title.length <= TITLE_CHARS ? title : `${title.slice(0, TITLE_CHARS).trimEnd()}…`;
}

/** Class and attributes for a status-only ticket: the dot itself is drawn by CSS from these. */
export function dotAttributes(id: string, view: InlineView | null): { class: string; attributes: Record<string, string> } {
  const attributes: Record<string, string> = { [TICKET_ATTR]: id };
  if (view) attributes["data-state-type"] = view.stateType;
  return { class: view ? `${TICKET_CLASS} ${DOT_CLASS}` : TICKET_CLASS, attributes };
}

/** Fills `el` as a ticket, a status-only ticket or a full chip. Used for reading-view links and the editor's chip widget. */
export function renderTicket(el: HTMLElement, id: string, view: InlineView | null): void {
  const { class: cls, attributes } = dotAttributes(id, view);
  el.empty();
  el.removeAttribute("data-state-type");
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.classList.remove(DOT_CLASS, CHIP_CLASS);
  el.classList.add(...cls.split(" "));

  if (!view?.title) {
    el.setText(id);
    return;
  }
  el.classList.add(CHIP_CLASS);
  el.createSpan({ cls: ID_CLASS, text: id });
  el.createSpan({ cls: TITLE_CLASS, text: view.title });
}
