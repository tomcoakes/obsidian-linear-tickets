import { TicketHost } from "./editor";
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

  for (const node of textNodes) {
    const text = node.data;
    const matches = [...text.matchAll(regex)];
    if (matches.length === 0) continue;

    const fragment = el.ownerDocument.createDocumentFragment();
    let cursor = 0;
    for (const match of matches) {
      fragment.append(text.slice(cursor, match.index));
      // No aria-label: Obsidian would turn it into its own tooltip on top of the hover card.
      fragment.createEl("a", {
        cls: TICKET_CLASS,
        text: match[0],
        href: host.urlFor(match[0]),
        attr: { [TICKET_ATTR]: match[0], target: "_blank", rel: "noopener" },
      });
      cursor = match.index + match[0].length;
    }
    fragment.append(text.slice(cursor));
    node.replaceWith(fragment);
  }
}
