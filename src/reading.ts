import { TicketHost } from "./editor";
import { inlineViewOf, renderTicket } from "./inline";
import { TICKET_ATTR, TICKET_CLASS } from "./types";

const SKIPPED_ANCESTORS = `a, code, pre, .tag, .frontmatter, .math, .${TICKET_CLASS}`;

/** Markdown post-processor body: wraps bare ticket IDs in rendered HTML with links. */
export function linkifyTickets(el: HTMLElement, host: TicketHost): void {
  const regex = host.getRegex();
  if (!regex || !el.textContent || el.textContent.search(regex) === -1) return;

  // Collect first: mutating while a TreeWalker is live skips nodes.
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.parentElement?.closest(SKIPPED_ANCESTORS)) textNodes.push(node);
  }

  const mode = host.inlineMode();
  const seen = new Set<string>();

  for (const node of textNodes) {
    const text = node.data;
    const matches = [...text.matchAll(regex)];
    if (matches.length === 0) continue;

    const fragment = el.ownerDocument.createDocumentFragment();
    let cursor = 0;
    for (const match of matches) {
      fragment.append(text.slice(cursor, match.index));
      // No aria-label: Obsidian would turn it into its own tooltip on top of the hover card.
      const link = fragment.createEl("a", {
        href: host.urlFor(match[0]),
        attr: { target: "_blank", rel: "noopener" },
      });
      renderTicket(link, match[0], inlineViewOf(host.peek(match[0]), mode));
      seen.add(match[0]);
      cursor = match.index + match[0].length;
    }
    fragment.append(text.slice(cursor));
    node.replaceWith(fragment);
  }

  if (mode !== "off") host.ensure(seen);
}

/**
 * Repaints already-rendered links: the given tickets when their data arrives, or all of them
 * (`ids` null) when settings change. Covers Live Preview's embedded renders (tables, callouts)
 * as well as reading view, which re-rendering a view's preview alone does not.
 */
export function refreshLinks(root: HTMLElement, ids: Set<string> | null, host: TicketHost): void {
  const mode = host.inlineMode();
  root.querySelectorAll<HTMLElement>(`a.${TICKET_CLASS}`).forEach((link) => {
    const id = link.getAttribute(TICKET_ATTR);
    if (!id || (ids && !ids.has(id))) return;
    link.setAttribute("href", host.urlFor(id));
    renderTicket(link, id, inlineViewOf(host.peek(id), mode));
  });
}
